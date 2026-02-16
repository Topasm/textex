import * as fs from 'fs'
import * as path from 'path'
import * as zlib from 'zlib'
import type { SyncTeXForwardResult, SyncTeXInverseResult } from '../shared/types'

// ============================================================
// SyncTeX parser (from LaTeX-Workshop synctexjs.ts, MIT license)
// ============================================================

type Block = {
  type: string
  parent: Block | Page
  fileNumber: number
  file: InputFile
  line: number
  left: number
  bottom: number
  width: number | undefined
  height: number
  depth?: number
  blocks?: Block[]
  elements?: Block[]
  page: number
}

function isBlock(b: Block | Page): b is Block {
  return (b as Block).parent !== undefined
}

type InputFile = { path: string }
type InputFiles = { [fileNumber: string]: InputFile }
type Page = { page: number; blocks: Block[]; type: string }
type Pages = { [pageNum: string]: Page }
type BlockNumberLine = {
  [inputFileFullPath: string]: {
    [inputLineNum: number]: {
      [pageNum: number]: Block[]
    }
  }
}

type PdfSyncObject = {
  offset: { x: number; y: number }
  version: string
  files: InputFiles
  pages: Pages
  blockNumberLine: BlockNumberLine
  hBlocks: Block[]
  numberPages: number
}

function parseSyncTex(pdfsyncBody: string): PdfSyncObject | undefined {
  const unit = 65781.76
  let numberPages = 0
  let currentPage: Page | undefined
  let currentElement: Block | Page | undefined

  const blockNumberLine = Object.create(null) as BlockNumberLine
  const hBlocks: Block[] = []
  const files = Object.create(null) as InputFiles
  const pages = Object.create(null) as Pages
  const pdfsyncObject: PdfSyncObject = {
    offset: { x: 0, y: 0 },
    version: '',
    files: Object.create(null) as InputFiles,
    pages: Object.create(null) as Pages,
    blockNumberLine: Object.create(null) as BlockNumberLine,
    hBlocks: [],
    numberPages: 0
  }

  if (pdfsyncBody === undefined) {
    return pdfsyncObject
  }

  const lineArray = pdfsyncBody.split('\n')
  pdfsyncObject.version = lineArray[0].replace('SyncTeX Version:', '')

  const inputPattern = /Input:([0-9]+):(.+)/
  const offsetPattern = /(X|Y) Offset:([0-9]+)/
  const openPagePattern = /\{([0-9]+)$/
  const closePagePattern = /\}([0-9]+)$/
  const verticalBlockPattern =
    /\[([0-9]+),([0-9]+):(-?[0-9]+),(-?[0-9]+):(-?[0-9]+),(-?[0-9]+),(-?[0-9]+)/
  const closeverticalBlockPattern = /\]$/
  const horizontalBlockPattern =
    /\(([0-9]+),([0-9]+):(-?[0-9]+),(-?[0-9]+):(-?[0-9]+),(-?[0-9]+),(-?[0-9]+)/
  const closehorizontalBlockPattern = /\)$/
  const elementBlockPattern = /(.)([0-9]+),([0-9]+):(-?[0-9]+),(-?[0-9]+)(:?(-?[0-9]+))?/

  for (let i = 1; i < lineArray.length; i++) {
    const line = lineArray[i]

    // input files
    let match = line.match(inputPattern)
    if (match) {
      files[match[1]] = { path: match[2] }
      continue
    }

    // offset
    match = line.match(offsetPattern)
    if (match) {
      if (match[1].toLowerCase() === 'x') {
        pdfsyncObject.offset.x = parseInt(match[2]) / unit
      } else if (match[1].toLowerCase() === 'y') {
        pdfsyncObject.offset.y = parseInt(match[2]) / unit
      } else {
        return undefined
      }
      continue
    }

    // new page
    match = line.match(openPagePattern)
    if (match) {
      currentPage = { page: parseInt(match[1]), blocks: [], type: 'page' }
      if (currentPage.page > numberPages) {
        numberPages = currentPage.page
      }
      currentElement = currentPage
      continue
    }

    // close page
    match = line.match(closePagePattern)
    if (match && currentPage !== undefined) {
      pages[match[1]] = currentPage
      currentPage = undefined
      continue
    }

    // new V block
    match = line.match(verticalBlockPattern)
    if (match) {
      if (currentPage === undefined || currentElement === undefined) {
        continue
      }
      const s1 = [Number(match[3]) / unit, Number(match[4]) / unit]
      const s2 = [Number(match[5]) / unit, Number(match[6]) / unit]
      const block: Block = {
        type: 'vertical',
        parent: currentElement,
        fileNumber: parseInt(match[1]),
        file: files[match[1]],
        line: parseInt(match[2]),
        left: s1[0],
        bottom: s1[1],
        width: s2[0],
        height: s2[1],
        depth: parseInt(match[7]),
        blocks: [],
        elements: [],
        page: currentPage.page
      }
      currentElement = block
      continue
    }

    // close V block
    match = line.match(closeverticalBlockPattern)
    if (match) {
      if (
        currentElement !== undefined &&
        isBlock(currentElement) &&
        isBlock(currentElement.parent) &&
        currentElement.parent.blocks !== undefined
      ) {
        currentElement.parent.blocks.push(currentElement)
        currentElement = currentElement.parent
      }
      continue
    }

    // new H block
    match = line.match(horizontalBlockPattern)
    if (match) {
      if (currentPage === undefined || currentElement === undefined) {
        continue
      }
      const s1 = [Number(match[3]) / unit, Number(match[4]) / unit]
      const s2 = [Number(match[5]) / unit, Number(match[6]) / unit]
      const block: Block = {
        type: 'horizontal',
        parent: currentElement,
        fileNumber: parseInt(match[1]),
        file: files[match[1]],
        line: parseInt(match[2]),
        left: s1[0],
        bottom: s1[1],
        width: s2[0],
        height: s2[1],
        blocks: [],
        elements: [],
        page: currentPage.page
      }
      hBlocks.push(block)
      currentElement = block
      continue
    }

    // close H block
    match = line.match(closehorizontalBlockPattern)
    if (match) {
      if (
        currentElement !== undefined &&
        isBlock(currentElement) &&
        isBlock(currentElement.parent) &&
        currentElement.parent.blocks !== undefined
      ) {
        currentElement.parent.blocks.push(currentElement)
        currentElement = currentElement.parent
      }
      continue
    }

    // new element
    match = line.match(elementBlockPattern)
    if (match) {
      if (currentPage === undefined || currentElement === undefined || !isBlock(currentElement)) {
        continue
      }
      const type = match[1]
      const fileNumber = parseInt(match[2])
      const lineNumber = parseInt(match[3])
      const left = Number(match[4]) / unit
      const bottom = Number(match[5]) / unit
      const width = match[7] ? Number(match[7]) / unit : undefined

      const elem: Block = {
        type,
        parent: currentElement,
        fileNumber,
        file: files[fileNumber],
        line: lineNumber,
        left,
        bottom,
        height: currentElement.height,
        width,
        page: currentPage.page
      }
      if (elem.file === undefined) {
        continue
      }
      if (blockNumberLine[elem.file.path] === undefined) {
        blockNumberLine[elem.file.path] = Object.create(null) as {
          [inputLineNum: number]: { [pageNum: number]: Block[] }
        }
      }
      if (blockNumberLine[elem.file.path][lineNumber] === undefined) {
        blockNumberLine[elem.file.path][lineNumber] = Object.create(null) as {
          [pageNum: number]: Block[]
        }
      }
      if (blockNumberLine[elem.file.path][lineNumber][elem.page] === undefined) {
        blockNumberLine[elem.file.path][lineNumber][elem.page] = []
      }
      blockNumberLine[elem.file.path][lineNumber][elem.page].push(elem)
      if (currentElement.elements !== undefined) {
        currentElement.elements.push(elem)
      }
      continue
    }
  }

  pdfsyncObject.files = files
  pdfsyncObject.pages = pages
  pdfsyncObject.blockNumberLine = blockNumberLine
  pdfsyncObject.hBlocks = hBlocks
  pdfsyncObject.numberPages = numberPages
  return pdfsyncObject
}

