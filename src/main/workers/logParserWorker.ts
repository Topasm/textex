import { parentPort } from 'worker_threads'
import { parseLatexLog } from '../logparser'

parentPort?.on('message', (msg: { log: string; rootFile: string }) => {
  const diagnostics = parseLatexLog(msg.log, msg.rootFile)
  parentPort?.postMessage(diagnostics)
})
