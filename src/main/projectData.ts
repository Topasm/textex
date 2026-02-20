import fs from 'fs/promises'
import path from 'path'
import type {
  ProjectDatabase,
  CompileDatabase,
  CompileRecord,
  ProjectSnippet,
  ProjectBookmark
} from '../shared/types'

const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV

// ---- Defaults ----

const PROJECT_DB_VERSION = 1
const COMPILE_DB_VERSION = 1

function defaultProjectDb(): ProjectDatabase {
  return {
    version: PROJECT_DB_VERSION,
    name: '',
    mainFile: '',
    created: new Date().toISOString(),
    lastOpened: new Date().toISOString(),
    documentClass: '',
    description: '',
    tags: [],
    authors: []
  }
}

function defaultCompileDb(): CompileDatabase {
  return {
    version: COMPILE_DB_VERSION,
    totalCompiles: 0,
    lastCompiled: null,
    records: {}
  }
}

// ---- Path helpers ----

function getTextexDir(projectRoot: string): string {
  return path.join(projectRoot, '.textex')
}

function getProjectDbPath(projectRoot: string): string {
  return path.join(getTextexDir(projectRoot), 'project.json')
}

function getCompileDbPath(projectRoot: string): string {
  return path.join(getTextexDir(projectRoot), 'compile.json')
}

function getSnippetsPath(projectRoot: string): string {
  return path.join(getTextexDir(projectRoot), 'snippets.json')
}

function getBookmarksPath(projectRoot: string): string {
  return path.join(getTextexDir(projectRoot), 'bookmarks.json')
}

function getCitationsPath(projectRoot: string): string {
  return path.join(getTextexDir(projectRoot), 'citations.json')
}

// ---- Generic JSON helpers ----

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const tmpPath = filePath + '.tmp'
  try {
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
    await fs.rename(tmpPath, filePath)
  } catch (err) {
    try {
      await fs.unlink(tmpPath)
    } catch {
      /* ignore cleanup failure */
    }
    throw err
  }
}

// ---- .textex/ Initialization ----

/**
 * Initialize the .textex folder for a project. Creates the folder structure
 * and default database files if they don't exist.
 */
export async function initTextexFolder(projectRoot: string): Promise<ProjectDatabase> {
  const textexDir = getTextexDir(projectRoot)

  // Create folder structure
  await fs.mkdir(path.join(textexDir, 'history'), { recursive: true })
  await fs.mkdir(path.join(textexDir, 'compile'), { recursive: true })

  // Initialize project.json if missing
  let projectDb: ProjectDatabase
  try {
    await fs.access(getProjectDbPath(projectRoot))
    projectDb = await readJson(getProjectDbPath(projectRoot), defaultProjectDb())
  } catch {
    projectDb = defaultProjectDb()
    projectDb.name = path.basename(projectRoot)
    await writeJson(getProjectDbPath(projectRoot), projectDb)
  }

  // Initialize compile.json if missing
  try {
    await fs.access(getCompileDbPath(projectRoot))
  } catch {
    await writeJson(getCompileDbPath(projectRoot), defaultCompileDb())
  }

  // Initialize snippets.json if missing
  try {
    await fs.access(getSnippetsPath(projectRoot))
  } catch {
    await writeJson(getSnippetsPath(projectRoot), [])
  }

  // Initialize bookmarks.json if missing
  try {
    await fs.access(getBookmarksPath(projectRoot))
  } catch {
    await writeJson(getBookmarksPath(projectRoot), [])
  }

  return projectDb
}

// ---- Project Database ----

export async function loadProjectDb(projectRoot: string): Promise<ProjectDatabase> {
  return readJson(getProjectDbPath(projectRoot), defaultProjectDb())
}

export async function saveProjectDb(
  projectRoot: string,
  partial: Partial<ProjectDatabase>
): Promise<ProjectDatabase> {
  const current = await loadProjectDb(projectRoot)
  const merged = { ...current, ...partial }
  await writeJson(getProjectDbPath(projectRoot), merged)
  return merged
}

// ---- Compile Database ----

export async function loadCompileDb(projectRoot: string): Promise<CompileDatabase> {
  return readJson(getCompileDbPath(projectRoot), defaultCompileDb())
}

export async function saveCompileRecord(
  projectRoot: string,
  record: CompileRecord
): Promise<CompileDatabase> {
  const db = await loadCompileDb(projectRoot)
  db.records[record.filePath] = record
  db.totalCompiles++
  db.lastCompiled = record.lastCompiled
  await writeJson(getCompileDbPath(projectRoot), db)
  return db
}

