import type { Address } from 'viem'

export enum Status {
  None = 0,
  Open = 1,
  Answered = 2,
  Filed = 3,
  Dropped = 4,
}

export const statusLabel: Record<Status, string> = {
  [Status.None]: 'Unknown',
  [Status.Open]: 'Open',
  [Status.Answered]: 'Answered',
  [Status.Filed]: 'Filed',
  [Status.Dropped]: 'Dropped',
}

/** SnitchTypes.Case as `getCase` returns it, with the case id attached. */
export type Case = {
  id: bigint
  opener: Address
  openedAt: bigint
  kind: number
  status: Status
  verdict: boolean
  token: Address
  fromBlock: bigint
  askedPanelSize: number
  askedQuorum: number
  wallet: Address
  toBlock: bigint
  fee: bigint
  issuedAt: bigint
  panelSize: number
  agreed: number
  figure: bigint
  symbol: string
}

type RawCase = {
  opener: Address
  openedAt: bigint
  kind: number
  status: number
  verdict: boolean
  token: Address
  fromBlock: bigint
  askedPanelSize: number
  askedQuorum: number
  wallet: Address
  toBlock: bigint
  fee: bigint
  issuedAt: bigint
  panelSize: number
  agreed: number
  figure: bigint
  symbol: string
}

export function toCase(id: bigint, raw: unknown): Case {
  const r = raw as RawCase
  return {
    id,
    opener: r.opener,
    openedAt: BigInt(r.openedAt),
    kind: Number(r.kind),
    status: Number(r.status) as Status,
    verdict: Boolean(r.verdict),
    token: r.token,
    fromBlock: BigInt(r.fromBlock),
    askedPanelSize: Number(r.askedPanelSize),
    askedQuorum: Number(r.askedQuorum),
    wallet: r.wallet,
    toBlock: BigInt(r.toBlock),
    fee: BigInt(r.fee),
    issuedAt: BigInt(r.issuedAt),
    panelSize: Number(r.panelSize),
    agreed: Number(r.agreed),
    figure: BigInt(r.figure),
    symbol: String(r.symbol),
  }
}

/** A report is an answered case, filed or not. */
export const isReport = (c: Case) => c.status === Status.Answered || c.status === Status.Filed

export type Filter = 'all' | 'clean' | 'snitched'

export function filterReports(cases: Case[], filter: Filter, query: string): Case[] {
  const q = query.trim().toLowerCase()
  return cases
    .filter(isReport)
    .filter((c) => (filter === 'all' ? true : filter === 'clean' ? c.verdict : !c.verdict))
    .filter((c) => {
      if (!q) return true
      return (
        c.wallet.toLowerCase().includes(q) ||
        c.token.toLowerCase().includes(q) ||
        c.symbol.toLowerCase().includes(q) ||
        c.id.toString() === q.replace(/^#?0*/, '')
      )
    })
    .sort((a, b) => (a.id > b.id ? -1 : 1))
}

/** The example card on the home page: a made-up case, never read from the chain. */
export const exampleCase: Case = {
  id: 42n,
  opener: '0x0000000000000000000000000000000000000000',
  openedAt: 1760000000n,
  kind: 0,
  status: Status.Filed,
  verdict: true,
  token: '0x6982508145454ce325ddbe47a25d4ec3d2311933',
  fromBlock: 21004118n,
  askedPanelSize: 12,
  askedQuorum: 8,
  wallet: '0x8f3a0000000000000000000000000000000091c2',
  toBlock: 21077903n,
  fee: 200000n * 10n ** 18n,
  issuedAt: 1760000000n,
  panelSize: 12,
  agreed: 11,
  figure: 0n,
  symbol: 'PEPE',
}
