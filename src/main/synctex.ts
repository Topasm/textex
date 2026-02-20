import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import * as zlib from 'zlib'
import { promisify } from 'util'
import type {
  SyncTeXForwardResult,
  SyncTeXInverseResult,
  SyncTeXLineMapEntry
} from '../shared/types'
import {
  parseSyncTex,
  Rectangle,
  getBlocks,
  getFirstEligibleBlock,
  toRect
} from './utils/syncTexMath'
import type { PdfSyncObject } from './utils/syncTexMath'

const gunzip = promisify(zlib.gunzip)

// --- SyncTeX file loading with cache ---

let cachedSyncObject: PdfSyncObject | undefined
let cachedTexFile: string | undefined

export function clearSyncTexCache(): void {
  cachedSyncObject = undefined
  cachedTexFile = undefined
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function loadSyncTexForFile(texFile: string): Promise<PdfSyncObject | undefined> {
  // Return cached if same file
  if (cachedTexFile === texFile && cachedSyncObject) {
    return cachedSyncObject
  }

  const basePath = texFile.replace(/\.tex$/, '')
  const synctexPath = basePath + '.synctex'
  const synctexGzPath = basePath + '.synctex.gz'

  let syncObject: PdfSyncObject | undefined

  if (await fileExists(synctexPath)) {
    try {
      const content = await fs.readFile(synctexPath, 'utf-8')
      syncObject = parseSyncTex(content)
    } catch (err) {
      console.error('SyncTeX: failed to parse .synctex file:', err)
    }
  } else if (await fileExists(synctexGzPath)) {
    try {
      const data = await fs.readFile(synctexGzPath)
      const decompressed = await gunzip(data)
      syncObject = parseSyncTex(decompressed.toString('utf-8'))
    } catch (err) {
      console.error('SyncTeX: failed to parse .synctex.gz file:', err)
    }
  }

  if (syncObject) {
    cachedSyncObject = syncObject
    cachedTexFile = texFile
  }
  return syncObject
}

function findInputFilePath(filePath: string, pdfSyncObject: PdfSyncObject): string | undefined {
  const resolvedPath = path.resolve(filePath).toLowerCase()
  const fileDir = path.dirname(filePath)
  for (const inputFilePath in pdfSyncObject.blockNumberLine) {
    try {
      // Resolve relative paths from the SyncTeX file against the tex file's directory
      // Use case-insensitive comparison on Windows
      if (path.resolve(fileDir, inputFilePath).toLowerCase() === resolvedPath) {
        return inputFilePath
      }
    } catch {
      /* skip */
    }
  }
  return undefined
}

// --- Public API ---

export async function forwardSync(
  texFile: string,
  line: number
): Promise<SyncTeXForwardResult | null> {
  console.log(`[SyncTeX] forwardSync called: file=${texFile}, line=${line}`)

  const pdfSyncObject = await loadSyncTexForFile(texFile)
  if (!pdfSyncObject) {
    console.warn('[SyncTeX] forwardSync: no sync object for', texFile)
    return null
  }

  const inputFilePath = findInputFilePath(texFile, pdfSyncObject)
  if (inputFilePath === undefined) {
    console.warn(
      '[SyncTeX] forwardSync: no input file match for',
      texFile,
      'available keys:',
      Object.keys(pdfSyncObject.blockNumberLine)
    )
    return null
  }

  console.log(`[SyncTeX] matched input file: "${inputFilePath}"`)

  const linePageBlocks = pdfSyncObject.blockNumberLine[inputFilePath]
  const lineNums = Object.keys(linePageBlocks)
    .map((x) => Number(x))
    .sort((a, b) => a - b)

  if (lineNums.length === 0) {
    console.warn('[SyncTeX] forwardSync: no line entries')
    return null
  }

  console.log(
    `[SyncTeX] lineNums range: ${lineNums[0]}..${lineNums[lineNums.length - 1]} (${lineNums.length} entries), requested line=${line}`
  )

  let result: SyncTeXForwardResult | null = null

  const i = lineNums.findIndex((x) => x >= line)
  if (i === -1) {
    // Line is beyond all known lines — use the last one
    const l = lineNums[lineNums.length - 1]
    const blocks = getBlocks(linePageBlocks, l)
    const first = getFirstEligibleBlock(blocks)
    if (!first) return null
    result = {
      page: first.page,
      x: first.left + pdfSyncObject.offset.x,
      y: first.bottom + pdfSyncObject.offset.y
    }
  } else if (i === 0 || lineNums[i] === line) {
    const l = lineNums[i]
    const blocks = getBlocks(linePageBlocks, l)
    const first = getFirstEligibleBlock(blocks)
    if (!first) return null
    result = {
      page: first.page,
      x: first.left + pdfSyncObject.offset.x,
      y: first.bottom + pdfSyncObject.offset.y
    }
  } else {
    const line0 = lineNums[i - 1]
    const blocks0 = getBlocks(linePageBlocks, line0)
    const first0 = getFirstEligibleBlock(blocks0)
    const line1 = lineNums[i]
    const blocks1 = getBlocks(linePageBlocks, line1)
    const first1 = getFirstEligibleBlock(blocks1)
    if (!first1) return null

    let bottom: number
    if (first0 && first0.bottom < first1.bottom) {
      bottom =
        (first0.bottom * (line1 - line)) / (line1 - line0) +
        (first1.bottom * (line - line0)) / (line1 - line0)
    } else {
      bottom = first1.bottom
    }

    result = {
      page: first1.page,
      x: first1.left + pdfSyncObject.offset.x,
      y: bottom + pdfSyncObject.offset.y
    }
  }

  console.log(`[SyncTeX] forwardSync result: page=${result?.page}, x=${result?.x?.toFixed(2)}, y=${result?.y?.toFixed(2)}`)
  return result
}

export async function inverseSync(
  texFile: string,
  page: number,
  x: number,
  y: number
): Promise<SyncTeXInverseResult | null> {
  const pdfSyncObject = await loadSyncTexForFile(texFile)
  if (!pdfSyncObject) {
    return null
  }

  const y0 = y - pdfSyncObject.offset.y
  const x0 = x - pdfSyncObject.offset.x
  const fileNames = Object.keys(pdfSyncObject.blockNumberLine)

  if (fileNames.length === 0) {
    return null
  }

  const record = {
    input: '',
    line: 0,
    distanceFromCenter: 2e16,
    rect: new Rectangle({ top: 0, bottom: 2e16, left: 0, right: 2e16 })
  }

  for (const fileName of fileNames) {
    const linePageBlocks = pdfSyncObject.blockNumberLine[fileName]
    for (const lineNum in linePageBlocks) {
      const pageBlocks = linePageBlocks[Number(lineNum)]
      for (const pageNum in pageBlocks) {
        if (page !== Number(pageNum)) {
          continue
        }
        const blocks = pageBlocks[Number(pageNum)]
        for (const block of blocks) {
          if (block.elements !== undefined || block.type === 'k' || block.type === 'r') {
            continue
          }
          const rect = toRect(block)
          const distFromCenter = rect.distanceFromCenter(x0, y0)
          if (
            record.rect.include(rect) ||
            (distFromCenter < record.distanceFromCenter && !rect.include(record.rect))
          ) {
            record.input = fileName
            record.line = Number(lineNum)
            record.distanceFromCenter = distFromCenter
            record.rect = rect
          }
        }
      }
    }
  }

  if (record.input === '') {
    return null
  }

  // Resolve relative paths from the SyncTeX file against the tex file's directory
  const candidate = path.resolve(path.dirname(texFile), record.input)
  if (!fsSync.existsSync(candidate)) {
    return null
  }

  return { file: candidate, line: record.line, column: 0 }
}

export async function buildLineMap(texFile: string): Promise<SyncTeXLineMapEntry[]> {
  const pdfSyncObject = await loadSyncTexForFile(texFile)
  if (!pdfSyncObject) return []

  const inputFilePath = findInputFilePath(texFile, pdfSyncObject)
  if (!inputFilePath) return []

  const linePageBlocks = pdfSyncObject.blockNumberLine[inputFilePath]
  const lineNums = Object.keys(linePageBlocks)
    .map(Number)
    .sort((a, b) => a - b)

  const entries: SyncTeXLineMapEntry[] = []
  for (const lineNum of lineNums) {
    const blocks = getBlocks(linePageBlocks, lineNum)
    const first = getFirstEligibleBlock(blocks)
    if (!first) continue
    entries.push({
      line: lineNum,
      page: first.page,
      y: first.bottom + pdfSyncObject.offset.y
    })
  }

  return entries
}
