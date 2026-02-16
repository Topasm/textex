import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

let compileLogHandler: ((_event: IpcRendererEvent, log: string) => void) | null = null

contextBridge.exposeInMainWorld('api', {
  openFile: () => ipcRenderer.invoke('fs:open'),
  saveFile: (content: string, filePath: string) =>
    ipcRenderer.invoke('fs:save', content, filePath),
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
  }
})
