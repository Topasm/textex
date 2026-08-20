import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const tauriHost = process.env.TAURI_DEV_HOST
const isTauriDebug = process.env.TAURI_ENV_DEBUG === 'true'

/**
 * Renderer-only build shared by the Tauri shell.
 *
 * Electron continues to use electron.vite.config.ts while the migration is in
 * progress. Keeping a standalone Vite entry lets both desktop runtimes render
 * the same React application without coupling the renderer to either backend.
 */
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
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
  build: {
    outDir: resolve(__dirname, 'out/tauri-renderer'),
    emptyOutDir: true,
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: isTauriDebug ? false : 'esbuild',
    sourcemap: isTauriDebug,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: resolve(__dirname, 'src/renderer/index.html'),
      output: {
        onlyExplicitManualChunks: true,
        manualChunks: {
          'monaco-editor': ['@monaco-editor/react'],
          katex: ['katex'],
          mathlive: ['mathlive'],
          'vendor-react': ['react', 'react-dom', 'zustand'],
          'vendor-i18n': ['i18next', 'react-i18next'],
          'vendor-ui': ['lucide-react']
        }
      }
    }
  },
  plugins: [react()]
})
