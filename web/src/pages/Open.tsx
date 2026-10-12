import { useEffect, useId, useRef, useState } from 'react'
import { useAccount, useBlockNumber, usePublicClient } from 'wagmi'
import { decodeEventLog, erc20Abi, type Address } from 'viem'
import { TxStatus } from '../components/TxStatus'
import { useDeployment } from '../hooks/useDeployment'
import { useDeskInfo, useTokenPosition } from '../hooks/useDesk'
import { useEnsureChain } from '../hooks/useEnsureChain'
import { useTx } from '../hooks/useTx'
import { defaultRange, findDeploymentBlock, parseBlock } from '../lib/blocks'
import { commas, formatAmount, isValidAddress, checksum } from '../lib/format'
import { href, navigate } from '../router'
import { describeError } from '../lib/errors'

type Errors = Partial<Record<'token' | 'wallet' | 'fromBlock' | 'toBlock', string>>

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`the RPC took longer than ${Math.round(ms / 1000)} s`)), ms)
    promise.then(
      (v) => {
        window.clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        window.clearTimeout(timer)
        reject(e)
      },
    )
  })
}

export function Open({ initialKind }: { initialKind?: number }) {
  const d = useDeployment()
  const client = usePublicClient()
  const { address, isConnected } = useAccount()
  const { wrongChain, chainName } = useEnsureChain()
  const desk = useDeskInfo()
  const { data: latestBlock } = useBlockNumber({ watch: true })
  const pair = d.network?.pairToken
  const snitch = useTokenPosition(d.addresses.LaunchToken, d.addresses.SnitchDesk)
  const imd = useTokenPosition(pair?.address, d.addresses.SnitchDesk)

  const [kind, setKind] = useState<number>(initialKind ?? 0)
  useEffect(() => {
    if (initialKind !== undefined) setKind(initialKind)
  }, [initialKind])
  const [token, setToken] = useState('')
  const [wallet, setWallet] = useState('')
  const [fromBlock, setFromBlock] = useState('')
  const [toBlock, setToBlock] = useState('')
  const [rangeNote, setRangeNote] = useState<string>('')
  const [finding, setFinding] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const ids = { token: useId(), wallet: useId(), from: useId(), to: useId() }
  const firstInvalid = useRef<HTMLInputElement | null>(null)
  const rangeEdited = useRef({ from: false, to: false })

  function setDefaultRange(range: { fromBlock: bigint; toBlock: bigint }) {
    if (!rangeEdited.current.from) setFromBlock(range.fromBlock.toString())
    if (!rangeEdited.current.to) setToBlock(range.toBlock.toString())
  }

  // Default range: the token's deployment block (binary search on eth_getCode), else the last 30 days, to the latest block.
  // The search reads the latest block itself: depending on the live block number here would cancel
  // the search every time a new block arrives.
  const lastSearched = useRef<string>('')
  useEffect(() => {
    const t = token.trim()
    if (!client || !isValidAddress(t)) return
    const key = t.toLowerCase()
    if (lastSearched.current === key) return
    lastSearched.current = key
    let cancelled = false
    setFinding(true)
    setRangeNote('')
    ;(async () => {
      let latest: bigint | undefined
      try {
        latest = await client.getBlockNumber()
        const deployment = await withTimeout(findDeploymentBlock(client, t as Address, latest), 45_000)
        if (cancelled) return
        const range = defaultRange(latest, deployment)
        setDefaultRange(range)
        setRangeNote(
          deployment !== undefined
            ? `Default window: from the token's deployment block ${commas(deployment)} to the latest block ${commas(latest)}.`
            : `This address has no contract code at the latest block, so the desk will refuse it. Default window: the last ~30 days.`,
        )
      } catch (e) {
        if (cancelled) return
        if (latest !== undefined) {
          const range = defaultRange(latest, undefined)
          setDefaultRange(range)
        }
        setRangeNote(`Unable to find the deployment block (${describeError(e)}). Default window: the last ~30 days.`)
      } finally {
        if (!cancelled) setFinding(false)
      }
    })()
    return () => {
      cancelled = true
      if (lastSearched.current === key) lastSearched.current = ''
    }
  }, [token, client])

  const fee = desk.caseFee
  const price = desk.oraclePrice
  const needSnitchApproval = fee !== undefined && snitch.allowance !== undefined ? snitch.allowance < fee : undefined
  const needImdApproval = price !== undefined && imd.allowance !== undefined ? imd.allowance < price : undefined
  const unknownAllowance = (error: unknown) => !isConnected ? 'Connect a wallet' : wrongChain ? 'Wrong network' : error ? 'Allowance unavailable' : 'Checking allowance…'
  const snitchShort = fee !== undefined && snitch.balance !== undefined && snitch.balance < fee
  const imdShort = price !== undefined && imd.balance !== undefined && imd.balance < price

  const approveSnitch = useTx(async () => {
    await snitch.refetch()
  })
  const approveImd = useTx(async () => {
    await imd.refetch()
  })
  const [openedId, setOpenedId] = useState<bigint | null>(null)
  const open = useTx(async (receipt) => {
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== d.addresses.SnitchDesk.toLowerCase()) continue
      try {
        const parsed = decodeEventLog({ abi: d.abis.SnitchDesk, data: log.data, topics: log.topics })
        if (parsed.eventName === 'CaseOpened') {
          const caseId = (parsed.args as unknown as { caseId: bigint }).caseId
          setOpenedId(caseId)
          navigate({ name: 'report', id: caseId })
        }
      } catch {
        // not a desk event
      }
    }
    await Promise.all([snitch.refetch(), imd.refetch(), desk.refetch()])
  })

  function validate(): { token: Address; wallet: Address; fromBlock: bigint; toBlock: bigint } | null {
    const next: Errors = {}
    const t = token.trim()
    const w = wallet.trim()
    const f = parseBlock(fromBlock)
    const to = parseBlock(toBlock)
    if (!isValidAddress(t)) next.token = 'Enter the token contract address as 0x followed by 40 hex characters.'
    if (!isValidAddress(w)) next.wallet = 'Enter the wallet address as 0x followed by 40 hex characters.'
    else if (/^0x0{40}$/.test(w)) next.wallet = 'Use a real wallet, not the zero address.'
    if (f === undefined) next.fromBlock = 'Enter the first block number as digits.'
    if (to === undefined) next.toBlock = 'Enter the last block number as digits.'
    if (f !== undefined && to !== undefined) {
      if (f >= to) next.toBlock = 'Use a to block higher than the from block.'
      else if (latestBlock && to > latestBlock) next.toBlock = `Use a to block at or below the latest block, ${commas(latestBlock)}.`
    }
    setErrors(next)
    if (Object.keys(next).length) {
      const order: (keyof Errors)[] = ['token', 'wallet', 'fromBlock', 'toBlock']
      const first = order.find((k) => next[k])
      const el = document.getElementById(first === 'token' ? ids.token : first === 'wallet' ? ids.wallet : first === 'fromBlock' ? ids.from : ids.to) as HTMLInputElement | null
      el?.focus()
      firstInvalid.current = el
      return null
    }
    return { token: checksum(t), wallet: checksum(w), fromBlock: f!, toBlock: to! }
  }

  const [submitError, setSubmitError] = useState<string | null>(null)
  /** Why the opening cannot be sent yet, in the order the steps fix it. */
  function blocker(): string | null {
    if (fee === undefined || price === undefined) return 'The fee and oracle price are still loading. Try again in a moment.'
    if (needSnitchApproval === undefined || needImdApproval === undefined) return 'Both allowances must be read successfully before opening a case. Wait for the checks or retry them.'
    if (snitchShort) return `This wallet holds ${formatAmount(snitch.balance)} SNITCH; the case fee is ${formatAmount(fee)} SNITCH.`
    if (imdShort) return `This wallet holds ${formatAmount(imd.balance)} ${pair?.symbol ?? 'IMD'}; the oracle price is ${formatAmount(price)} ${pair?.symbol ?? 'IMD'}.`
    if (needSnitchApproval !== false) return 'Approve the SNITCH fee first (step 1).'
    if (needImdApproval !== false) return `Approve the ${pair?.symbol ?? 'IMD'} oracle price first (step 2).`
    return null
  }

  return (
    <>
      <h1 className="h-page">Open a case</h1>
      <p className="lede">Pick the claim, the token, the wallet and the window. The swarm reads the chain and stamps the answer on chain.</p>

      <form
        className="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          setSubmitError(null)
          const v = validate()
          if (!v) return
          const why = blocker()
          if (why || fee === undefined || price === undefined) {
            setSubmitError(why)
            return
          }
          open.send({
            abi: d.abis.SnitchDesk,
            address: d.addresses.SnitchDesk,
            functionName: 'openCaseWithLimits',
            args: [kind, v.token, v.wallet, v.fromBlock, v.toBlock, fee, price],
          })
        }}
      >
        <fieldset className="kinds">
          <legend className="h-small">Case kind</legend>
          <div className="tabs" role="group">
            <label className={`tab${kind === 0 ? ' tab--active' : ''}`}>
              <input type="radio" name="kind" value="0" checked={kind === 0} onChange={() => setKind(0)} />
              <span className="tab__title">Never sold</span>
              <span className="tab__body">The wallet sent zero of the token in the window.</span>
            </label>
            <label className={`tab${kind === 1 ? ' tab--active' : ''}`}>
              <input type="radio" name="kind" value="1" checked={kind === 1} onChange={() => setKind(1)} />
              <span className="tab__title">Got in early</span>
              <span className="tab__body">The wallet received the token in the window.</span>
            </label>
          </div>
        </fieldset>

        <div className="field">
          <label htmlFor={ids.token}>Token contract</label>
          <input id={ids.token} name="token" type="text" inputMode="text" autoComplete="off" spellCheck={false} placeholder="0x6982508145454ce325ddbe47a25d4ec3d2311933" value={token} onChange={(e) => {
            if (e.target.value.trim().toLowerCase() !== token.trim().toLowerCase()) rangeEdited.current = { from: false, to: false }
            setToken(e.target.value)
          }} aria-invalid={!!errors.token} aria-describedby={errors.token ? `${ids.token}-error` : `${ids.token}-hint`} />
          <p id={`${ids.token}-hint`} className="hint">
            An ERC-20 with code on {chainName}. {finding ? 'Looking up its deployment block…' : rangeNote}
          </p>
          {errors.token && (
            <p id={`${ids.token}-error`} className="error">
              {errors.token}
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor={ids.wallet}>Wallet</label>
          <input id={ids.wallet} name="wallet" type="text" inputMode="text" autoComplete="off" spellCheck={false} placeholder="0x8f3a…" value={wallet} onChange={(e) => setWallet(e.target.value)} aria-invalid={!!errors.wallet} aria-describedby={errors.wallet ? `${ids.wallet}-error` : undefined} />
          {errors.wallet && (
            <p id={`${ids.wallet}-error`} className="error">
              {errors.wallet}
            </p>
          )}
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor={ids.from}>From block</label>
            <input id={ids.from} name="fromBlock" type="text" inputMode="numeric" autoComplete="off" className="mono" placeholder="21004118" value={fromBlock} onChange={(e) => { rangeEdited.current.from = true; setFromBlock(e.target.value) }} aria-invalid={!!errors.fromBlock} aria-describedby={errors.fromBlock ? `${ids.from}-error` : undefined} />
            {errors.fromBlock && (
              <p id={`${ids.from}-error`} className="error">
                {errors.fromBlock}
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor={ids.to}>To block</label>
            <input id={ids.to} name="toBlock" type="text" inputMode="numeric" autoComplete="off" className="mono" placeholder={latestBlock ? latestBlock.toString() : '21077903'} value={toBlock} onChange={(e) => { rangeEdited.current.to = true; setToBlock(e.target.value) }} aria-invalid={!!errors.toBlock} aria-describedby={errors.toBlock ? `${ids.to}-error` : `${ids.to}-hint`} />
            <p id={`${ids.to}-hint`} className="hint">
              Latest block: <span className="mono">{latestBlock ? commas(latestBlock) : '…'}</span>
            </p>
            {errors.toBlock && (
              <p id={`${ids.to}-error`} className="error">
                {errors.toBlock}
              </p>
            )}
          </div>
        </div>

        <section className="cost" aria-labelledby="cost-head">
          <h2 id="cost-head" className="h-small">
            What this case costs
          </h2>
          <dl className="facts facts--tight">
            <dt>Case fee (burns on an answer)</dt>
            <dd className="mono">{fee !== undefined ? `${formatAmount(fee)} SNITCH` : desk.error ? 'unavailable' : '…'}</dd>
            <dt>Oracle price (paid to the IMD Intake)</dt>
            <dd className="mono">
              {price !== undefined ? `${formatAmount(price)} ${pair?.symbol ?? 'IMD'}` : desk.oraclePriceError ? 'unavailable from the intake' : '…'}
            </dd>
            {isConnected && !wrongChain && (
              <>
                <dt>Your SNITCH</dt>
                <dd className="mono">
                  {formatAmount(snitch.balance)} SNITCH{snitchShort && ' (not enough)'}
                </dd>
                <dt>Your {pair?.symbol ?? 'IMD'}</dt>
                <dd className="mono">
                  {formatAmount(imd.balance)} {pair?.symbol ?? 'IMD'}
                  {imdShort && ' (not enough)'}
                </dd>
              </>
            )}
          </dl>
          <p className="hint">USD context is unavailable: this site reads no price feed. Amounts are shown in token units.</p>
          {(snitchShort || imdShort) && (
            <p className="hint">
              Short on {snitchShort ? 'SNITCH' : pair?.symbol}? <a href={href({ name: 'trade' })}>Trade SNITCH in the pool</a>.
            </p>
          )}
        </section>

        <section className="stepper" aria-label="Steps">
          {!isConnected && <p className="hint">Connect a wallet (top of the page) to approve and open.</p>}
          {isConnected && wrongChain && <p className="hint">Switch the wallet to {chainName} (top of the page) to continue.</p>}
          {open.walletStatus && <p className="hint" role="status">{open.walletStatus}</p>}
          {(snitch.allowanceError || imd.allowanceError) && <p className="error" role="alert">Unable to read allowances. <button type="button" className="btn btn--small" onClick={() => Promise.all([snitch.refetch(), imd.refetch()])}>Retry allowance checks</button></p>}

          <div className="action">
            <h3 className="h-small">1. Approve the SNITCH fee</h3>
            <button
              type="button"
              className="btn"
              disabled={!approveSnitch.ready || needSnitchApproval !== true || approveSnitch.busy}
              onClick={() => approveSnitch.send({ abi: erc20Abi, address: d.addresses.LaunchToken, functionName: 'approve', args: [d.addresses.SnitchDesk, fee!] })}
            >
              {approveSnitch.busy ? 'Approving…' : needSnitchApproval === undefined ? unknownAllowance(snitch.allowanceError) : needSnitchApproval === false ? 'SNITCH approved' : `Approve ${formatAmount(fee)} SNITCH`}
            </button>
            <TxStatus state={approveSnitch.state} doneText="SNITCH approved for exactly the case fee." />
          </div>

          <div className="action">
            <h3 className="h-small">2. Approve the {pair?.symbol ?? 'IMD'} oracle price</h3>
            <button
              type="button"
              className="btn"
              disabled={!approveImd.ready || !pair || needImdApproval !== true || approveImd.busy}
              onClick={() => pair && approveImd.send({ abi: erc20Abi, address: pair.address, functionName: 'approve', args: [d.addresses.SnitchDesk, price!] })}
            >
              {approveImd.busy ? 'Approving…' : needImdApproval === undefined ? unknownAllowance(imd.allowanceError) : needImdApproval === false ? `${pair?.symbol ?? 'IMD'} approved` : `Approve ${formatAmount(price)} ${pair?.symbol ?? 'IMD'}`}
            </button>
            <TxStatus state={approveImd.state} doneText={`${pair?.symbol ?? 'IMD'} approved for exactly the oracle price.`} />
          </div>

          <div className="action">
            <h3 className="h-small">3. Open the case</h3>
            <p className="hint">
              Sends openCaseWithLimits with the quoted fee and price as caps, so a change mined first reverts instead of charging more.
            </p>
            <button type="submit" className="btn btn--primary" disabled={!open.ready || needSnitchApproval === undefined || needImdApproval === undefined || open.busy}>
              {open.busy ? 'Opening…' : 'Open the case'}
            </button>
            {submitError && (
              <p className="error" role="alert">
                {submitError}
              </p>
            )}
            <TxStatus state={open.state} doneText={openedId !== null ? `Case No. ${openedId.toString()} opened.` : 'Opened.'} />
          </div>
        </section>
      </form>
      {address && (
        <p className="hint">
          Follow your cases in <a href={href({ name: 'cases' })}>Case files</a>: Open, Answered, Filed. File the report once answered; drop the case after 72 hours without an answer.
        </p>
      )}
    </>
  )
}
