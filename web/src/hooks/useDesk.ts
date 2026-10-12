import { useQuery } from '@tanstack/react-query'
import { usePublicClient, useReadContract, useAccount } from 'wagmi'
import { erc20Abi, type Address } from 'viem'
import { settings } from '../config'
import { useDeployment } from './useDeployment'
import { toCase, type Case } from '../lib/cases'

/** The desk's live settings and the addresses it points at. */
export function useDeskInfo() {
  const d = useDeployment()
  const desk = d.addresses.SnitchDesk
  const abi = d.abis.SnitchDesk
  const common = { abi, address: desk, query: { refetchInterval: settings.pollIntervalMs } } as const
  const caseCount = useReadContract({ ...common, functionName: 'caseCount' })
  const caseFee = useReadContract({ ...common, functionName: 'caseFee' })
  const oraclePrice = useReadContract({ ...common, functionName: 'oraclePrice' })
  const owner = useReadContract({ ...common, functionName: 'owner' })
  const reports = useReadContract({ abi, address: desk, functionName: 'reports' })
  const intake = useReadContract({ ...common, functionName: 'intake' })
  const panelSize = useReadContract({ ...common, functionName: 'panelSize' })
  const quorum = useReadContract({ ...common, functionName: 'quorum' })
  const failureHook = useReadContract({ ...common, functionName: 'failureHook' })
  const action = useReadContract({ ...common, functionName: 'action' })
  const oracleSigner = useReadContract({ ...common, functionName: 'oracleSigner' })
  return {
    desk,
    caseCount: caseCount.data as bigint | undefined,
    caseFee: caseFee.data as bigint | undefined,
    oraclePrice: oraclePrice.data as bigint | undefined,
    oraclePriceError: oraclePrice.error,
    owner: owner.data as Address | undefined,
    reports: reports.data as Address | undefined,
    intake: intake.data as Address | undefined,
    panelSize: panelSize.data as number | undefined,
    quorum: quorum.data as number | undefined,
    failureHook: failureHook.data as boolean | undefined,
    action: action.data as `0x${string}` | undefined,
    oracleSigner: oracleSigner.data as Address | undefined,
    isLoading: caseCount.isLoading,
    error: caseCount.error,
    refetch: () => Promise.all([caseCount.refetch(), caseFee.refetch(), oraclePrice.refetch(), owner.refetch(), panelSize.refetch(), quorum.refetch(), failureHook.refetch(), intake.refetch(), action.refetch(), oracleSigner.refetch()]),
  }
}

/** Every case, newest first, read with batched eth_call (caseCount then getCase for each id). */
export function useCases() {
  const d = useDeployment()
  const client = usePublicClient()
  const desk = d.addresses.SnitchDesk
  const abi = d.abis.SnitchDesk
  return useQuery({
    queryKey: ['cases', desk],
    enabled: !!client,
    refetchInterval: settings.pollIntervalMs,
    queryFn: async (): Promise<Case[]> => {
      if (!client) return []
      const count = (await client.readContract({ abi, address: desk, functionName: 'caseCount' })) as bigint
      const ids: bigint[] = []
      for (let i = count; i >= 1n; i--) ids.push(i)
      const out: Case[] = []
      const batch = 40
      for (let i = 0; i < ids.length; i += batch) {
        const slice = ids.slice(i, i + batch)
        const results = await Promise.all(
          slice.map((id) => client.readContract({ abi, address: desk, functionName: 'getCase', args: [id] })),
        )
        results.forEach((raw, j) => out.push(toCase(slice[j], raw)))
      }
      return out
    },
  })
}

export function useCase(id: bigint | undefined) {
  const d = useDeployment()
  const desk = d.addresses.SnitchDesk
  const abi = d.abis.SnitchDesk
  const read = useReadContract({
    abi,
    address: desk,
    functionName: 'getCase',
    args: id === undefined ? undefined : [id],
    query: { enabled: id !== undefined, refetchInterval: settings.pollIntervalMs },
  })
  const failed = useReadContract({
    abi,
    address: desk,
    functionName: 'failed',
    args: id === undefined ? undefined : [id],
    query: { enabled: id !== undefined, refetchInterval: settings.pollIntervalMs },
  })
  const data = read.data && id !== undefined ? toCase(id, read.data) : undefined
  return { data, failed: failed.data as boolean | undefined, isLoading: read.isLoading, error: read.error, refetch: () => Promise.all([read.refetch(), failed.refetch()]) }
}

/** Balance and allowance of an ERC-20 for the connected account. */
export function useTokenPosition(token: Address | undefined, spender: Address | undefined) {
  const { address } = useAccount()
  const balance = useReadContract({
    abi: erc20Abi,
    address: token,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!token && !!address, refetchInterval: settings.pollIntervalMs },
  })
  const allowance = useReadContract({
    abi: erc20Abi,
    address: token,
    functionName: 'allowance',
    args: address && spender ? [address, spender] : undefined,
    query: { enabled: !!token && !!address && !!spender, refetchInterval: settings.pollIntervalMs },
  })
  return {
    balance: balance.data as bigint | undefined,
    allowance: allowance.data as bigint | undefined,
    refetch: () => Promise.all([balance.refetch(), allowance.refetch()]),
  }
}
