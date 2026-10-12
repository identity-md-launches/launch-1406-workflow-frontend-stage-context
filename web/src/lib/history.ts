/** A mined desk event, decoded using the implementation ABI. */
export type CaseEvent = {
  eventName: string
  caseId?: bigint
  blockNumber: bigint
  logIndex: number
  removed?: boolean
}

type HistorySource = {
  deploymentBlock(): Promise<bigint>
  latestBlock(): Promise<bigint>
  events(fromBlock: bigint, toBlock: bigint): Promise<CaseEvent[]>
}

const comparePosition = (a: CaseEvent, b: CaseEvent) => a.blockNumber === b.blockNumber
  ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1

/** Newest answer first, with open/dropped cases retained for the wallet's case list. */
export function caseIdsFromEvents(events: CaseEvent[]): bigint[] {
  const positions = new Map<bigint, CaseEvent>()
  for (const event of events.filter(e => !e.removed).sort(comparePosition)) {
    if (event.caseId === undefined) continue
    if (event.eventName === 'CaseAnswered' || (event.eventName === 'CaseOpened' && !positions.has(event.caseId))) {
      positions.set(event.caseId, event)
    }
    // ReportFiled changes the stored status, but never the answer's place in history.
  }
  return [...positions.entries()].sort((a, b) => comparePosition(b[1], a[1])).map(([id]) => id)
}

/**
 * Scan bounded RPC ranges once, then refresh a 12-block overlap for recent reorgs.
 * Commit the cursor only after a complete scan; errors cannot silently truncate history.
 */
export function createCaseHistoryReader(source: HistorySource) {
  let deployment: bigint | undefined
  let scannedTo: bigint | undefined
  let cached: CaseEvent[] = []

  async function readRange(from: bigint, to: bigint): Promise<CaseEvent[]> {
    try {
      return await source.events(from, to)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (from === to || !/range|limit|too many|too large|response size/i.test(message)) throw error
      const middle = (from + to) / 2n
      return [...await readRange(from, middle), ...await readRange(middle + 1n, to)]
    }
  }

  return async () => {
    const latest = await source.latestBlock()
    deployment ??= await source.deploymentBlock()
    const overlap = scannedTo === undefined ? deployment : (scannedTo < latest ? scannedTo : latest) - 11n
    const from = overlap > deployment ? overlap : deployment
    const next = cached.filter(event => event.blockNumber < from)
    for (let start = from; start <= latest; start += 1000n) {
      const end = start + 999n < latest ? start + 999n : latest
      next.push(...await readRange(start, end))
    }
    cached = next
    scannedTo = latest
    return { ids: caseIdsFromEvents(cached), blockNumber: latest }
  }
}
