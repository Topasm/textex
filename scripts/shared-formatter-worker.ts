import { resolve } from 'node:path'
import { normalizePath, type Plugin } from 'vite'

/** Keep the worker and renderer fallback in one graph so they share Prettier. */
export function sharedFormatterWorker(): Plugin {
  const publicId = 'virtual:formatter-worker-url'
  const resolvedId = `\0${publicId}`
  const workerPath = normalizePath(resolve(__dirname, '../src/renderer/utils/formatter.worker.ts'))
  let building = false
  return {
    name: 'textex-shared-formatter-worker',
    configResolved(config) {
      building = config.command === 'build'
    },
    resolveId(id) {
      if (id === publicId) return resolvedId
    },
    load(id) {
      if (id !== resolvedId) return
      if (!building) {
        return `export { default } from ${JSON.stringify(`${workerPath}?worker&url`)}`
      }
      const reference = this.emitFile({ type: 'chunk', id: workerPath, name: 'formatter.worker' })
      return `export default import.meta.ROLLUP_FILE_URL_${reference}`
    }
  }
}
