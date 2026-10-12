import { useEffect, useState } from 'react'
import type { Case } from '../lib/cases'
import { Status } from '../lib/cases'
import { caseNumber, commas, kindVerb, shortAddress, utcDate, verdictWord } from '../lib/format'

type Props = {
  c: Case
  /** Marks the home-page sample. */
  example?: boolean
  /** Plays the stamp drop once when a verdict arrives while the card is on screen. */
  animateStamp?: boolean
  title?: string
}

/**
 * The report card, drawn client-side with the same geometry as SnitchArt.svg (480×640): a page
 * torn from a case file with the claim, the panel numbers, the UTC date and a tilted rubber stamp.
 * An open case shows the page without a stamp.
 */
export function ReportCard({ c, example, animateStamp, title }: Props) {
  const answered = c.status === Status.Answered || c.status === Status.Filed
  const [dropped, setDropped] = useState(!animateStamp)
  useEffect(() => {
    if (animateStamp && answered) {
      const t = window.setTimeout(() => setDropped(true), 20)
      return () => window.clearTimeout(t)
    }
  }, [animateStamp, answered])
  const colour = c.verdict ? 'var(--color-verdict-clean)' : 'var(--color-verdict-snitched)'
  const label = title ?? `Case file No. ${caseNumber(c.id)}: ${shortAddress(c.wallet)} ${kindVerb(c.kind)} ${c.symbol} between block ${commas(c.fromBlock)} and block ${commas(c.toBlock)}. ${answered ? `${verdictWord(c.verdict)}, checked by ${c.agreed} of ${c.panelSize} agents.` : 'Awaiting the swarm.'}`
  return (
    <figure className={`card${example ? ' card--example' : ''}`}>
      <svg className="card__svg" viewBox="0 0 480 640" role="img" aria-label={label}>
        <rect width="480" height="640" fill="var(--color-paper)" />
        <rect x="14" y="14" width="452" height="612" fill="none" stroke="var(--color-ink)" strokeWidth="2" />
        <line x1="40" y1="96" x2="440" y2="96" stroke="var(--color-ink)" strokeWidth="2" />
        <text x="40" y="64" className="card__headline" fontSize="40" fontWeight="700" fill="var(--color-ink)">
          SNITCH
        </text>
        <text x="40" y="86" className="card__headline" fontSize="18" fontWeight="700" fill="var(--color-ink)">
          CASE FILE No. {caseNumber(c.id)}
        </text>
        <text x="40" y="150" className="card__body" fontSize="22" fill="var(--color-ink)">
          <tspan x="40" dy="0" className="card__mono">
            {shortAddress(c.wallet)}
          </tspan>
          <tspan x="40" dy="34">
            {kindVerb(c.kind)} {c.symbol}
          </tspan>
          <tspan x="40" dy="34">
            between block <tspan className="card__mono">{commas(c.fromBlock)}</tspan>
          </tspan>
          <tspan x="40" dy="34">
            and block <tspan className="card__mono">{commas(c.toBlock)}</tspan>
          </tspan>
        </text>
        {answered ? (
          <>
            <text x="40" y="540" className="card__body" fontSize="18" fill="var(--color-ink)">
              Checked by {c.panelSize} agents. {c.agreed} agreed.
            </text>
            <text x="40" y="572" className="card__mono" fontSize="16" fill="var(--color-ink)">
              {utcDate(c.issuedAt)} UTC
            </text>
          </>
        ) : (
          <text x="40" y="540" className="card__body" fontSize="18" fill="var(--color-ink)">
            {c.status === Status.Dropped ? 'Dropped. Fee refunded.' : 'Awaiting the swarm.'}
          </text>
        )}
        <text x="40" y="604" className="card__mono" fontSize="12" fill="var(--color-ink)">
          {c.token.toLowerCase()}
        </text>
        {answered && (
          <g className={`stamp${dropped ? ' stamp--down' : ''}`} transform="rotate(-12 300 420)" opacity="0.92">
            <rect
              x={c.verdict ? 210 : 150}
              y="380"
              width={c.verdict ? 180 : 300}
              height="80"
              rx="6"
              fill="none"
              stroke={colour}
              strokeWidth="6"
            />
            <text
              x="300"
              y="437"
              textAnchor="middle"
              className="card__headline"
              fontSize={c.verdict ? 56 : 58}
              fontWeight="700"
              letterSpacing="4"
              fill={colour}
            >
              {verdictWord(c.verdict)}
            </text>
          </g>
        )}
      </svg>
      {example && <figcaption className="card__tag">Example</figcaption>}
    </figure>
  )
}