// ============================================================
// SyncTeX lookup (from LaTeX-Workshop worker.ts)
// ============================================================

class Rectangle {
  readonly top: number
  readonly bottom: number
  readonly left: number
  readonly right: number

  constructor({
    top,
    bottom,
    left,
    right
  }: {
    top: number
    bottom: number
    left: number
    right: number
  }) {
    this.top = top
    this.bottom = bottom
    this.left = left
    this.right = right
  }

  include(rect: Rectangle): boolean {
    return (
      this.left <= rect.left &&
      this.right >= rect.right &&
      this.bottom >= rect.bottom &&
      this.top <= rect.top
    )
  }

  distanceFromCenter(x: number, y: number): number {
    return Math.sqrt(
      Math.pow((this.left + this.right) / 2 - x, 2) + Math.pow((this.bottom + this.top) / 2 - y, 2)
    )
  }
}

function getBlocks(
  linePageBlocks: { [inputLineNum: number]: { [pageNum: number]: Block[] } },
  lineNum: number
): Block[] {
  const pageBlocks = linePageBlocks[lineNum]
  const pageNums = Object.keys(pageBlocks)
  if (pageNums.length === 0) {
    return []
  }
  return pageBlocks[Number(pageNums[0])]
}

function toRect(blocks: Block | Block[]): Rectangle {
  if (!Array.isArray(blocks)) {
    const block = blocks
    const top = block.bottom - block.height
    const bottom = block.bottom
    const left = block.left
    const right = block.width ? block.left + block.width : block.left
    return new Rectangle({ top, bottom, left, right })
  } else {
    let cTop = 2e16
    let cBottom = 0
    let cLeft = 2e16
    let cRight = 0

    for (const b of blocks) {
      if (b.elements !== undefined || b.type === 'k' || b.type === 'r') {
        continue
      }
      cBottom = Math.max(b.bottom, cBottom)
      const top = b.bottom - b.height
      cTop = Math.min(top, cTop)
      cLeft = Math.min(b.left, cLeft)
      if (b.width !== undefined) {
        const right = b.left + b.width
        cRight = Math.max(right, cRight)
      }
    }
    return new Rectangle({ top: cTop, bottom: cBottom, left: cLeft, right: cRight })
  }
}

