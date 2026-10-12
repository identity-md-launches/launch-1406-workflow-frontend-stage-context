import { formatUnits, getAddress, isAddress, type Address } from 'viem'

/** 0x8f3a…91c2, exactly as SnitchArt.shortAddress renders it (lowercase hex). */
export function shortAddress(a: string): string {
  const h = a.toLowerCase()
  return `${h.slice(0, 6)}…${h.slice(-4)}`
}

/** Checksummed form for display and explorer links. */
export function checksum(a: string): Address {
  return getAddress(a)
}

export function isValidAddress(value: string): value is Address {
  return isAddress(value.trim(), { strict: false })
}

/** 21004118 → 21,004,118 (SnitchArt.commas). */
export function commas(n: bigint | number): string {
  const s = BigInt(n).toString()
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** 42 → 0042 (SnitchArt.caseNumber). */
export function caseNumber(id: bigint | number): string {
  return BigInt(id).toString().padStart(4, '0')
}

/** Unix seconds → YYYY-MM-DD in UTC (SnitchArt.utcDate). */
export function utcDate(seconds: bigint | number): string {
  const d = new Date(Number(seconds) * 1000)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function utcDateTime(seconds: bigint | number): string {
  const d = new Date(Number(seconds) * 1000)
  return `${utcDate(seconds)} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`
}

export const verdictWord = (verdict: boolean) => (verdict ? 'CLEAN' : 'SNITCHED')
export const kindName = (kind: number) => (kind === 0 ? 'Never sold' : 'Got in early')
export const kindVerb = (kind: number) => (kind === 0 ? 'never sold' : 'got in early on')

/** The claim as one plain sentence (SnitchArt.claim). */
export function claimSentence(c: { wallet: string; kind: number; symbol: string; fromBlock: bigint; toBlock: bigint }): string {
  return `${shortAddress(c.wallet)} ${kindVerb(c.kind)} ${c.symbol} between block ${commas(c.fromBlock)} and block ${commas(c.toBlock)}`
}

/** Text for the "Post it on X" control. */
export function shareText(c: { id: bigint; wallet: string; kind: number; symbol: string; verdict: boolean; agreed: number; panelSize: number }): string {
  const verb = c.kind === 0 ? 'never sold' : 'got in early on'
  return `Case No. ${caseNumber(c.id)}: ${shortAddress(c.wallet)} ${verb} $${c.symbol}. ${verdictWord(c.verdict)}, checked by ${c.agreed} of ${c.panelSize} agents`
}

/** Token amount in display units with a sensible number of decimals and thousands separators. */
export function formatAmount(value: bigint | undefined, decimals = 18, maxFraction = 4): string {
  if (value === undefined) return '…'
  const raw = formatUnits(value, decimals)
  const [whole, fraction = ''] = raw.split('.')
  const trimmed = fraction.slice(0, maxFraction).replace(/0+$/, '')
  const wholeWithCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return trimmed ? `${wholeWithCommas}.${trimmed}` : wholeWithCommas
}

/** Compact duration such as "71 h 59 min" or "3 min". */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return 'now'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h} h ${m} min`
  if (m > 0) return `${m} min`
  return `${Math.floor(seconds)} s`
}
