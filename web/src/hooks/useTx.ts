import { useCallback, useState } from 'react'
import { usePublicClient, useWalletClient } from 'wagmi'
import type { Abi, Address, Hex, TransactionReceipt } from 'viem'
import { describeError } from '../lib/errors'

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
  const { data: walletClient } = useWalletClient()
  const [state, setState] = useState<TxState>({ phase: 'idle' })

  const send = useCallback(
    async (request: TxRequest) => {
      if (!publicClient || !walletClient) {
        setState({ phase: 'error', message: 'Connect a wallet first.' })
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
    [publicClient, walletClient, onConfirmed],
  )

  const reset = useCallback(() => setState({ phase: 'idle' }), [])
  const busy = state.phase === 'simulating' || state.phase === 'confirming' || state.phase === 'pending'
  return { state, send, reset, busy }
}
