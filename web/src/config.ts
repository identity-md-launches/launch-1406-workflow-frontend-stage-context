// The single configuration surface of the site.
//
// Every address, chain id, public RPC URL and ABI the app uses comes from dist/imd-deployment.json,
// loaded at runtime from the same directory as index.html, plus the ABI JSON files it references.
// There is no second map of addresses in the source: the deployment handoff is the only source.
// The constants below are protocol-level ABIs for the Uniswap v4 contracts whose addresses the
// manifest's `network.uniswapV4` block supplies, and a few non-secret UX settings.
import type { Abi, Address, Hex } from 'viem'

export type ContractEntry = { name: string; address: Address; abiHash: string; abiPath: string }
export type AssetEntry = { path: string; sha256: string }
export type PoolKey = { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address }
export type PairToken = { address: Address; symbol: string; name: string; decimals: number; id?: string }
export type Network = {
  chainId: number
  name: string
  testnet: boolean
  rpcUrls: string[]
  explorer: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
  faucets: string[]
  uniswapV4: {
    poolManager: Address
    universalRouter: Address
    quoter: Address
    stateView: Address
    positionManager: Address
    permit2: Address
    extendedSwapParams?: boolean
  }
  pairToken: PairToken
  otherPairTokens?: PairToken[]
}
export type WalletAddChain = {
  chainId: Hex
  chainName: string
  rpcUrls: string[]
  nativeCurrency: { name: string; symbol: string; decimals: number }
  blockExplorerUrls: string[]
}
export type DeploymentManifest = {
  version: 1
  launchId: string
  chainId: number
  sourceCommit: string
  attestationHash: string
  contracts: ContractEntry[]
  assets: AssetEntry[]
  poolKey?: PoolKey
  network?: Network
  walletAddChain?: WalletAddChain
}

/** The manifest plus the ABIs it references, resolved once at startup. */
export type Deployment = DeploymentManifest & {
  abis: Record<string, Abi>
  /** Address of each handoff contract by name. */
  addresses: Record<string, Address>
}

export const MANIFEST_PATH = 'imd-deployment.json'
/** SnitchReports is deployed by SnitchDesk; its ABI ships beside the handoff ABIs and its address is read on chain. */
export const REPORTS_ABI_PATH = 'abi/SnitchReports.json'

