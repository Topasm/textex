import { mergeConfig } from 'vite'
import { resolve } from 'node:path'
import appConfig from '../../vite.config.ts'

export default mergeConfig(appConfig, {
  root: resolve('tests/browser'),
  server: { host: '127.0.0.1', port: 5193, strictPort: true, fs: { allow: [resolve('.')] } },
  preview: { host: '127.0.0.1', port: 5193, strictPort: true },
  build: {
    outDir: resolve('out/browser-test'),
    rolldownOptions: { input: resolve('tests/browser/index.html') }
  }
})
