import { useCallback, useState } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { numberToHex } from 'viem'
import { useDeployment } from './useDeployment'
import { describeError } from '../lib/errors'

type Eip1193 = { request(args: { method: string; params?: unknown[] }): Promise<unknown> }

/**
 * Wallet chain handling: wallet_switchEthereumChain with the chain's hex id, then on 4902 (or a
 * wallet that reports an unknown chain) wallet_addEthereumChain with the handoff's exact
 * `walletAddChain` parameters, then switch again.
 */
export function useEnsureChain() {
  const d = useDeployment()
  const queryClient = useQueryClient()
  const { connector, isConnected, chainId: accountChainId } = useAccount()
  const configuredChainId = useChainId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wrongChain = isConnected && accountChainId !== d.chainId

  const switchToConfigured = useCallback(async () => {
    if (!connector) return
    setBusy(true)
    setError(null)
    try {
      const provider = (await connector.getProvider()) as Eip1193
      const chainIdHex = numberToHex(d.chainId)
      try {
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] })
      } catch (e) {
        const code = (e as { code?: number })?.code
        const message = String((e as { message?: string })?.message ?? '')
        const unknownChain = code === 4902 || /unrecognized|unknown chain|not added|does not exist/i.test(message)
        if (!unknownChain || !d.walletAddChain) throw e
        await provider.request({ method: 'wallet_addEthereumChain', params: [d.walletAddChain] })
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] })
      }
      await queryClient.invalidateQueries({ queryKey: ['walletClient'] })
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }, [connector, d.chainId, d.walletAddChain, queryClient])

  return { wrongChain, configuredChainId, chainName: d.network?.name ?? `chain ${d.chainId}`, switchToConfigured, busy, error }
}
