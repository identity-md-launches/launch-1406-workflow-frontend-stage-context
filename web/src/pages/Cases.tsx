import { useId, useState } from 'react'
import { useAccount } from 'wagmi'
import { filterReports, Status, statusLabel, type Case, type Filter } from '../lib/cases'
import { caseNumber, claimSentence, utcDate, verdictWord } from '../lib/format'
import { useCases } from '../hooks/useDesk'
import { href } from '../router'
import { describeError } from '../lib/errors'

export function ReportList({ cases, loading, error, emptyText }: { cases: Case[]; loading: boolean; error: unknown; emptyText: string }) {
  if (error) {
    return (
      <p className="tx tx--error" role="alert">
        Unable to read the case files from the configured RPCs: {describeError(error)} Reload to try again.
      </p>
    )
  }
  if (loading) return <p role="status">Reading the case files…</p>
  if (cases.length === 0) return <p className="empty">{emptyText}</p>
  return (
    <ul className="reports">
      {cases.map((c) => {
        const answered = c.status === Status.Answered || c.status === Status.Filed
        return (
          <li key={c.id.toString()} className="report-row">
            <a className="report-row__link" href={href({ name: 'report', id: c.id })}>
              <span className="report-row__no mono">No. {caseNumber(c.id)}</span>
              <span className="report-row__claim">{claimSentence(c)}</span>
              {answered ? (
                <span className={`verdict verdict--${c.verdict ? 'clean' : 'snitched'}`}>
                  {verdictWord(c.verdict)} · {c.agreed} of {c.panelSize} · {utcDate(c.issuedAt)}
                </span>
              ) : (
                <span className="verdict verdict--pending">{statusLabel[c.status]}</span>
              )}
            </a>
          </li>
        )
      })}
    </ul>
  )
}

export function Cases() {
  const cases = useCases()
  const { address } = useAccount()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const searchId = useId()
  const all = cases.data ?? []
  const reports = filterReports(all, filter, query)
  const openCases = all.filter((c) => c.status === Status.Open)
  const mine = address ? all.filter((c) => c.opener.toLowerCase() === address.toLowerCase()) : []
  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'clean', label: 'Clean' },
    { key: 'snitched', label: 'Snitched' },
  ]
  return (
    <>
      <h1 className="h-page">Case files</h1>
      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Filter reports by verdict">
          {filters.map((f) => (
            <button key={f.key} type="button" className="segmented__item" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="field field--inline">
          <label htmlFor={searchId}>Search by wallet or token</label>
          <input id={searchId} type="search" inputMode="text" autoComplete="off" placeholder="0x… or PEPE" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <ReportList
        cases={reports}
        loading={cases.isLoading}
        error={cases.error}
        emptyText={query ? `No report matches “${query}”. Clear the search to see every report.` : filter === 'all' ? 'No report has been stamped yet. Open the first case.' : `No ${filter} report yet.`}
      />
      {mine.length > 0 && (
        <section className="section">
          <h2 className="h-section">Cases opened by this wallet</h2>
          <ReportList cases={mine} loading={false} error={null} emptyText="" />
        </section>
      )}
      {openCases.length > 0 && (
        <section className="section">
          <h2 className="h-section">Open cases awaiting the swarm</h2>
          <ReportList cases={openCases} loading={false} error={null} emptyText="" />
        </section>
      )}
    </>
  )
}
