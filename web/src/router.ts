import { useEffect, useState } from 'react'

/** Hash routing: works from any gateway subpath or ENS name without server rewrites. */
export type Route =
  | { name: 'home' }
  | { name: 'cases' }
  | { name: 'report'; id: bigint }
  | { name: 'open'; kind?: number }
  | { name: 'trade' }
  | { name: 'how' }
  | { name: 'owner' }
  | { name: 'missing'; path: string }

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '')
  const [pathPart, query = ''] = raw.split('?')
  const path = pathPart.replace(/^\/+|\/+$/g, '')
  const params = new URLSearchParams(query)
  if (path === '') return { name: 'home' }
  if (path === 'cases') return { name: 'cases' }
  if (path === 'open') {
    const kind = params.get('kind')
    return { name: 'open', kind: kind === '0' || kind === '1' ? Number(kind) : undefined }
  }
  if (path === 'trade') return { name: 'trade' }
  if (path === 'how') return { name: 'how' }
  if (path === 'owner') return { name: 'owner' }
  const report = path.match(/^report\/(\d+)$/)
  if (report) return { name: 'report', id: BigInt(report[1]) }
  return { name: 'missing', path }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/'
    case 'cases':
      return '#/cases'
    case 'report':
      return `#/report/${route.id.toString()}`
    case 'open':
      return route.kind === undefined ? '#/open' : `#/open?kind=${route.kind}`
    case 'trade':
      return '#/trade'
    case 'how':
      return '#/how'
    case 'owner':
      return '#/owner'
    case 'missing':
      return `#/${route.path}`
  }
}

export function navigate(route: Route) {
  window.location.hash = href(route).slice(1)
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(window.location.hash))
      // A route change is a new page: start at the top and move focus to the main landmark.
      window.scrollTo({ top: 0 })
      const main = document.getElementById('main')
      if (main) main.focus({ preventScroll: true })
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
