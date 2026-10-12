import { ReportCard } from '../components/ReportCard'
import { exampleCase, isReport } from '../lib/cases'
import { useCases } from '../hooks/useDesk'
import { href } from '../router'
import { ReportList } from './Cases'

export function Home() {
  const cases = useCases()
  const latest = (cases.data ?? []).filter(isReport).slice(0, 5)
  return (
    <>
      <section className="hero">
        <h1 className="h-display">The swarm snitches on every wallet.</h1>
        <p className="lede">Open a case on any wallet. The IMD swarm reads the chain and stamps the answer.</p>
        <div className="hero__grid">
          <ReportCard c={exampleCase} example title="Example report card: 0x8f3a…91c2 never sold PEPE between block 21,004,118 and block 21,077,903. CLEAN, checked by 11 of 12 agents." />
          <div className="folders" aria-label="Case kinds">
            <h2 className="h-section">Two kinds of case</h2>
            <a className="folder" href={href({ name: 'open', kind: 0 })}>
              <span className="folder__tab">Kind 0</span>
              <span className="folder__title">Never sold</span>
              <span className="folder__body">Wallet W sent zero of token T between blocks A and B. The swarm sums T's Transfer logs from W.</span>
              <span className="folder__cta">Open a never-sold case</span>
            </a>
            <a className="folder" href={href({ name: 'open', kind: 1 })}>
              <span className="folder__tab">Kind 1</span>
              <span className="folder__title">Got in early</span>
              <span className="folder__body">Wallet W received token T between blocks A and B. The swarm sums T's Transfer logs to W.</span>
              <span className="folder__cta">Open a got-in-early case</span>
            </a>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="section__head">
          <h2 className="h-section">Latest reports</h2>
          <a href={href({ name: 'cases' })}>See all case files</a>
        </div>
        <ReportList cases={latest} loading={cases.isLoading} error={cases.error} emptyText="No report has been stamped yet. Open the first case." />
      </section>
    </>
  )
}
