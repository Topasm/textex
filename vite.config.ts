import { resolve } from 'path'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const tauriHost = process.env.TAURI_DEV_HOST
const isTauriDebug = process.env.TAURI_ENV_DEBUG === 'true'
const packageVersion = (
  JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version: string }
).version

/** Renderer build embedded by the Tauri shell. */
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  define: {
    __APP_VERSION__: JSON.stringify(packageVersion)
  },
  resolve: {
    alias: {
      // monaco-vim still imports Monaco's pre-0.56 deep paths.
      'monaco-editor/esm/vs/editor/editor.api': 'monaco-editor/editor/editor.api',
      'monaco-editor/esm/vs/editor/common/commands/shiftCommand':
        'monaco-editor/editor/common/commands/shiftCommand'
    }
  },
  server: {
    host: tauriHost || '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**']
    },
    hmr: tauriHost
      ? {
          protocol: 'ws',
          host: tauriHost,
          port: 5174
        }
      : undefined
  },
  worker: {
    // The formatter worker lazy-loads Prettier and its LaTeX plugin. ES module
    // workers allow Vite to preserve that split instead of forcing an IIFE.
    format: 'es'
  },
  build: {
    outDir: resolve(__dirname, 'out/tauri-renderer'),
    emptyOutDir: true,
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !isTauriDebug,
    sourcemap: isTauriDebug,
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      input: resolve(__dirname, 'src/renderer/index.html'),
      output: {
        codeSplitting: {
          // Keep lazy editor/PDF dependencies out of the initial UI chunks.
          includeDependenciesRecursively: false,
          groups: [
            {
              name: 'monaco-editor',
              test: /node_modules\/(@monaco-editor\/(react|loader)|state-local)\//
            },
            { name: 'katex', test: /node_modules\/katex\// },
            // CommonJS shims must travel with React, or manual splitting can
            // make them depend on the app entry before it has initialized.
            {
              name: 'vendor-react',
              test: /node_modules\/(react|react-dom|zustand|scheduler|use-sync-external-store)\//
            },
            { name: 'vendor-i18n', test: /node_modules\/(i18next|react-i18next)\// },
            { name: 'vendor-ui', test: /node_modules\/lucide-react\// }
          ]
        }
      }
    }
  },
  plugins: [react()]
})
