import type { TxState } from '../hooks/useTx'
import { useExplorer } from '../hooks/useDeployment'

/** A stable status region per action: wallet prompt, pending hash, confirmation or the translated error. */
export function TxStatus({ state, doneText }: { state: TxState; doneText?: string }) {
  const explorer = useExplorer()
  const hash = 'hash' in state ? state.hash : undefined
  const link = hash ? explorer.tx(hash) : ''
  const isError = state.phase === 'error'
  return (
    <p className={`tx${isError ? ' tx--error' : ''}`} role={isError ? 'alert' : 'status'} aria-live={isError ? undefined : 'polite'}>
      {state.phase === 'simulating' && 'Checking the transaction…'}
      {state.phase === 'confirming' && 'Confirm in the wallet.'}
      {state.phase === 'pending' && 'Sent. Waiting for the block.'}
      {state.phase === 'confirmed' && (doneText ?? 'Confirmed.')}
      {state.phase === 'error' && state.message}
      {hash && link && (
        <>
          {' '}
          <a href={link} target="_blank" rel="noopener noreferrer">
            View the transaction on Etherscan
          </a>
        </>
      )}
    </p>
  )
}
