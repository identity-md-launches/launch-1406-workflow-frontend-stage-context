import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { loadDeployment } from './config'
import { makeWagmiConfig } from './chain'
import { DeploymentContext } from './hooks/useDeployment'
import { App } from './App'
import './styles.css'

const root = createRoot(document.getElementById('root')!)
root.render(
  <main className="site-main">
    <p role="status">Loading the deployment configuration…</p>
  </main>,
)

loadDeployment()
  .then((deployment) => {
    const config = makeWagmiConfig(deployment)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: 1, staleTime: 4_000, refetchOnWindowFocus: false } },
    })
    root.render(
      <StrictMode>
        <DeploymentContext.Provider value={deployment}>
          <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
              <App />
            </QueryClientProvider>
          </WagmiProvider>
        </DeploymentContext.Provider>
      </StrictMode>,
    )
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    root.render(
      <main className="site-main">
        <h1 className="h-page">SNITCH</h1>
        <p className="tx tx--error" role="alert">
          Unable to start: {message}. The site needs imd-deployment.json and the ABI files beside index.html. Reload to try again.
        </p>
      </main>,
    )
  })
