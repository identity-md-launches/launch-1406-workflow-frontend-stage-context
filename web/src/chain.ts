import { createConfig, fallback, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { defineChain, type Chain } from 'viem'
import type { Deployment } from './config'

/** Builds the viem chain from the manifest's `network` block. */
export function chainFromDeployment(d: Deployment): Chain {
  const n = d.network
  if (!n) {
    // Unvetted chain: reads only, no Uniswap addresses. The app disables swaps in that case.
    return defineChain({
      id: d.chainId,
      name: `Chain ${d.chainId}`,
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [] } },
    })
  }
  return defineChain({
    id: n.chainId,
    name: n.name,
    testnet: n.testnet,
    nativeCurrency: n.nativeCurrency,
    rpcUrls: { default: { http: n.rpcUrls } },
    blockExplorers: { default: { name: 'Explorer', url: n.explorer } },
  })
}

/** wagmi config: configured public RPCs with fallback; the wallet only signs. */
export function makeWagmiConfig(d: Deployment) {
  const chain = chainFromDeployment(d)
  const urls = d.network?.rpcUrls ?? []
  // Batches of at most 3: the chain table's free public endpoints refuse larger JSON-RPC batches,
  // and a batch that fails on one endpoint must still be acceptable to the fallback.
  const transport = urls.length
    ? fallback(urls.map((url) => http(url, { batch: { wait: 16, batchSize: 3 }, retryCount: 2 })))
    : http()
  return createConfig({
    chains: [chain],
    connectors: [injected()],
    multiInjectedProviderDiscovery: true,
    transports: { [chain.id]: transport },
  })
}

export type WagmiConfig = ReturnType<typeof makeWagmiConfig>
