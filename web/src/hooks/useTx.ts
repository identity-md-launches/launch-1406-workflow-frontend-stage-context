import { useCallback, useState } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import type { Abi, Address, Hex, TransactionReceipt } from 'viem'
import { describeError } from '../lib/errors'
import { useDeployment } from './useDeployment'

export type TxState =
  | { phase: 'idle' }
  | { phase: 'simulating' }
  | { phase: 'confirming' }
  | { phase: 'pending'; hash: Hex }
  | { phase: 'confirmed'; hash: Hex; receipt: TransactionReceipt }
  | { phase: 'error'; message: string; hash?: Hex }

export type TxRequest = {
  abi: Abi | readonly unknown[]
  address: Address
  functionName: string
  args?: readonly unknown[]
  value?: bigint
}

/**
 * One transaction runner per button: simulate, ask the wallet, wait for the receipt, then refetch.
 * Each control owns its own instance so pending states never leak between actions.
 */
export function useTx(onConfirmed?: (receipt: TransactionReceipt) => void | Promise<void>) {
  const publicClient = usePublicClient()
  const d = useDeployment()
  const { isConnected, chainId } = useAccount()
  const onChain = isConnected && chainId === d.chainId
  const { data: walletClient, isFetching, error: walletError } = useWalletClient({
    chainId: d.chainId,
    query: { enabled: onChain },
  })
  const ready = onChain && !!walletClient && !isFetching && !walletError
  const walletStatus = onChain && !ready
    ? walletError ? 'Unable to read the wallet. Disconnect and reconnect to try again.' : 'Preparing the wallet…'
    : null
  const [state, setState] = useState<TxState>({ phase: 'idle' })

  const send = useCallback(
    async (request: TxRequest) => {
      if (!publicClient || !walletClient || !ready) {
        setState({ phase: 'error', message: !isConnected ? 'Connect a wallet first.' : !onChain ? `Switch to ${d.network?.name ?? 'the deployment chain'} first.` : walletStatus ?? 'Preparing the wallet. Try again in a moment.' })
        return
      }
      let hash: Hex | undefined
      try {
        setState({ phase: 'simulating' })
        const { request: prepared } = await publicClient.simulateContract({
          abi: request.abi as Abi,
          address: request.address,
          functionName: request.functionName,
          args: request.args as unknown[] | undefined,
          value: request.value,
          account: walletClient.account,
        })
        setState({ phase: 'confirming' })
        hash = await walletClient.writeContract(prepared)
        setState({ phase: 'pending', hash })
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') {
          setState({ phase: 'error', message: 'The transaction was mined but reverted.', hash })
          return
        }
        setState({ phase: 'confirmed', hash, receipt })
        await onConfirmed?.(receipt)
      } catch (e) {
        setState({ phase: 'error', message: describeError(e), hash })
      }
    },
    [publicClient, walletClient, onConfirmed, ready, isConnected, onChain, d.network?.name, walletStatus],
  )

  const reset = useCallback(() => setState({ phase: 'idle' }), [])
  const busy = state.phase === 'simulating' || state.phase === 'confirming' || state.phase === 'pending'
  return { state, send, reset, busy, ready, walletStatus }
}
