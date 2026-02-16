import { app, BrowserWindow } from 'electron'
import { parseLatexLog } from './logparser'
import { clearSyncTexCache } from './synctex'
import {
  getTectonicPath as getSharedTectonicPath,
  compileLatex as sharedCompileLatex,
  cancelCompilation
} from '../shared/compiler'
import type { CompileResult } from '../shared/compiler'

export { cancelCompilation }
export type { CompileResult }

const isDev = !app.isPackaged

function getTectonicPath(): string {
  return getSharedTectonicPath({
    isDev,
    resourcesPath: isDev ? undefined : process.resourcesPath
  })
}

export async function compileLatex(filePath: string, win: BrowserWindow): Promise<CompileResult> {
  // Invalidate SyncTeX cache so it's re-parsed after compilation
  clearSyncTexCache()

  return sharedCompileLatex(filePath, {
    tectonicPath: getTectonicPath(),
    onLog: (text: string) => {
      win.webContents.send('latex:log', text)
    },
    onDiagnostics: (output: string, file: string) => {
      try {
        const diagnostics = parseLatexLog(output, file)
        win.webContents.send('latex:diagnostics', diagnostics)
      } catch {
        // Don't let diagnostic parsing failures affect compilation
      }
    },
    synctex: true,
    reruns: 2
  })
}
