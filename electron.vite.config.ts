import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: resolve(__dirname, 'out/main'),
      lib: {
        entry: {
          main: resolve(__dirname, 'src/main/main.ts'),
          'workers/logParserWorker': resolve(__dirname, 'src/main/workers/logParserWorker.ts'),
          'workers/spellWorker': resolve(__dirname, 'src/main/workers/spellWorker.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: resolve(__dirname, 'out/preload'),
      lib: {
        entry: resolve(__dirname, 'src/preload/index.ts')
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        // monaco-vim still uses the pre-0.56 deep path, before Monaco added exports.
        'monaco-editor/esm/vs/editor/editor.api': 'monaco-editor/editor/editor.api',
        'monaco-editor/esm/vs/editor/common/commands/shiftCommand':
          'monaco-editor/editor/common/commands/shiftCommand'
      }
    },
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
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
  }
})
