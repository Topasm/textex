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
  onDiagnostics(cb: (diagnostics: Diagnostic[]) => void): void
  removeDiagnosticsListener(): void
  synctexForward(texFile: string, line: number): Promise<SyncTeXForwardResult | null>
  synctexInverse(texFile: string, page: number, x: number, y: number): Promise<SyncTeXInverseResult | null>
}

declare global {
  type DiagnosticSeverity = 'error' | 'warning' | 'info'

  interface Diagnostic {
    file: string
    line: number
    column?: number
    severity: DiagnosticSeverity
    message: string
  }

  interface SyncTeXForwardResult {
    page: number
    x: number
    y: number
  }

  interface SyncTeXInverseResult {
    file: string
    line: number
    column: number
  }

  interface Window {
    api: ElectronAPI
  }
}

export {}