export async function clearCompileDb(projectRoot: string): Promise<CompileDatabase> {
  const db = defaultCompileDb()
  await writeJson(getCompileDbPath(projectRoot), db)
  return db
}

// ---- Compile Logs ----

/**
 * Save a compile log file for a specific compilation run.
 */
export async function saveCompileLog(
  projectRoot: string,
  filePath: string,
  log: string
): Promise<string> {
  const compileDir = path.join(getTextexDir(projectRoot), 'compile')
  await fs.mkdir(compileDir, { recursive: true })
  const baseName = path.basename(filePath, '.tex')
  const logPath = path.join(compileDir, `${baseName}.log`)
  await fs.writeFile(logPath, log, 'utf-8')
  return logPath
}

/**
 * Load the last compile log for a file.
 */
export async function loadCompileLog(
  projectRoot: string,
  filePath: string
): Promise<string | null> {
  try {
    const baseName = path.basename(filePath, '.tex')
    const logPath = path.join(getTextexDir(projectRoot), 'compile', `${baseName}.log`)
    return await fs.readFile(logPath, 'utf-8')
  } catch {
    return null
  }
}

// ---- Snippets ----

export async function loadSnippets(projectRoot: string): Promise<ProjectSnippet[]> {
  return readJson(getSnippetsPath(projectRoot), [])
}

export async function saveSnippets(projectRoot: string, snippets: ProjectSnippet[]): Promise<void> {
  await writeJson(getSnippetsPath(projectRoot), snippets)
}

export async function addSnippet(
  projectRoot: string,
  snippet: Omit<ProjectSnippet, 'id'>
): Promise<ProjectSnippet> {
  const snippets = await loadSnippets(projectRoot)
  const newSnippet: ProjectSnippet = { ...snippet, id: `snippet-${Date.now()}` }
  snippets.push(newSnippet)
  await saveSnippets(projectRoot, snippets)
  return newSnippet
}

export async function removeSnippet(projectRoot: string, id: string): Promise<void> {
  const snippets = await loadSnippets(projectRoot)
  const filtered = snippets.filter((s) => s.id !== id)
  await saveSnippets(projectRoot, filtered)
}

// ---- Bookmarks ----

export async function loadBookmarks(projectRoot: string): Promise<ProjectBookmark[]> {
  return readJson(getBookmarksPath(projectRoot), [])
}

export async function saveBookmarks(
  projectRoot: string,
  bookmarks: ProjectBookmark[]
): Promise<void> {
  await writeJson(getBookmarksPath(projectRoot), bookmarks)
}

export async function addBookmark(
  projectRoot: string,
  bookmark: Omit<ProjectBookmark, 'id' | 'created'>
): Promise<ProjectBookmark> {
  const bookmarks = await loadBookmarks(projectRoot)
  const newBookmark: ProjectBookmark = {
    ...bookmark,
    id: `bm-${Date.now()}`,
    created: new Date().toISOString()
  }
  bookmarks.push(newBookmark)
  await saveBookmarks(projectRoot, bookmarks)
  return newBookmark
}

export async function removeBookmark(projectRoot: string, id: string): Promise<void> {
  const bookmarks = await loadBookmarks(projectRoot)
  const filtered = bookmarks.filter((b) => b.id !== id)
  await saveBookmarks(projectRoot, filtered)
}

// ---- Citations (per-project, replaces userData hash) ----

export async function loadProjectCitations(
  projectRoot: string
): Promise<{ groups: import('../shared/types').CitationGroup[] }> {
  return readJson(getCitationsPath(projectRoot), { groups: [] })
}

export async function saveProjectCitations(
  projectRoot: string,
  groups: import('../shared/types').CitationGroup[]
): Promise<void> {
  await writeJson(getCitationsPath(projectRoot), { groups })
}

// ---- Utility ----

/**
 * Check if a .textex folder exists for a project.
 */
export async function hasTextexFolder(projectRoot: string): Promise<boolean> {
  try {
    await fs.access(getTextexDir(projectRoot))
    return true
  } catch {
    return false
  }
}

/**
 * Get the .textex directory path for a project.
 */
export function getTextexPath(projectRoot: string): string {
  return getTextexDir(projectRoot)
}

/**
 * Touch the lastOpened timestamp in project.json.
 */
export async function touchProject(projectRoot: string): Promise<void> {
  try {
    await saveProjectDb(projectRoot, { lastOpened: new Date().toISOString() })
  } catch (error) {
    if (isDev) console.error('Failed to touch project:', error)
  }
}
