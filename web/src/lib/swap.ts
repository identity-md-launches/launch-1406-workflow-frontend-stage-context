// Uniswap v4 swap encoding for the universal router, as the launch network prescribes:
//   commands = 0x10 (V4_SWAP); inputs[0] = abi.encode(actions, params)
//   actions  = 0x06 0x0c 0x0f (SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL)
//   params[0] = ExactInputSingleParams(poolKey, zeroForOne, amountIn, amountOutMinimum, hookData)
//   params[1] = abi.encode(inputCurrency, amountIn); params[2] = abi.encode(outputCurrency, amountOutMinimum)
import { encodeAbiParameters, keccak256, type Address, type Hex } from 'viem'
import { poolKeyComponents, type PoolKey } from '../config'

export const V4_SWAP_COMMAND: Hex = '0x10'
export const V4_ACTIONS: Hex = '0x060c0f'

/** keccak256(abi.encode(poolKey)): the PoolManager's pool id. */
export function poolId(key: PoolKey): Hex {
  return keccak256(encodeAbiParameters([{ type: 'tuple', components: poolKeyComponents }], [key]))
}

/** Sorted pool currencies: native ETH (zero address) first, else ascending by address. */
export function sortCurrencies(a: Address, b: Address): [Address, Address] {
  return BigInt(a) < BigInt(b) ? [a, b] : [b, a]
}

export type SwapPlan = {
  zeroForOne: boolean
  inputCurrency: Address
  outputCurrency: Address
  amountIn: bigint
  amountOutMinimum: bigint
}

export function planSwap(key: PoolKey, inputCurrency: Address, amountIn: bigint, amountOutMinimum: bigint): SwapPlan {
  const zeroForOne = inputCurrency.toLowerCase() === key.currency0.toLowerCase()
  if (!zeroForOne && inputCurrency.toLowerCase() !== key.currency1.toLowerCase()) {
    throw new Error('Input currency is not in the pool')
  }
  return {
    zeroForOne,
    inputCurrency,
    outputCurrency: zeroForOne ? key.currency1 : key.currency0,
    amountIn,
    amountOutMinimum,
  }
}

const exactInputSingle = {
  type: 'tuple',
  components: [
    { name: 'poolKey', type: 'tuple', components: poolKeyComponents },
    { name: 'zeroForOne', type: 'bool' },
    { name: 'amountIn', type: 'uint128' },
    { name: 'amountOutMinimum', type: 'uint128' },
    { name: 'hookData', type: 'bytes' },
  ],
} as const

const exactInputSingleExtended = {
  type: 'tuple',
  components: [
    { name: 'poolKey', type: 'tuple', components: poolKeyComponents },
    { name: 'zeroForOne', type: 'bool' },
    { name: 'amountIn', type: 'uint128' },
    { name: 'amountOutMinimum', type: 'uint128' },
    { name: 'reserved', type: 'uint256' },
    { name: 'hookData', type: 'bytes' },
  ],
} as const

/** The `execute` arguments for one exact-input single-hop swap. */
export function encodeExecute(key: PoolKey, plan: SwapPlan, deadline: bigint, extended = false) {
  const params0 = extended
    ? encodeAbiParameters([exactInputSingleExtended], [
        { poolKey: key, zeroForOne: plan.zeroForOne, amountIn: plan.amountIn, amountOutMinimum: plan.amountOutMinimum, reserved: 0n, hookData: '0x' },
      ])
    : encodeAbiParameters([exactInputSingle], [
        { poolKey: key, zeroForOne: plan.zeroForOne, amountIn: plan.amountIn, amountOutMinimum: plan.amountOutMinimum, hookData: '0x' },
      ])
  const params1 = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [plan.inputCurrency, plan.amountIn])
  const params2 = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [plan.outputCurrency, plan.amountOutMinimum])
  const input0 = encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [V4_ACTIONS, [params0, params1, params2]])
  return { commands: V4_SWAP_COMMAND, inputs: [input0] as Hex[], deadline }
}

/** Applies slippage in basis points to a quoted output. */
export function applySlippage(amountOut: bigint, slippageBps: number): bigint {
  const bps = BigInt(Math.max(0, Math.min(10_000, Math.round(slippageBps))))
  return (amountOut * (10_000n - bps)) / 10_000n
}

/** Pool price from slot0: currency1 per currency0 (both at `decimals`), as a decimal string. */
export function priceFromSqrt(sqrtPriceX96: bigint, decimals0 = 18, decimals1 = 18, precision = 6): string {
  // price = (sqrt / 2^96)^2 * 10^(d0 - d1)
  const q96 = 2n ** 96n
  const scale = 10n ** BigInt(precision)
  const adj = decimals0 >= decimals1 ? 10n ** BigInt(decimals0 - decimals1) : 1n
  const div = decimals1 > decimals0 ? 10n ** BigInt(decimals1 - decimals0) : 1n
  const num = sqrtPriceX96 * sqrtPriceX96 * scale * adj
  const value = num / (q96 * q96 * div)
  const whole = value / scale
  const frac = (value % scale).toString().padStart(precision, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole.toString()
}

export function invertPrice(price: string, precision = 6): string {
  const [w, f = ''] = price.split('.')
  const scale = 10n ** BigInt(precision)
  const p = BigInt(w) * scale + BigInt((f + '0'.repeat(precision)).slice(0, precision))
  if (p === 0n) return '∞'
  const inv = (scale * scale) / p
  const whole = inv / scale
  const frac = (inv % scale).toString().padStart(precision, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole.toString()
}

export const MAX_UINT160 = (1n << 160n) - 1n
export const MAX_UINT48 = (1n << 48n) - 1n
