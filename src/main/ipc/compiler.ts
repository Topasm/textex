import { ipcMain, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { compileLatex, cancelCompilation } from '../compiler'
import { findRootFile } from '../../shared/magicComments'
import type { CompileRequest } from '../../shared/compileProtocol'

function validateFilePath(filePath: unknown): string {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('Invalid file path')
  }
  if (!path.isAbsolute(filePath)) {
    throw new Error('File path must be absolute')
  }
  return filePath
}

function validateCompileRequest(value: unknown): CompileRequest {
  if (!value || typeof value !== 'object') throw new Error('Invalid compile request')
  const request = value as Partial<CompileRequest>
  const filePath = validateFilePath(request.filePath)
  if (!Number.isSafeInteger(request.requestId) || (request.requestId ?? 0) <= 0) {
    throw new Error('Invalid compile request id')
  }
  if (typeof request.documentId !== 'string' || request.documentId.length === 0) {
    throw new Error('Invalid compile document id')
  }
  if (!Number.isSafeInteger(request.documentRevision) || (request.documentRevision ?? -1) < 0) {
    throw new Error('Invalid compile document revision')
  }
  if (!['high', 'normal', 'background'].includes(request.priority ?? '')) {
    throw new Error('Invalid compile priority')
  }
  return { ...request, filePath } as CompileRequest
}

export function registerCompilerHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('latex:compile', async (_event, value: unknown) => {
    const request = validateCompileRequest(value)
    const validPath = request.filePath

    // Only compile .tex files
    if (!validPath.toLowerCase().endsWith('.tex')) {
      throw new Error('Only .tex files can be compiled')
    }

    // Resolve magic comment (%! TeX root = ...) to compile the root file
    let compilePath = validPath
    try {
      const content = await fs.readFile(validPath, 'utf-8')
      compilePath = findRootFile(content, validPath)
    } catch {
      // If we can't read the file, compile the original path
    }

    const result = await compileLatex(compilePath, getWindow()!, request.priority, request)
    return {
      requestId: request.requestId,
      documentId: request.documentId,
      documentRevision: request.documentRevision,
      compiledFilePath: compilePath,
      pdfPath: result.pdfPath
    }
  })

  ipcMain.handle('latex:cancel', () => {
    return cancelCompilation()
  })
}
