import { describe, expect, it } from 'vitest'
import { caseNumber, claimSentence, commas, formatAmount, formatDuration, shareText, shortAddress, utcDate } from '../src/lib/format'
import { filterReports, Status, toCase, type Case } from '../src/lib/cases'
import { parseHash, href } from '../src/router'

describe('SnitchArt-compatible formatting', () => {
  it('shortens addresses like SnitchArt.shortAddress', () => {
    expect(shortAddress('0x8f3A000000000000000000000000000000009 1C2'.replace(' ', ''))).toBe('0x8f3a…91c2')
  })
  it('adds thousands separators like SnitchArt.commas', () => {
    expect(commas(21004118n)).toBe('21,004,118')
    expect(commas(999n)).toBe('999')
    expect(commas(1000n)).toBe('1,000')
  })
  it('pads case numbers to four digits', () => {
    expect(caseNumber(42n)).toBe('0042')
    expect(caseNumber(12345n)).toBe('12345')
  })
  it('renders UTC dates', () => {
    expect(utcDate(0n)).toBe('1970-01-01')
    expect(utcDate(1760000000n)).toBe('2025-10-09')
  })
  it('writes the claim as one sentence', () => {
    expect(claimSentence({ wallet: '0x8f3a0000000000000000000000000000000091c2', kind: 0, symbol: 'PEPE', fromBlock: 21004118n, toBlock: 21077903n })).toBe(
      '0x8f3a…91c2 never sold PEPE between block 21,004,118 and block 21,077,903',
    )
    expect(claimSentence({ wallet: '0x8f3a0000000000000000000000000000000091c2', kind: 1, symbol: 'PEPE', fromBlock: 1n, toBlock: 2n })).toContain('got in early on PEPE')
  })
  it('composes the X post text', () => {
    expect(shareText({ id: 42n, wallet: '0x8f3a0000000000000000000000000000000091c2', kind: 0, symbol: 'PEPE', verdict: true, agreed: 11, panelSize: 12 })).toBe(
      'Case No. 0042: 0x8f3a…91c2 never sold $PEPE. CLEAN, checked by 11 of 12 agents',
    )
  })
  it('formats token amounts in display units', () => {
    expect(formatAmount(200_000n * 10n ** 18n)).toBe('200,000')
    expect(formatAmount(5n * 10n ** 17n)).toBe('0.5')
    expect(formatAmount(123456789012345678n, 18, 4)).toBe('0.1234')
    expect(formatAmount(undefined)).toBe('…')
  })
  it('formats durations', () => {
    expect(formatDuration(0)).toBe('now')
    expect(formatDuration(3661)).toBe('1 h 1 min')
    expect(formatDuration(120)).toBe('2 min')
  })
})

const base = {
  opener: '0x1111111111111111111111111111111111111111',
  openedAt: 1n,
  kind: 0,
  status: Status.Answered,
  verdict: true,
  token: '0x6982508145454ce325ddbe47a25d4ec3d2311933',
  fromBlock: 1n,
  askedPanelSize: 12,
  askedQuorum: 8,
  wallet: '0x8f3a0000000000000000000000000000000091c2',
  toBlock: 2n,
  fee: 0n,
  issuedAt: 1n,
  panelSize: 12,
  agreed: 11,
  figure: 0n,
  symbol: 'PEPE',
} as const

describe('case files', () => {
  const cases: Case[] = [
    { ...base, id: 1n },
    { ...base, id: 2n, verdict: false, symbol: 'WIF', wallet: '0xabc0000000000000000000000000000000000abc' },
    { ...base, id: 3n, status: Status.Open },
    { ...base, id: 4n, status: Status.Dropped },
    { ...base, id: 5n, status: Status.Filed, verdict: false },
  ]
  it('lists answered and filed cases without changing event order', () => {
    expect(filterReports(cases, 'all', '').map((c) => c.id)).toEqual([1n, 2n, 5n])
  })
  it('filters by verdict', () => {
    expect(filterReports(cases, 'clean', '').map((c) => c.id)).toEqual([1n])
    expect(filterReports(cases, 'snitched', '').map((c) => c.id)).toEqual([2n, 5n])
  })
  it('searches by wallet, token address, symbol or number', () => {
    expect(filterReports(cases, 'all', '0xabc').map((c) => c.id)).toEqual([2n])
    expect(filterReports(cases, 'all', 'wif').map((c) => c.id)).toEqual([2n])
    expect(filterReports(cases, 'all', '0x6982').map((c) => c.id)).toEqual([1n, 2n, 5n])
    expect(filterReports(cases, 'all', '#0005').map((c) => c.id)).toEqual([5n])
  })
  it('decodes getCase output', () => {
    const c = toCase(9n, { ...base, status: 3 })
    expect(c.id).toBe(9n)
    expect(c.status).toBe(Status.Filed)
    expect(c.figure).toBe(0n)
  })
})

describe('hash routing', () => {
  it('parses every route', () => {
    expect(parseHash('')).toEqual({ name: 'home' })
    expect(parseHash('#/')).toEqual({ name: 'home' })
    expect(parseHash('#/cases')).toEqual({ name: 'cases' })
    expect(parseHash('#/report/42')).toEqual({ name: 'report', id: 42n })
    expect(parseHash('#/open?kind=1')).toEqual({ name: 'open', kind: 1 })
    expect(parseHash('#/open')).toEqual({ name: 'open', kind: undefined })
    expect(parseHash('#/trade')).toEqual({ name: 'trade' })
    expect(parseHash('#/nope')).toEqual({ name: 'missing', path: 'nope' })
  })
  it('round-trips hrefs', () => {
    expect(parseHash(href({ name: 'report', id: 7n }))).toEqual({ name: 'report', id: 7n })
    expect(parseHash(href({ name: 'open', kind: 0 }))).toEqual({ name: 'open', kind: 0 })
  })
})
