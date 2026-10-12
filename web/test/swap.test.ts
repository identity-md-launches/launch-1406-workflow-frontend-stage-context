import { describe, expect, it } from 'vitest'
import { decodeAbiParameters, encodeAbiParameters, keccak256 } from 'viem'
import { applySlippage, encodeExecute, planSwap, poolId, pricesFromSqrt, sortCurrencies, V4_ACTIONS, V4_SWAP_COMMAND } from '../src/lib/swap'
import { poolKeyComponents, type PoolKey } from '../src/config'

const key: PoolKey = {
  currency0: '0x5e5b866b079d4063ba080b758aef127ccd570fea',
  currency1: '0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7',
  fee: 12500,
  tickSpacing: 60,
  hooks: '0x784ff9a3ac5d88a30bfff6f7f2a270161fbe6000',
}

describe('pool key', () => {
  it('sorts currencies ascending with native ETH first', () => {
    expect(sortCurrencies(key.currency1, key.currency0)).toEqual([key.currency0, key.currency1])
    expect(sortCurrencies('0x0000000000000000000000000000000000000000', key.currency0)[0]).toBe('0x0000000000000000000000000000000000000000')
  })
  it('derives the pool id as keccak256(abi.encode(poolKey))', () => {
    const expected = keccak256(encodeAbiParameters([{ type: 'tuple', components: poolKeyComponents }], [key]))
    expect(poolId(key)).toBe(expected)
    expect(poolId(key)).toMatch(/^0x[0-9a-f]{64}$/)
  })
})

describe('swap planning', () => {
  it('buys SNITCH (currency0) with IMD (currency1): zeroForOne = false', () => {
    const plan = planSwap(key, key.currency1, 10n ** 18n, 1n)
    expect(plan.zeroForOne).toBe(false)
    expect(plan.outputCurrency).toBe(key.currency0)
  })
  it('sells SNITCH for IMD: zeroForOne = true', () => {
    const plan = planSwap(key, key.currency0, 5n, 1n)
    expect(plan.zeroForOne).toBe(true)
    expect(plan.outputCurrency).toBe(key.currency1)
  })
  it('refuses a currency outside the pool', () => {
    expect(() => planSwap(key, '0x000000000000000000000000000000000000dEaD', 1n, 1n)).toThrow()
  })
})

describe('universal router encoding', () => {
  it('encodes V4_SWAP with SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL', () => {
    const plan = planSwap(key, key.currency1, 1_000n, 900n)
    const { commands, inputs, deadline } = encodeExecute(key, plan, 123n)
    expect(commands).toBe(V4_SWAP_COMMAND)
    expect(deadline).toBe(123n)
    expect(inputs).toHaveLength(1)
    const [actions, params] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], inputs[0])
    expect(actions).toBe(V4_ACTIONS)
    expect(params).toHaveLength(3)
    const [single] = decodeAbiParameters(
      [
        {
          type: 'tuple',
          components: [
            { name: 'poolKey', type: 'tuple', components: poolKeyComponents },
            { name: 'zeroForOne', type: 'bool' },
            { name: 'amountIn', type: 'uint128' },
            { name: 'amountOutMinimum', type: 'uint128' },
            { name: 'hookData', type: 'bytes' },
          ],
        },
      ],
      params[0],
    )
    expect(single.zeroForOne).toBe(false)
    expect(single.amountIn).toBe(1_000n)
    expect(single.amountOutMinimum).toBe(900n)
    expect(single.poolKey.hooks.toLowerCase()).toBe(key.hooks)
    expect(single.poolKey.fee).toBe(12500)
    expect(single.poolKey.tickSpacing).toBe(60)
    const settle = decodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], params[1])
    expect(settle[0].toLowerCase()).toBe(key.currency1)
    expect(settle[1]).toBe(1_000n)
    const take = decodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], params[2])
    expect(take[0].toLowerCase()).toBe(key.currency0)
    expect(take[1]).toBe(900n)
  })
  it('uses the six-field tuple when extendedSwapParams is on', () => {
    const plan = planSwap(key, key.currency0, 7n, 1n)
    const a = encodeExecute(key, plan, 1n, false).inputs[0]
    const b = encodeExecute(key, plan, 1n, true).inputs[0]
    expect(a).not.toBe(b)
    expect(b.length).toBeGreaterThan(a.length)
  })
})

describe('slippage and price', () => {
  it('applies basis points to the quoted output', () => {
    expect(applySlippage(10_000n, 50)).toBe(9_950n)
    expect(applySlippage(10_000n, 0)).toBe(10_000n)
    expect(applySlippage(10_000n, 20_000)).toBe(0n)
  })
  it('reads a 1:1 pool from sqrtPriceX96 = 2^96 and inverts', () => {
    expect(pricesFromSqrt(2n ** 96n)).toEqual({ currency1Per0: '1', currency0Per1: '1' })
    expect(pricesFromSqrt(2n ** 97n)).toEqual({ currency1Per0: '4', currency0Per1: '0.25' })
    expect(pricesFromSqrt(0n)).toBeUndefined()
  })
  it('rounds each final direction independently for the reported small price', () => {
    const price = pricesFromSqrt(128792602073356601575926592n)!
    expect(price.currency0Per1).toBe('378422.832676')
    expect(Number(price.currency1Per0)).toBeCloseTo(0.0000026425466796746373, 16)
  })
  it('accounts for different decimals and preserves very small prices', () => {
    expect(pricesFromSqrt(2n ** 96n, 6, 18)).toEqual({ currency1Per0: '0.000000000001', currency0Per1: '1000000000000' })
    const p = pricesFromSqrt(128792602073356601575926592n, 6, 18)!
    expect(Number(p.currency1Per0)).toBeGreaterThan(0)
    expect(Number(p.currency1Per0) * Number(p.currency0Per1)).toBeCloseTo(1, 10)
  })
})
