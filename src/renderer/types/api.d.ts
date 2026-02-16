interface OpenFileResult {
  content: string
  filePath: string
}

interface SaveResult {
  success: boolean
}

interface SaveAsResult {
  filePath: string
}

interface CompileResult {
  pdfBase64: string
}

interface ElectronAPI {
  openFile(): Promise<OpenFileResult | null>
  saveFile(content: string, filePath: string): Promise<SaveResult>
  saveFileAs(content: string): Promise<SaveAsResult | null>
  compile(filePath: string): Promise<CompileResult>
  cancelCompile(): Promise<boolean>
  onCompileLog(cb: (log: string) => void): void
  removeCompileLogListener(): void
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}

export {}
