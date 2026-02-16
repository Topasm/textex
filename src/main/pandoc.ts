import { app } from 'electron'
import {
  getPandocPath as getSharedPandocPath,
  exportDocument as sharedExportDocument,
  getPandocFormats
} from '../shared/pandoc'
import type { ExportResult } from '../shared/pandoc'

export { getPandocFormats }
export type { ExportResult }

const isDev = !app.isPackaged

function getPandocPath(): string {
  return getSharedPandocPath({
    isDev,
    resourcesPath: isDev ? undefined : process.resourcesPath
  })
}

export async function exportDocument(
  inputPath: string,
  outputPath: string,
  format: string
): Promise<ExportResult> {
  return sharedExportDocument(inputPath, outputPath, format, getPandocPath())
}
