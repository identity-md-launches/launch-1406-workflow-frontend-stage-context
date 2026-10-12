import type { Address } from 'viem'
import { settings } from '../config'

export type CodeReader = { getCode(args: { address: Address; blockNumber: bigint }): Promise<string | undefined> }

/**
 * Finds the first block at which `token` has code with a binary search over eth_getCode.
 * Returns undefined when the token has no code at `latest` (or the search cannot run).
 */
export async function findDeploymentBlock(client: CodeReader, token: Address, latest: bigint): Promise<bigint | undefined> {
  const hasCode = async (block: bigint) => {
    const code = await client.getCode({ address: token, blockNumber: block })
    return !!code && code !== '0x'
  }
  if (!(await hasCode(latest))) return undefined
  let lo = 0n
  let hi = latest
  // Invariant: no code at lo (unless lo is the answer), code at hi.
  if (await hasCode(0n)) return 0n
  while (hi - lo > 1n) {
    const mid = (lo + hi) / 2n
    if (await hasCode(mid)) hi = mid
    else lo = mid
  }
  return hi
}

/** Default window: from the token's deployment block (else the last ~30 days) to the latest block. */
export function defaultRange(latest: bigint, deployment: bigint | undefined): { fromBlock: bigint; toBlock: bigint } {
  const fallback = latest > settings.thirtyDaysInBlocks ? latest - settings.thirtyDaysInBlocks : 0n
  const fromBlock = deployment !== undefined ? deployment : fallback
  return { fromBlock: fromBlock < latest ? fromBlock : latest - 1n, toBlock: latest }
}

export function parseBlock(value: string): bigint | undefined {
  const v = value.replace(/[,\s_]/g, '')
  if (!/^\d+$/.test(v)) return undefined
  return BigInt(v)
}
