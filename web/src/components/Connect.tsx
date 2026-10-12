import { useEffect, useRef, useState } from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { shortAddress, checksum } from '../lib/format'
import { describeError } from '../lib/errors'
import { useEnsureChain } from '../hooks/useEnsureChain'

/** Connect, connected account and wrong-network state, as one control group in the header. */
export function Connect() {
  const { address, isConnected, connector } = useAccount()
  const { connectors, connectAsync, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { wrongChain } = useEnsureChain()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // EIP-6963 wallets each get a connector; the generic "Injected" one only makes sense when window.ethereum exists.
  const list = connectors.filter((c) => c.id !== 'injected' || 'ethereum' in window)

  if (isConnected && address) {
    // The single "Switch to <chain>" control lives in the layout's wrong-network banner.
    return (
      <div className="connect">
        <span className="connect__account mono" title={checksum(address)}>
          {shortAddress(address)}
          {wrongChain && <span className="connect__note"> · wrong network</span>}
        </span>
        <button type="button" className="btn btn--small" onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <div className="connect">
      <button ref={triggerRef} type="button" className="btn btn--primary" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="wallet-menu">
        Connect wallet
      </button>
      {open && (
        <div ref={dialogRef} id="wallet-menu" className="menu" role="dialog" aria-label="Choose a wallet">
          {list.length === 0 && (
            <p className="menu__empty">
              No browser wallet found. Install a wallet extension such as MetaMask or Rabby, then reload this page.
            </p>
          )}
          {list.map((c) => (
            <button
              key={c.uid}
              type="button"
              className="menu__item"
              disabled={isPending}
              onClick={async () => {
                setError(null)
                try {
                  await connectAsync({ connector: c })
                  setOpen(false)
                } catch (e) {
                  setError(describeError(e))
                }
              }}
            >
              {c.icon && <img src={c.icon} alt="" width="20" height="20" />}
              {isPending && connector?.uid === c.uid ? `Connecting to ${c.name}…` : c.name}
            </button>
          ))}
          {error && (
            <p className="tx tx--error" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="btn btn--small" onClick={() => { setOpen(false); triggerRef.current?.focus() }}>
            Close
          </button>
        </div>
      )}
    </div>
  )
}
