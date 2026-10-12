import { describe, expect, it } from 'vitest'
import { caseIdsFromEvents, createCaseHistoryReader, type CaseEvent } from '../src/lib/history'

const event = (eventName: string, caseId: bigint, blockNumber: bigint, logIndex = 0): CaseEvent => ({ eventName, caseId, blockNumber, logIndex })

describe('report event index', () => {
  it('orders answers by block and log, retains open cases and ignores later filing order', () => {
    const events = [
      event('CaseOpened', 1n, 10n), event('CaseOpened', 2n, 11n), event('CaseOpened', 3n, 12n),
      event('CaseAnswered', 2n, 20n, 0), event('CaseAnswered', 1n, 20n, 1),
      event('ReportFiled', 2n, 25n), { ...event('CaseAnswered', 3n, 30n), removed: true },
    ]
    expect(caseIdsFromEvents(events.reverse())).toEqual([1n, 2n, 3n])
  })
  it('scans all history in bounded ranges and only rescans the recent overlap', async () => {
    let latest = 2500n
    const ranges: [bigint, bigint][] = []
    const read = createCaseHistoryReader({
      deploymentBlock: async () => 1n, latestBlock: async () => latest,
      events: async (from, to) => { ranges.push([from, to]); return [] },
    })
    await read()
    expect(ranges).toEqual([[1n, 1000n], [1001n, 2000n], [2001n, 2500n]])
    ranges.length = 0
    latest = 2503n
    await read()
    expect(ranges).toEqual([[2489n, 2503n]])
  })
  it('subdivides a provider-limited range without losing older events', async () => {
    const opened = event('CaseOpened', 1n, 1n)
    const answer = event('CaseAnswered', 1n, 7n)
    const requests: [bigint, bigint][] = []
    const read = createCaseHistoryReader({
      deploymentBlock: async () => 1n, latestBlock: async () => 10n,
      events: async (from, to) => {
        requests.push([from, to])
        if (to - from > 2n) throw new Error('block range limit exceeded')
        return [opened, answer].filter(e => e.blockNumber >= from && e.blockNumber <= to)
      },
    })
    expect((await read()).ids).toEqual([1n])
    expect(requests).toContainEqual([1n, 10n])
    expect(requests).toContainEqual([9n, 10n])
  })
  it('replaces reorged events and does not advance the cursor after an RPC failure', async () => {
    let latest = 30n
    let fail = false
    let events = [event('CaseOpened', 1n, 1n), event('CaseOpened', 2n, 2n), event('CaseAnswered', 1n, 29n), event('CaseAnswered', 2n, 30n)]
    const ranges: [bigint, bigint][] = []
    const read = createCaseHistoryReader({
      deploymentBlock: async () => 1n, latestBlock: async () => latest,
      events: async (from, to) => {
        ranges.push([from, to])
        if (fail) throw new Error('RPC unavailable')
        return events.filter(e => e.blockNumber >= from && e.blockNumber <= to)
      },
    })
    expect((await read()).ids).toEqual([2n, 1n])
    latest = 31n
    fail = true
    await expect(read()).rejects.toThrow('RPC unavailable')
    fail = false
    events = [...events.filter(e => e.blockNumber < 29n), event('CaseAnswered', 1n, 31n)]
    expect((await read()).ids).toEqual([1n, 2n])
    expect(ranges.slice(-2)).toEqual([[19n, 31n], [19n, 31n]])
  })
})
