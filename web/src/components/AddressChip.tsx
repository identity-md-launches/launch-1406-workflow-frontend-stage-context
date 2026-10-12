import { useState } from 'react'
import { checksum, shortAddress } from '../lib/format'
import { useExplorer } from '../hooks/useDeployment'

type Props = { address: string; label?: string; full?: boolean }

/** An address with its checksummed form, an explorer link and a copy control. */
export function AddressChip({ address, label, full }: Props) {
  const explorer = useExplorer()
  const [copied, setCopied] = useState(false)
  const value = checksum(address)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  const link = explorer.address(value)
  return (
    <span className="chip">
      {label && <span className="chip__label">{label}</span>}
      {link ? (
        <a className="chip__value mono" href={link} target="_blank" rel="noopener noreferrer" title={value}>
          {full ? value : shortAddress(value)}
        </a>
      ) : (
        <span className="chip__value mono" title={value}>
          {full ? value : shortAddress(value)}
        </span>
      )}
      <button type="button" className="chip__copy" onClick={copy} aria-label={`Copy ${label ?? 'address'} ${value}`}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  )
}
