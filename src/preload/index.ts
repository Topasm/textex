import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

let compileLogHandler: ((_event: IpcRendererEvent, log: string) => void) | null = null
let diagnosticsHandler: ((_event: IpcRendererEvent, diagnostics: unknown[]) => void) | null = null

contextBridge.exposeInMainWorld('api', {
  openFile: () => ipcRenderer.invoke('fs:open'),
  saveFile: (content: string, filePath: string) => ipcRenderer.invoke('fs:save', content, filePath),
  saveFileAs: (content: string) => ipcRenderer.invoke('fs:save-as', content),
  compile: (filePath: string) => ipcRenderer.invoke('latex:compile', filePath),
  cancelCompile: () => ipcRenderer.invoke('latex:cancel'),
  onCompileLog: (cb: (log: string) => void) => {
    if (compileLogHandler) {
      ipcRenderer.removeListener('latex:log', compileLogHandler)
    }
    compileLogHandler = (_event: IpcRendererEvent, log: string) => cb(log)
    ipcRenderer.on('latex:log', compileLogHandler)
  },
  removeCompileLogListener: () => {
    if (compileLogHandler) {
      ipcRenderer.removeListener('latex:log', compileLogHandler)
      compileLogHandler = null
    }
  },
  onDiagnostics: (cb: (diagnostics: unknown[]) => void) => {
    if (diagnosticsHandler) {
      ipcRenderer.removeListener('latex:diagnostics', diagnosticsHandler)
    }
    diagnosticsHandler = (_event: IpcRendererEvent, diagnostics: unknown[]) => cb(diagnostics)
    ipcRenderer.on('latex:diagnostics', diagnosticsHandler)
  },
  removeDiagnosticsListener: () => {
    if (diagnosticsHandler) {
      ipcRenderer.removeListener('latex:diagnostics', diagnosticsHandler)
      diagnosticsHandler = null
    }
  },
  synctexForward: (texFile: string, line: number) =>
    ipcRenderer.invoke('synctex:forward', texFile, line),
  synctexInverse: (texFile: string, page: number, x: number, y: number) =>
    ipcRenderer.invoke('synctex:inverse', texFile, page, x, y)
})
