import { describe, expect, it } from 'vitest'
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem'
import { defaultRange, findDeploymentBlock, parseBlock } from '../src/lib/blocks'
import { validateManifest, settings } from '../src/config'
import { describeError } from '../src/lib/errors'

describe('deployment block search', () => {
  const fake = (deployedAt: bigint) => {
    let calls = 0
    return {
      calls: () => calls,
      getCode: async ({ blockNumber }: { address: string; blockNumber: bigint }) => {
        calls++
        return blockNumber >= deployedAt ? '0x6001' : '0x'
      },
    }
  }
  it('finds the first block with code by binary search', async () => {
    const client = fake(26_176_091n)
    const found = await findDeploymentBlock(client, '0x5e5b866b079d4063ba080b758aef127ccd570fea', 26_300_000n)
    expect(found).toBe(26_176_091n)
    expect(client.calls()).toBeLessThan(40)
  })
  it('returns undefined when the address has no code at latest', async () => {
    const client = { getCode: async () => '0x' }
    expect(await findDeploymentBlock(client, '0x5e5b866b079d4063ba080b758aef127ccd570fea', 100n)).toBeUndefined()
  })
  it('defaults the window to the deployment block, else the last 30 days', () => {
    expect(defaultRange(1_000_000n, 900n)).toEqual({ fromBlock: 900n, toBlock: 1_000_000n })
    expect(defaultRange(1_000_000n, undefined)).toEqual({ fromBlock: 1_000_000n - settings.thirtyDaysInBlocks, toBlock: 1_000_000n })
    expect(defaultRange(100n, undefined)).toEqual({ fromBlock: 0n, toBlock: 100n })
  })
  it('parses block numbers with separators', () => {
    expect(parseBlock('21,004,118')).toBe(21004118n)
    expect(parseBlock('21 004 118')).toBe(21004118n)
    expect(parseBlock('abc')).toBeUndefined()
    expect(parseBlock('')).toBeUndefined()
  })
})

const good = {
  version: 1,
  launchId: '4957b27c-aef4-4ac6-88c6-cdf541457b58',
  chainId: 1,
  sourceCommit: '13de1c8a9975a6dcab5202f6b01c9a9363d76b29',
  attestationHash: 'd6ad34c88900e55f4333e32e61e930c4508ada38824804be8fe0087c0754fe84',
  contracts: [{ name: 'SnitchDesk', address: '0x15e09de7237b98b882be85ea0584c2340795eb5b', abiHash: '109cf3731ef4d4766ffb366e3f69b0a65e9105f465acaadabe64628b9cf18eb3', abiPath: 'abi/SnitchDesk.json' }],
  assets: [{ path: 'index.html', sha256: 'a'.repeat(64) }],
  poolKey: { currency0: '0x5e5b866b079d4063ba080b758aef127ccd570fea', currency1: '0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7', fee: 12500, tickSpacing: 60, hooks: '0x784ff9a3ac5d88a30bfff6f7f2a270161fbe6000' },
  network: {
    chainId: 1,
    name: 'Ethereum',
    testnet: false,
    rpcUrls: ['https://ethereum-rpc.publicnode.com'],
    explorer: 'https://etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    faucets: [],
    uniswapV4: {
      poolManager: '0x000000000004444c5dc75cb358380d2e3de08a90',
      universalRouter: '0x66a9893cc07d91d95644aedd05d03f95e1dba8af',
      quoter: '0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203',
      stateView: '0x7ffe42c4a5deea5b0fec41c94c136cf115597227',
      positionManager: '0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e',
      permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3',
    },
    pairToken: { address: '0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7', symbol: 'IMD', name: 'Identity.md', decimals: 18 },
  },
}

describe('manifest validation', () => {
  it('accepts a well-formed manifest', () => {
    expect(validateManifest(good).chainId).toBe(1)
  })
  it('refuses URLs and parent traversal in paths', () => {
    expect(() => validateManifest({ ...good, contracts: [{ ...good.contracts[0], abiPath: 'https://x/abi.json' }] })).toThrow(/abiPath/)
    expect(() => validateManifest({ ...good, assets: [{ path: '../index.html', sha256: 'a'.repeat(64) }] })).toThrow(/asset path/)
  })
  it('refuses a network block whose chain differs', () => {
    expect(() => validateManifest({ ...good, network: { ...good.network, chainId: 11155111 } })).toThrow(/network.chainId/)
  })
  it('refuses malformed hashes and addresses', () => {
    expect(() => validateManifest({ ...good, attestationHash: '0x12' })).toThrow(/attestationHash/)
    expect(() => validateManifest({ ...good, contracts: [{ ...good.contracts[0], address: '0x12' }] })).toThrow(/address/)
  })
})

describe('error translation', () => {
  it('names wallet rejection', () => {
    expect(describeError(new UserRejectedRequestError(new Error('User rejected the request.')))).toMatch(/Rejected in the wallet/)
    expect(describeError({ code: 4001, message: 'User rejected' })).toMatch(/Rejected in the wallet/)
  })
  it('translates desk custom errors', () => {
    const reverted = new ContractFunctionRevertedError({ abi: [{ type: 'error', name: 'TooEarly', inputs: [{ name: 'caseId', type: 'uint256' }, { name: 'droppableAt', type: 'uint64' }] }], functionName: 'dropCase', data: '0x' })
    // Build a BaseError that walks to the reverted error.
    const wrapped = new BaseError('execution reverted', { cause: reverted })
    reverted.data = { errorName: 'TooEarly', args: [1n, 2n], abiItem: { type: 'error', name: 'TooEarly', inputs: [] } }
    expect(describeError(wrapped)).toMatch(/72-hour wait/)
  })
  it('falls back to the short message', () => {
    expect(describeError(new Error('boom'))).toBe('boom')
  })
})
