import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  openFile: () => ipcRenderer.invoke('fs:open'),
  saveFile: (content: string, filePath: string) =>
    ipcRenderer.invoke('fs:save', content, filePath),
  saveFileAs: (content: string) => ipcRenderer.invoke('fs:save-as', content),
  compile: (filePath: string) => ipcRenderer.invoke('latex:compile', filePath),
  onCompileLog: (cb: (log: string) => void) => {
    ipcRenderer.on('latex:log', (_event, log) => cb(log))
  },
  removeCompileLogListener: () => {
    ipcRenderer.removeAllListeners('latex:log')
  }
})
