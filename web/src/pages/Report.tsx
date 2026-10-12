import { useEffect, useRef, useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { ReportCard } from '../components/ReportCard'
import { AddressChip } from '../components/AddressChip'
import { TxStatus } from '../components/TxStatus'
import { useCase, useDeskInfo } from '../hooks/useDesk'
import { useDeployment, useExplorer } from '../hooks/useDeployment'
import { useEnsureChain } from '../hooks/useEnsureChain'
import { useTx } from '../hooks/useTx'
import { Status, statusLabel } from '../lib/cases'
import { caseNumber, claimSentence, commas, formatAmount, formatDuration, kindName, shareText, utcDateTime, verdictWord } from '../lib/format'
import { settings } from '../config'
import { href } from '../router'
import { describeError } from '../lib/errors'

export function Report({ id }: { id: bigint }) {
  const d = useDeployment()
  const explorer = useExplorer()
  const { address, isConnected } = useAccount()
  const { wrongChain } = useEnsureChain()
  const desk = useDeskInfo()
  const { data: c, failed, isLoading, error, refetch } = useCase(id)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const t = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => window.clearInterval(t)
  }, [])

  // The stamp drops when a verdict lands while this page is open.
  const previousStatus = useRef<Status | undefined>(undefined)
  const [animate, setAnimate] = useState(false)
  useEffect(() => {
    if (!c) return
    const answeredNow = c.status === Status.Answered || c.status === Status.Filed
    if (previousStatus.current === Status.Open && answeredNow) setAnimate(true)
    previousStatus.current = c.status
  }, [c])

  const fileTx = useTx(async () => {
    await refetch()
  })
  const dropTx = useTx(async () => {
    await refetch()
  })

  const tokenUri = useReadContract({
    abi: d.abis.SnitchReports,
    address: desk.reports,
    functionName: 'tokenURI',
    args: [id],
    query: { enabled: !!desk.reports && c?.status === Status.Filed },
  })

  if (error) {
    return (
      <p className="tx tx--error" role="alert">
        Unable to read case No. {caseNumber(id)}: {describeError(error)}
      </p>
    )
  }
  if (isLoading || !c) return <p role="status">Reading case No. {caseNumber(id)}…</p>
  if (c.status === Status.None) {
    return (
      <>
        <h1 className="h-page">No case No. {caseNumber(id)}</h1>
        <p className="empty">
          Case numbers start at 1 and count up. <a href={href({ name: 'cases' })}>See every case file</a>.
        </p>
      </>
    )
  }

  const answered = c.status === Status.Answered || c.status === Status.Filed
  const isOpener = !!address && address.toLowerCase() === c.opener.toLowerCase()
  const droppableAt = Number(c.openedAt) + settings.dropDelaySeconds
  const canDropByTime = now >= droppableAt
  const canDrop = c.status === Status.Open && isOpener && (failed || canDropByTime)
  const shareUrl = window.location.href
  const text = shareText({ id: c.id, wallet: c.wallet, kind: c.kind, symbol: c.symbol, verdict: c.verdict, agreed: c.agreed, panelSize: c.panelSize })
  const xHref = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`
  const uri = typeof tokenUri.data === 'string' ? tokenUri.data : undefined
  const onChainImage = uri ? decodeImage(uri) : undefined

  return (
    <article className="report">
      <h1 className="h-page">Case file No. {caseNumber(c.id)}</h1>
      <div className="report__grid">
        <ReportCard c={c} animateStamp={animate} />
        <div className="report__facts">
          <p className="claim">{claimSentence(c)}.</p>
          <dl className="facts">
            <dt>Status</dt>
            <dd>
              {statusLabel[c.status]}
              {c.status === Status.Open && failed && ' (the oracle reported a failure; the opener can drop it now)'}
            </dd>
            <dt>Verdict</dt>
            <dd>
              {answered ? (
                <span className={`verdict verdict--${c.verdict ? 'clean' : 'snitched'}`}>{verdictWord(c.verdict)}</span>
              ) : c.status === Status.Dropped ? (
                'None. The case was dropped.'
              ) : (
                'Pending. The swarm usually answers within minutes.'
              )}
            </dd>
            {answered && (
              <>
                <dt>Panel</dt>
                <dd>
                  Checked by {c.panelSize} agents. {c.agreed} agreed. Quorum asked: {c.askedQuorum} of {c.askedPanelSize}.
                </dd>
                <dt>Figure</dt>
                <dd className="mono">{commas(c.figure)} units of {c.symbol} (smallest unit, as the oracle reports it)</dd>
                <dt>Stamped</dt>
                <dd className="mono">{utcDateTime(c.issuedAt)}</dd>
              </>
            )}
            <dt>Kind</dt>
            <dd>{kindName(c.kind)}</dd>
            <dt>Wallet</dt>
            <dd>
              <AddressChip address={c.wallet} full />
            </dd>
            <dt>Token</dt>
            <dd>
              {c.symbol} <AddressChip address={c.token} full />
            </dd>
            <dt>Blocks</dt>
            <dd className="mono">
              <a href={explorer.block(c.fromBlock)} target="_blank" rel="noopener noreferrer">
                {commas(c.fromBlock)}
              </a>{' '}
              to{' '}
              <a href={explorer.block(c.toBlock)} target="_blank" rel="noopener noreferrer">
                {commas(c.toBlock)}
              </a>
            </dd>
            <dt>Opened</dt>
            <dd className="mono">{utcDateTime(c.openedAt)}</dd>
            <dt>Opener</dt>
            <dd>
              <AddressChip address={c.opener} full />
            </dd>
            <dt>Case fee</dt>
            <dd>
              {formatAmount(c.fee)} SNITCH {answered ? '(burned)' : c.status === Status.Dropped ? '(refunded)' : '(held by the desk)'}
            </dd>
            {c.status === Status.Filed && desk.reports && (
              <>
                <dt>Report NFT</dt>
                <dd>
                  <a href={explorer.token(desk.reports, c.id)} target="_blank" rel="noopener noreferrer">
                    Snitch Reports #{c.id.toString()} on Etherscan
                  </a>
                </dd>
              </>
            )}
          </dl>

          {answered && (
            <a className="btn" href={xHref} target="_blank" rel="noopener noreferrer">
              Post it on X
            </a>
          )}

          <section className="actions" aria-labelledby="case-actions">
            <h2 id="case-actions" className="h-small">
              Actions
            </h2>
            {fileTx.walletStatus && <p className="hint" role="status">{fileTx.walletStatus}</p>}
            {c.status === Status.Answered && (
              <div className="action">
                <p>Anyone can file an answered case. The report NFT is minted to the opener.</p>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={!fileTx.ready || fileTx.busy}
                  onClick={() => fileTx.send({ abi: d.abis.SnitchDesk, address: d.addresses.SnitchDesk, functionName: 'fileReport', args: [c.id] })}
                >
                  {fileTx.busy ? 'Filing…' : 'File the report'}
                </button>
                {!isConnected && <p className="hint">Connect a wallet to file.</p>}
                {wrongChain && <p className="hint">Switch the wallet to {d.network?.name ?? 'the configured chain'} to file.</p>}
                <TxStatus state={fileTx.state} doneText="Filed. The report NFT is minted." />
              </div>
            )}
            {c.status === Status.Open && (
              <div className="action">
                {isOpener ? (
                  <>
                    <p>
                      {failed
                        ? 'The oracle reported a failure for this case. You can drop it now and get the SNITCH fee back.'
                        : canDropByTime
                          ? 'No answer in 72 hours. You can drop the case and get the SNITCH fee back. The IMD paid to the oracle is not refunded.'
                          : `Drop the case after 72 hours without an answer: available in ${formatDuration(droppableAt - now)}.`}
                    </p>
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={!canDrop || !dropTx.ready || dropTx.busy}
                      onClick={() => dropTx.send({ abi: d.abis.SnitchDesk, address: d.addresses.SnitchDesk, functionName: 'dropCase', args: [c.id] })}
                    >
                      {dropTx.busy ? 'Dropping…' : 'Drop the case'}
                    </button>
                    <TxStatus state={dropTx.state} doneText="Dropped. The SNITCH fee is refunded." />
                  </>
                ) : (
                  <p>Only the opener can drop this case, after 72 hours without an answer.</p>
                )}
              </div>
            )}
            {c.status === Status.Filed && <p>Filed. Nothing more to do.</p>}
            {c.status === Status.Dropped && <p>Dropped. The SNITCH fee went back to the opener.</p>}
          </section>

          {onChainImage && (
            <details className="disclosure">
              <summary>On-chain image from SnitchReports.tokenURI</summary>
              <img className="onchain" src={onChainImage} alt={`On-chain report card for case ${caseNumber(c.id)}`} />
            </details>
          )}
        </div>
      </div>
    </article>
  )
}

function decodeImage(uri: string): string | undefined {
  try {
    const prefix = 'data:application/json;base64,'
    if (!uri.startsWith(prefix)) return undefined
    const json = JSON.parse(atob(uri.slice(prefix.length))) as { image?: string }
    return typeof json.image === 'string' && json.image.startsWith('data:image/svg+xml;base64,') ? json.image : undefined
  } catch {
    return undefined
  }
}
