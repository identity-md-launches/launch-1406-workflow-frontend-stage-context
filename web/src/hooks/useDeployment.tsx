import { createContext, useContext } from 'react'
import type { Deployment } from '../config'

export const DeploymentContext = createContext<Deployment | null>(null)

export function useDeployment(): Deployment {
  const d = useContext(DeploymentContext)
  if (!d) throw new Error('Deployment context missing')
  return d
}

/** Explorer link for an address or transaction on the configured chain. */
export function useExplorer() {
  const d = useDeployment()
  const base = d.network?.explorer ?? ''
  return {
    base,
    address: (a: string) => (base ? `${base}/address/${a}` : ''),
    tx: (h: string) => (base ? `${base}/tx/${h}` : ''),
    token: (a: string, id: bigint) => (base ? `${base}/nft/${a}/${id.toString()}` : ''),
    block: (n: bigint) => (base ? `${base}/block/${n.toString()}` : ''),
  }
}
