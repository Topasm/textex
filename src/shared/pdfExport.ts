export interface PdfExportResult {
  outputPath: string
  folderOpened: boolean
}

export type PdfShareResult = 'shared' | 'cancelled' | 'unsupported'