/** Non-secret UX settings. */
export const settings = {
  /** How often live contract reads refresh, in milliseconds. Public RPCs: keep this modest. */
  pollIntervalMs: 12_000,
  /** Default slippage for pool swaps, in basis points. */
  defaultSlippageBps: 50,
  /** Blocks assumed per 30 days at ~12 s per block, the fallback window when a token's deployment block is unknown. */
  thirtyDaysInBlocks: 216_000n,
  /** Seconds a case waits before its opener can drop it (SnitchDesk.DROP_DELAY). */
  dropDelaySeconds: 72 * 3600,
  /** Optional WalletConnect project id. Empty: only browser (EIP-6963 / injected) wallets are offered. */
  walletConnectProjectId: '',
}

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/
const HEX_64 = /^[0-9a-f]{64}$/

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Deployment configuration: ${message}`)
}

function isRelative(path: string): boolean {
  return !/^[a-z]+:/i.test(path) && !path.startsWith('/') && !path.split('/').includes('..')
}

/** Validates the manifest's shape before any address or ABI is trusted. */
export function validateManifest(input: unknown): DeploymentManifest {
  assert(input && typeof input === 'object', 'not an object')
  const m = input as Record<string, unknown>
  assert(m.version === 1, 'unsupported version')
  assert(typeof m.launchId === 'string' && m.launchId.length > 0, 'launchId missing')
  assert(typeof m.chainId === 'number' && Number.isInteger(m.chainId) && m.chainId > 0, 'chainId invalid')
  assert(typeof m.sourceCommit === 'string' && /^[0-9a-f]{40}$/.test(m.sourceCommit), 'sourceCommit invalid')
  assert(typeof m.attestationHash === 'string' && HEX_64.test(m.attestationHash), 'attestationHash invalid')
  assert(Array.isArray(m.contracts) && m.contracts.length > 0, 'contracts missing')
  for (const c of m.contracts as Record<string, unknown>[]) {
    assert(typeof c.name === 'string' && c.name.length > 0, 'contract name missing')
    assert(typeof c.address === 'string' && HEX_ADDRESS.test(c.address), `address invalid for ${String(c.name)}`)
    assert(typeof c.abiHash === 'string' && HEX_64.test(c.abiHash), `abiHash invalid for ${String(c.name)}`)
    assert(typeof c.abiPath === 'string' && isRelative(c.abiPath), `abiPath invalid for ${String(c.name)}`)
  }
  assert(Array.isArray(m.assets), 'assets missing')
  for (const a of m.assets as Record<string, unknown>[]) {
    assert(typeof a.path === 'string' && isRelative(a.path), 'asset path invalid')
    assert(typeof a.sha256 === 'string' && HEX_64.test(a.sha256), `asset hash invalid for ${String(a.path)}`)
  }
  if (m.poolKey !== undefined) {
    const p = m.poolKey as Record<string, unknown>
    assert(typeof p.currency0 === 'string' && HEX_ADDRESS.test(p.currency0), 'poolKey.currency0 invalid')
    assert(typeof p.currency1 === 'string' && HEX_ADDRESS.test(p.currency1), 'poolKey.currency1 invalid')
    assert(typeof p.hooks === 'string' && HEX_ADDRESS.test(p.hooks), 'poolKey.hooks invalid')
    assert(typeof p.fee === 'number' && typeof p.tickSpacing === 'number', 'poolKey fee/tickSpacing invalid')
  }
  if (m.network !== undefined) {
    const n = m.network as Record<string, unknown>
    assert(n.chainId === m.chainId, 'network.chainId differs from chainId')
    assert(Array.isArray(n.rpcUrls) && n.rpcUrls.every((u) => typeof u === 'string' && u.startsWith('https://')), 'network.rpcUrls invalid')
    assert(typeof n.explorer === 'string', 'network.explorer missing')
    const u = n.uniswapV4 as Record<string, unknown> | undefined
    assert(u && typeof u === 'object', 'network.uniswapV4 missing')
    for (const k of ['poolManager', 'universalRouter', 'quoter', 'stateView', 'positionManager', 'permit2']) {
      assert(typeof u[k] === 'string' && HEX_ADDRESS.test(u[k] as string), `network.uniswapV4.${k} invalid`)
    }
    const pt = n.pairToken as Record<string, unknown> | undefined
    assert(pt && typeof pt.address === 'string' && HEX_ADDRESS.test(pt.address), 'network.pairToken invalid')
  }
  return m as unknown as DeploymentManifest
}

/** Resolves a path relative to the page (works under a gateway subpath or an ENS name). */
export function siteUrl(path: string): string {
  return new URL(path, document.baseURI).toString()
}

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(siteUrl(path), { cache: 'no-cache' })
  if (!response.ok) throw new Error(`Unable to load ${path} (${response.status})`)
  return response.json()
}

/** Loads the manifest and every ABI it references. The app does not start without it. */
export async function loadDeployment(): Promise<Deployment> {
  const manifest = validateManifest(await fetchJson(MANIFEST_PATH))
  const abis: Record<string, Abi> = {}
  const addresses: Record<string, Address> = {}
  await Promise.all(
    manifest.contracts.map(async (c) => {
      const abi = await fetchJson(c.abiPath)
      assert(Array.isArray(abi), `ABI at ${c.abiPath} is not an array`)
      abis[c.name] = abi as Abi
      addresses[c.name] = c.address
    }),
  )
  for (const name of ['LaunchToken', 'SnitchArt', 'SnitchDesk']) assert(abis[name], `${name} missing from the handoff`)
  assert(manifest.assets.some((a) => a.path === REPORTS_ABI_PATH), 'SnitchReports ABI not declared')
  const reportsAbi = await fetchJson(REPORTS_ABI_PATH)
  assert(Array.isArray(reportsAbi), 'SnitchReports ABI is not an array')
  abis.SnitchReports = reportsAbi as Abi
  return { ...manifest, abis, addresses }
}

// ---- Protocol ABIs for the chain table's Uniswap v4 contracts (addresses come from `network.uniswapV4`). ----

export const poolKeyComponents = [
  { name: 'currency0', type: 'address' },
  { name: 'currency1', type: 'address' },
  { name: 'fee', type: 'uint24' },
  { name: 'tickSpacing', type: 'int24' },
  { name: 'hooks', type: 'address' },
] as const

export const quoterAbi = [
  {
    type: 'function',
    name: 'quoteExactInputSingle',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'poolKey', type: 'tuple', components: poolKeyComponents },
          { name: 'zeroForOne', type: 'bool' },
          { name: 'exactAmount', type: 'uint128' },
          { name: 'hookData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
] as const

export const universalRouterAbi = [
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'payable',
    inputs: [
      { name: 'commands', type: 'bytes' },
      { name: 'inputs', type: 'bytes[]' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [],
  },
] as const

export const permit2Abi = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
    ],
    outputs: [],
  },
] as const

export const stateViewAbi = [
  {
    type: 'function',
    name: 'getSlot0',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'protocolFee', type: 'uint24' },
      { name: 'lpFee', type: 'uint24' },
    ],
  },
  {
    type: 'function',
    name: 'getLiquidity',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [{ name: 'liquidity', type: 'uint128' }],
  },
] as const
