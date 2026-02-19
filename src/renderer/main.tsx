import React from 'react'
import ReactDOM from 'react-dom/client'
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import './i18n'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './styles/index.css'

loader.config({ monaco })

// Set platform attribute for CSS-based platform targeting (e.g. title bar overlay padding)
if (navigator.platform.startsWith('Win')) {
  document.documentElement.dataset.platform = 'win32'
} else if (navigator.platform.startsWith('Mac')) {
  document.documentElement.dataset.platform = 'darwin'
} else {
  document.documentElement.dataset.platform = 'linux'
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
