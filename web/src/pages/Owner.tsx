import { useId, useState } from 'react'
import { useAccount } from 'wagmi'
import { parseUnits, stringToHex, type Hex } from 'viem'
import { TxStatus } from '../components/TxStatus'
import { AddressChip } from '../components/AddressChip'
import { useDeployment } from '../hooks/useDeployment'
import { useDeskInfo } from '../hooks/useDesk'
import { useEnsureChain } from '../hooks/useEnsureChain'
import { useTx } from '../hooks/useTx'
import { formatAmount, isValidAddress, checksum } from '../lib/format'

/** The owner's setup panel: one control per owner setting of SnitchDesk. */
export function Owner() {
  const d = useDeployment()
  const desk = useDeskInfo()
  const { address, isConnected } = useAccount()
  const { wrongChain, chainName } = useEnsureChain()
  const isOwner = !!address && !!desk.owner && address.toLowerCase() === desk.owner.toLowerCase()
  const ids = { fee: useId(), size: useId(), quorum: useId(), intake: useId(), action: useId(), signer: useId(), hook: useId() }
  const [fee, setFee] = useState('')
  const [size, setSize] = useState('')
  const [quorum, setQuorum] = useState('')
  const [intake, setIntake] = useState('')
  const [action, setAction] = useState('')
  const [signer, setSigner] = useState('')
  const [hook, setHook] = useState<boolean | null>(null)
  const refresh = async () => {
    await desk.refetch()
  }
  const feeTx = useTx(refresh)
  const panelTx = useTx(refresh)
  const intakeTx = useTx(refresh)
  const actionTx = useTx(refresh)
  const signerTx = useTx(refresh)
  const hookTx = useTx(refresh)
  const can = isConnected && !wrongChain && isOwner && feeTx.ready
  const deskArgs = { abi: d.abis.SnitchDesk, address: d.addresses.SnitchDesk } as const

  const actionText = desk.action ? decodeAction(desk.action) : ''

  return (
    <>
      <h1 className="h-page">Owner settings</h1>
      <p className="lede">
        Settings bind cases opened from now on. Every value has a launch default, so nothing here is required for the desk to work.
      </p>
      <dl className="facts facts--tight">
        <dt>Owner</dt>
        <dd>{desk.owner ? <AddressChip address={desk.owner} full /> : '…'}</dd>
        <dt>Signed in as</dt>
        <dd>{address ? <AddressChip address={address} full /> : 'not connected'}</dd>
      </dl>
      {!isConnected && <p className="hint">Connect the owner wallet to change settings.</p>}
      {isConnected && wrongChain && <p className="hint">Switch the wallet to {chainName} to change settings.</p>}
      {feeTx.walletStatus && <p className="hint" role="status">{feeTx.walletStatus}</p>}
      {isConnected && !wrongChain && !isOwner && (
        <p className="tx tx--error" role="status">
          This wallet is not the owner. The controls below are read-only for it.
        </p>
      )}

      <div className="owner-grid">
        <form className="action" onSubmit={(e) => { e.preventDefault(); feeTx.send({ ...deskArgs, functionName: 'setCaseFee', args: [parseUnits(fee || '0', 18)] }) }}>
          <h2 className="h-small">Case fee</h2>
          <p className="hint">
            Now <span className="mono">{formatAmount(desk.caseFee)} SNITCH</span>. Whole SNITCH or decimals; at most 2^128 − 1 base units.
          </p>
          <label htmlFor={ids.fee}>New case fee (SNITCH)</label>
          <input id={ids.fee} className="mono" type="text" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="200000" />
          <button type="submit" className="btn" disabled={!can || !fee.trim() || feeTx.busy}>
            {feeTx.busy ? 'Setting…' : 'Set case fee'}
          </button>
          <TxStatus state={feeTx.state} doneText="Case fee updated." />
        </form>

        <form className="action" onSubmit={(e) => { e.preventDefault(); panelTx.send({ ...deskArgs, functionName: 'setPanel', args: [Number(size), Number(quorum)] }) }}>
          <h2 className="h-small">Panel</h2>
          <p className="hint">
            Now {desk.panelSize ?? '…'} agents, quorum {desk.quorum ?? '…'}. Use 2 ≤ quorum ≤ size ≤ 100.
          </p>
          <div className="field-row">
            <div className="field">
              <label htmlFor={ids.size}>Panel size</label>
              <input id={ids.size} className="mono" type="text" inputMode="numeric" value={size} onChange={(e) => setSize(e.target.value)} placeholder="12" />
            </div>
            <div className="field">
              <label htmlFor={ids.quorum}>Quorum</label>
              <input id={ids.quorum} className="mono" type="text" inputMode="numeric" value={quorum} onChange={(e) => setQuorum(e.target.value)} placeholder="8" />
            </div>
          </div>
          <button type="submit" className="btn" disabled={!can || !/^\d+$/.test(size) || !/^\d+$/.test(quorum) || panelTx.busy}>
            {panelTx.busy ? 'Setting…' : 'Set panel'}
          </button>
          <TxStatus state={panelTx.state} doneText="Panel updated." />
        </form>

        <form className="action" onSubmit={(e) => { e.preventDefault(); if (hook !== null) hookTx.send({ ...deskArgs, functionName: 'setFailureHook', args: [hook] }) }}>
          <h2 className="h-small">Failure hook</h2>
          <p className="hint">
            Now {desk.failureHook === undefined ? '…' : desk.failureHook ? 'on' : 'off'}. On: a refused body or a panel that does not agree frees the case at once (version 2 intake only).
          </p>
          <div className="field">
            <label className="check">
              <input id={ids.hook} type="checkbox" checked={hook ?? desk.failureHook ?? false} onChange={(e) => setHook(e.target.checked)} />
              Ask the intake for failure notices
            </label>
          </div>
          <button type="submit" className="btn" disabled={!can || hook === null || hook === desk.failureHook || hookTx.busy}>
            {hookTx.busy ? 'Setting…' : 'Set failure hook'}
          </button>
          <TxStatus state={hookTx.state} doneText="Failure hook updated." />
        </form>

        <form className="action" onSubmit={(e) => { e.preventDefault(); if (isValidAddress(intake.trim())) intakeTx.send({ ...deskArgs, functionName: 'setIntake', args: [checksum(intake.trim())] }) }}>
          <h2 className="h-small">Intake</h2>
          <p className="hint">Now {desk.intake ? <AddressChip address={desk.intake} /> : '…'}. Binds cases opened afterwards; open cases stay with the intake they were asked at.</p>
          <label htmlFor={ids.intake}>New intake address</label>
          <input id={ids.intake} className="mono" type="text" value={intake} onChange={(e) => setIntake(e.target.value)} placeholder="0x…" spellCheck={false} />
          <button type="submit" className="btn" disabled={!can || !isValidAddress(intake.trim()) || intakeTx.busy}>
            {intakeTx.busy ? 'Setting…' : 'Set intake'}
          </button>
          <TxStatus state={intakeTx.state} doneText="Intake updated." />
        </form>

        <form className="action" onSubmit={(e) => { e.preventDefault(); actionTx.send({ ...deskArgs, functionName: 'setAction', args: [encodeAction(action)] }) }}>
          <h2 className="h-small">Oracle action</h2>
          <p className="hint">
            Now <span className="mono">{actionText || desk.action || '…'}</span>. Text is stored as bytes32 (up to 32 ASCII characters), or paste a 0x bytes32 value.
          </p>
          <label htmlFor={ids.action}>New action id</label>
          <input id={ids.action} className="mono" type="text" value={action} onChange={(e) => setAction(e.target.value)} placeholder="oracle.request@oracle-1" spellCheck={false} />
          <button type="submit" className="btn" disabled={!can || !action.trim() || !validAction(action) || actionTx.busy}>
            {actionTx.busy ? 'Setting…' : 'Set action'}
          </button>
          <TxStatus state={actionTx.state} doneText="Action updated." />
        </form>

        <form className="action" onSubmit={(e) => { e.preventDefault(); if (isValidAddress(signer.trim())) signerTx.send({ ...deskArgs, functionName: 'setOracleSigner', args: [checksum(signer.trim())] }) }}>
          <h2 className="h-small">Oracle signer</h2>
          <p className="hint">
            Now {desk.oracleSigner ? <AddressChip address={desk.oracleSigner} /> : '…'}. Checked when an answer lands: rotate while no case is open, or point at an ERC-1271 registry that accepts both keys.
          </p>
          <label htmlFor={ids.signer}>New signer address</label>
          <input id={ids.signer} className="mono" type="text" value={signer} onChange={(e) => setSigner(e.target.value)} placeholder="0x…" spellCheck={false} />
          <button type="submit" className="btn" disabled={!can || !isValidAddress(signer.trim()) || signerTx.busy}>
            {signerTx.busy ? 'Setting…' : 'Set oracle signer'}
          </button>
          <TxStatus state={signerTx.state} doneText="Oracle signer updated." />
        </form>
      </div>
    </>
  )
}

function validAction(value: string): boolean {
  const v = value.trim()
  if (/^0x[0-9a-fA-F]{64}$/.test(v)) return true
  return v.length > 0 && v.length <= 32 && /^[\x20-\x7e]+$/.test(v)
}

function encodeAction(value: string): Hex {
  const v = value.trim()
  if (/^0x[0-9a-fA-F]{64}$/.test(v)) return v as Hex
  return stringToHex(v, { size: 32 })
}

function decodeAction(value: Hex): string {
  try {
    const bytes = value.slice(2).match(/.{2}/g) ?? []
    let out = ''
    for (const b of bytes) {
      const code = parseInt(b, 16)
      if (code === 0) break
      if (code < 0x20 || code > 0x7e) return ''
      out += String.fromCharCode(code)
    }
    return out
  } catch {
    return ''
  }
}
