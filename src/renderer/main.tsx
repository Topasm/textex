import React from 'react'
import ReactDOM from 'react-dom/client'
import './i18n'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { installDesktopApi } from './platform/desktopApi'
import { installRuntimePerformance } from './services/runtimePerformance'
import './styles/index.css'

// Set platform attribute for CSS-based platform targeting (e.g. title bar overlay padding)
if (navigator.platform.startsWith('Win')) {
  document.documentElement.dataset.platform = 'win32'
} else if (navigator.platform.startsWith('Mac')) {
  document.documentElement.dataset.platform = 'darwin'
} else {
  document.documentElement.dataset.platform = 'linux'
}

async function bootstrap(): Promise<void> {
  await installDesktopApi()
  installRuntimePerformance()

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  )
}

void bootstrap().catch((error: unknown) => {
  const root = document.getElementById('root')
  if (!root) return

  const message = error instanceof Error ? error.message : String(error)
  root.textContent = `TextEx failed to start: ${message}`
})
