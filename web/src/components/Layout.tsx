import type { ReactNode } from 'react'
import { useAccount } from 'wagmi'
import { href, type Route } from '../router'
import { Connect } from './Connect'
import { AddressChip } from './AddressChip'
import { useDeployment } from '../hooks/useDeployment'
import { useDeskInfo } from '../hooks/useDesk'
import { useEnsureChain } from '../hooks/useEnsureChain'

const nav: { route: Route; label: string }[] = [
  { route: { name: 'home' }, label: 'Home' },
  { route: { name: 'cases' }, label: 'Case files' },
  { route: { name: 'open' }, label: 'Open a case' },
  { route: { name: 'trade' }, label: 'Trade SNITCH' },
  { route: { name: 'how' }, label: 'How it works' },
]

export function Layout({ route, children }: { route: Route; children: ReactNode }) {
  const d = useDeployment()
  const desk = useDeskInfo()
  const { address } = useAccount()
  const { wrongChain, chainName, switchToConfigured, busy, error: switchError } = useEnsureChain()
  const isOwner = !!address && !!desk.owner && address.toLowerCase() === desk.owner.toLowerCase()
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="site-header__row">
          <a className="brand" href="#/" aria-label="SNITCH home">
            SNITCH
          </a>
          <Connect />
        </div>
        <nav className="nav" aria-label="Main">
          <ul>
            {nav.map((item) => (
              <li key={item.label}>
                <a href={href(item.route)} aria-current={route.name === item.route.name ? 'page' : undefined}>
                  {item.label}
                </a>
              </li>
            ))}
            {isOwner && (
              <li>
                <a href={href({ name: 'owner' })} aria-current={route.name === 'owner' ? 'page' : undefined}>
                  Owner settings
                </a>
              </li>
            )}
          </ul>
        </nav>
        {wrongChain && (
          <div className="banner" role="status">
            <span>This wallet is on another network. SNITCH lives on {chainName}.</span>
            <button type="button" className="btn btn--primary btn--small" onClick={switchToConfigured} disabled={busy}>
              {busy ? 'Switching…' : `Switch to ${chainName}`}
            </button>
            {switchError && (
              <p className="tx tx--error" role="alert">
                {switchError}
              </p>
            )}
          </div>
        )}
      </header>
      <main id="main" className="site-main" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <h2 className="h-small">Addresses</h2>
        <ul className="footer__list">
          <li>
            <AddressChip label="SNITCH token" address={d.addresses.LaunchToken} full />
          </li>
          <li>
            <AddressChip label="SnitchDesk" address={d.addresses.SnitchDesk} full />
          </li>
          {desk.reports && (
            <li>
              <AddressChip label="Snitch Reports (NFT)" address={desk.reports} full />
            </li>
          )}
          <li>
            <AddressChip label="SnitchArt" address={d.addresses.SnitchArt} full />
          </li>
          {d.network && (
            <li>
              <AddressChip label={`${d.network.pairToken.symbol} token`} address={d.network.pairToken.address} full />
            </li>
          )}
          {desk.intake && (
            <li>
              <AddressChip label="IMD Intake" address={desk.intake} full />
            </li>
          )}
          {d.poolKey && (
            <li>
              <AddressChip label="Pool hook" address={d.poolKey.hooks} full />
            </li>
          )}
        </ul>
        <p className="footer__meta">
          {d.network ? `${d.network.name} (chain ${d.chainId})` : `Chain ${d.chainId}`}. Source commit{' '}
          <span className="mono">{d.sourceCommit.slice(0, 12)}</span>. Launch <span className="mono">{d.launchId}</span>.
          No backend, no trackers: this page reads public RPCs and your wallet signs.
        </p>
      </footer>
    </>
  )
}