// --- SyncTeX file loading with cache ---

let cachedSyncObject: PdfSyncObject | undefined
let cachedTexFile: string | undefined

export function clearSyncTexCache(): void {
  cachedSyncObject = undefined
  cachedTexFile = undefined
}

function loadSyncTexForFile(texFile: string): PdfSyncObject | undefined {
  // Return cached if same file
  if (cachedTexFile === texFile && cachedSyncObject) {
    return cachedSyncObject
  }

  const basePath = texFile.replace(/\.tex$/, '')
  const synctexPath = basePath + '.synctex'
  const synctexGzPath = basePath + '.synctex.gz'

  let syncObject: PdfSyncObject | undefined

  if (fs.existsSync(synctexPath)) {
    try {
      const content = fs.readFileSync(synctexPath, 'binary')
      syncObject = parseSyncTex(content)
    } catch {
      // Failed to parse .synctex
    }
  } else if (fs.existsSync(synctexGzPath)) {
    try {
      const data = fs.readFileSync(synctexGzPath)
      const decompressed = zlib.gunzipSync(data)
      syncObject = parseSyncTex(decompressed.toString('binary'))
    } catch {
      // Failed to parse .synctex.gz
    }
  }

  if (syncObject) {
    cachedSyncObject = syncObject
    cachedTexFile = texFile
  }
  return syncObject
}

function findInputFilePath(filePath: string, pdfSyncObject: PdfSyncObject): string | undefined {
  const resolvedPath = path.resolve(filePath)
  for (const inputFilePath in pdfSyncObject.blockNumberLine) {
    try {
      if (path.resolve(inputFilePath) === resolvedPath) {
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
  const pdfSyncObject = loadSyncTexForFile(texFile)
  if (!pdfSyncObject) {
    return null
  }

  const inputFilePath = findInputFilePath(texFile, pdfSyncObject)
  if (inputFilePath === undefined) {
    return null
  }

  const linePageBlocks = pdfSyncObject.blockNumberLine[inputFilePath]
  const lineNums = Object.keys(linePageBlocks)
    .map((x) => Number(x))
    .sort((a, b) => a - b)

  if (lineNums.length === 0) {
    return null
  }

  const i = lineNums.findIndex((x) => x >= line)
  if (i === -1) {
    // Line is beyond all known lines — use the last one
    const l = lineNums[lineNums.length - 1]
    const blocks = getBlocks(linePageBlocks, l)
    if (blocks.length === 0) return null
    const c = toRect(blocks)
    return {
      page: blocks[0].page,
      x: c.left + pdfSyncObject.offset.x,
      y: c.bottom + pdfSyncObject.offset.y
    }
  }

  if (i === 0 || lineNums[i] === line) {
    const l = lineNums[i]
    const blocks = getBlocks(linePageBlocks, l)
    if (blocks.length === 0) return null
    const c = toRect(blocks)
    return {
      page: blocks[0].page,
      x: c.left + pdfSyncObject.offset.x,
      y: c.bottom + pdfSyncObject.offset.y
    }
  }

  const line0 = lineNums[i - 1]
  const blocks0 = getBlocks(linePageBlocks, line0)
  const c0 = toRect(blocks0)
  const line1 = lineNums[i]
  const blocks1 = getBlocks(linePageBlocks, line1)
  if (blocks1.length === 0) return null
  const c1 = toRect(blocks1)

  let bottom: number
  if (c0.bottom < c1.bottom) {
    bottom =
      (c0.bottom * (line1 - line)) / (line1 - line0) +
      (c1.bottom * (line - line0)) / (line1 - line0)
  } else {
    bottom = c1.bottom
  }

  return {
    page: blocks1[0].page,
    x: c1.left + pdfSyncObject.offset.x,
    y: bottom + pdfSyncObject.offset.y
  }
}

export async function inverseSync(
  texFile: string,
  page: number,
  x: number,
  y: number
): Promise<SyncTeXInverseResult | null> {
  const pdfSyncObject = loadSyncTexForFile(texFile)
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

  // Verify the file exists
  const resolvedInput = fs.existsSync(record.input) ? record.input : null
  if (!resolvedInput) {
    return null
  }

  return { file: resolvedInput, line: record.line, column: 0 }
}
