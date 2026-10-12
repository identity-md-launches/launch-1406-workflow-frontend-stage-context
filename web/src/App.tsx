import { Layout } from './components/Layout'
import { useRoute, href } from './router'
import { Home } from './pages/Home'
import { Cases } from './pages/Cases'
import { Report } from './pages/Report'
import { Open } from './pages/Open'
import { Trade } from './pages/Trade'
import { How } from './pages/How'
import { Owner } from './pages/Owner'

export function App() {
  const route = useRoute()
  let page
  switch (route.name) {
    case 'home':
      page = <Home />
      break
    case 'cases':
      page = <Cases />
      break
    case 'report':
      page = <Report id={route.id} />
      break
    case 'open':
      page = <Open initialKind={route.kind} />
      break
    case 'trade':
      page = <Trade />
      break
    case 'how':
      page = <How />
      break
    case 'owner':
      page = <Owner />
      break
    case 'missing':
      page = (
        <>
          <h1 className="h-page">No such page</h1>
          <p className="empty">
            Nothing is filed under “{route.path}”. <a href={href({ name: 'home' })}>Go to the home page</a>.
          </p>
        </>
      )
  }
  return <Layout route={route}>{page}</Layout>
}
