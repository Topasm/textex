import React from 'react'
import ReactDOM from 'react-dom/client'
import { initialLanguageReady } from './i18n'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { IconSystemProvider } from './components/ui/IconSystem'
import { installDesktopApi } from './platform/desktopApi'
import { installRuntimePerformance } from './services/runtimePerformance'
import { installRendererSessionBridge } from './services/rendererSession'
import { showStartupError } from './services/startupSurface'
import { hydrateSettingsFromNative, loadNativeSettingsSnapshot } from './store/useSettingsStore'
import './styles/index.css'
import './styles/settings.css'
import './styles/flat.css'
import './styles/responsive.css'
import './styles/research-panel-responsive.css'
import './styles/workspace-controls.css'

// Set platform attribute for CSS-based platform targeting (e.g. title bar overlay padding)
if (navigator.platform.startsWith('Win')) {
  document.documentElement.dataset.platform = 'win32'
} else if (navigator.platform.startsWith('Mac')) {
  document.documentElement.dataset.platform = 'darwin'
} else {
  document.documentElement.dataset.platform = 'linux'
}

async function bootstrap(): Promise<void> {
  // The chosen language is a separate chunk; wait for it so the first paint is
  // not a flash of English.
  await Promise.all([installDesktopApi(), initialLanguageReady])
  const nativeSettings = await loadNativeSettingsSnapshot()
  await Promise.all([
    installRendererSessionBridge(nativeSettings),
    hydrateSettingsFromNative(nativeSettings)
  ])
  installRuntimePerformance()

  const root = document.getElementById('root')
  if (!root) throw new Error('Renderer root is unavailable')

  // The static startup shell remains visible through native API and settings
  // hydration. React replaces those static children during its first commit.
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <IconSystemProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </IconSystemProvider>
    </React.StrictMode>
  )
}

void bootstrap().catch((error: unknown) => {
  const root = document.getElementById('root')
  if (!root) return

  showStartupError(root, error)
})
