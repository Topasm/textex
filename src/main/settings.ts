import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import type { RecentProject, RecentProjectUpdates, UserSettings } from '../shared/types'
import { listPapers } from '../shared/structure'

const defaults: UserSettings = {
  theme: 'system',
  fontSize: 14,
  autoCompile: true,
  spellCheckEnabled: false,
  spellCheckLanguage: 'en-US',
  gitEnabled: true,
  autoUpdateEnabled: true,
  lspEnabled: true,
  zoteroEnabled: false,
  zoteroPort: 23119,
  name: '',
  email: '',
  affiliation: '',
  wordWrap: true,
  vimMode: false,
  formatOnSave: true,
  mathPreviewEnabled: true,
  pdfInvertMode: false,
  autoHideSidebar: false,
  sidebarPosition: 'left',
  showStatusBar: true,
  sectionHighlightEnabled: false,
  sectionHighlightColors: [
    '#e06c75',
    '#e5c07b',
    '#98c379',
    '#61afef',
    '#c678dd',
    '#56b6c2',
    '#d19a66'
  ],
  bibGroupMode: 'flat',
  lineNumbers: true,
  tabSize: 4,
  aiEnabled: false,
  aiProvider: '',
  aiApiKey: '',
  aiModel: '',
  aiThinkingEnabled: false,
  aiThinkingBudget: 0,
  aiPromptGenerate: '',
  aiPromptFix: '',
  aiPromptAcademic: '',
  aiPromptSummarize: '',
  aiPromptLonger: '',
  aiPromptShorter: '',
  recentProjects: [],
  language: 'en'
}

function sanitizeSettings(input: unknown): Partial<UserSettings> {
  if (!input || typeof input !== 'object') return {}
  const settings = {
    ...(input as Partial<UserSettings> & {
      minimap?: unknown
    })
  }
  delete settings.minimap
  return settings
}

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

async function loadRecentProjectTitle(projectPath: string): Promise<string | undefined> {
  try {
    const papers = await listPapers(projectPath)
    if (papers.length > 0) {
      return papers[0].title
    }
  } catch {
    // ignore — title stays undefined
  }
  return undefined
}

async function validateRecentProjectPath(projectPath: string): Promise<string> {
  if (typeof projectPath !== 'string' || projectPath.length === 0) {
    throw new Error('Invalid recent project path')
  }
  if (!path.isAbsolute(projectPath)) {
    throw new Error('Recent project path must be absolute')
  }

  const normalizedPath = path.normalize(projectPath)
  let stats
  try {
    stats = await fs.stat(normalizedPath)
  } catch {
    throw new Error('Recent project path not found')
  }

  if (!stats.isDirectory()) {
    throw new Error('Recent project path must be a directory')
  }

  try {
    await fs.access(normalizedPath)
  } catch {
    throw new Error('Recent project path not found')
  }

  return normalizedPath
}

function toRecentProjectPath(projectPath: string): string {
  return path.normalize(projectPath)
}

function pickMoreRecentLastOpened(a: string, b: string): string {
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b
}

export async function loadSettings(): Promise<UserSettings> {
  try {
    const raw = await fs.readFile(getSettingsPath(), 'utf-8')
    const parsed = sanitizeSettings(JSON.parse(raw))
    return { ...defaults, ...parsed }
  } catch {
    return { ...defaults }
  }
}

export async function saveSettings(
  partial: Partial<UserSettings> | Record<string, unknown>
): Promise<UserSettings> {
  const current = sanitizeSettings(await loadSettings())
  const nextPartial = sanitizeSettings(partial)
  const merged = { ...defaults, ...current, ...nextPartial }
  const settingsPath = getSettingsPath()
  const tmpPath = settingsPath + '.tmp'
  try {
    await fs.writeFile(tmpPath, JSON.stringify(merged, null, 2), 'utf-8')
    await fs.rename(tmpPath, settingsPath)
  } catch (err) {
    // Clean up orphaned .tmp file on failure
    try {
      await fs.unlink(tmpPath)
    } catch {
      /* ignore cleanup failure */
    }
    throw err
  }
  return merged
}

export async function addRecentProject(projectPath: string): Promise<UserSettings> {
  const current = await loadSettings()
  const existing = current.recentProjects ?? []
  const normalizedPath = toRecentProjectPath(projectPath)
  const prev = existing.find((p) => p.path === normalizedPath)
  const filtered = existing.filter((p) => p.path !== normalizedPath)

  const title = prev?.title ?? (await loadRecentProjectTitle(normalizedPath))

  const entry = {
    path: normalizedPath,
    name: path.basename(normalizedPath),
    lastOpened: new Date().toISOString(),
    ...(title ? { title } : {}),
    ...(prev?.tag ? { tag: prev.tag } : {}),
    ...(prev?.pinned ? { pinned: prev.pinned } : {})
  }
  const updated = [entry, ...filtered].slice(0, 10)
  return saveSettings({ recentProjects: updated })
}

export async function removeRecentProject(projectPath: string): Promise<UserSettings> {
  const current = await loadSettings()
  const existing = current.recentProjects ?? []
  const normalizedPath = toRecentProjectPath(projectPath)
  const updated = existing.filter((p) => p.path !== normalizedPath)
  return saveSettings({ recentProjects: updated })
}

export async function updateRecentProject(
  projectPath: string,
  updates: RecentProjectUpdates
): Promise<UserSettings> {
  const current = await loadSettings()
  const existing = current.recentProjects ?? []
  const normalizedProjectPath = toRecentProjectPath(projectPath)
  const sourceIndex = existing.findIndex((p) => p.path === normalizedProjectPath)

  if (sourceIndex === -1) {
    throw new Error('Recent project not found')
  }

  const source = existing[sourceIndex]

  if (updates.path === undefined) {
    const updated = existing.map((p) =>
      p.path === normalizedProjectPath ? { ...p, ...updates } : p
    )
    return saveSettings({ recentProjects: updated })
  }

  const normalizedNextPath = await validateRecentProjectPath(updates.path)
  const targetIndex = existing.findIndex(
    (p, index) => index !== sourceIndex && p.path === normalizedNextPath
  )
  const target = targetIndex >= 0 ? existing[targetIndex] : undefined
  const nextTitle = await loadRecentProjectTitle(normalizedNextPath)
  const merged: RecentProject = {
    ...source,
    path: normalizedNextPath,
    name: path.basename(normalizedNextPath),
    lastOpened: target
      ? pickMoreRecentLastOpened(source.lastOpened, target.lastOpened)
      : source.lastOpened,
    ...(updates.tag !== undefined
      ? { tag: updates.tag }
      : source.tag !== undefined
        ? { tag: source.tag }
        : target?.tag !== undefined
          ? { tag: target.tag }
          : {}),
    pinned:
      updates.pinned !== undefined
        ? updates.pinned
        : Boolean(source.pinned) || Boolean(target?.pinned)
  }

  if (nextTitle) {
    merged.title = nextTitle
  } else if (target?.title) {
    merged.title = target.title
  } else {
    delete merged.title
  }

  const updated = existing.filter(
    (_project, index) => index !== sourceIndex && index !== targetIndex
  )
  const insertIndex = targetIndex >= 0 ? Math.min(sourceIndex, targetIndex) : sourceIndex
  updated.splice(insertIndex, 0, merged)

  return saveSettings({ recentProjects: updated })
}
