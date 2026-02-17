import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { UserSettings } from '../shared/types'
import { listPapers } from '../shared/structure'

const defaults: UserSettings = {
  theme: 'light',
  fontSize: 14,
  autoCompile: true,
  spellCheckEnabled: false,
  spellCheckLanguage: 'en-US',
  gitEnabled: true,
  autoUpdateEnabled: true,
  lspEnabled: true,
  zoteroEnabled: false,
  zoteroPort: 23119,
  aiProvider: '',
  aiApiKey: '',
  aiModel: '',
  recentProjects: []
}

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

export async function loadSettings(): Promise<UserSettings> {
  try {
    const raw = await fs.readFile(getSettingsPath(), 'utf-8')
    const parsed = JSON.parse(raw)
    return { ...defaults, ...parsed }
  } catch {
    return { ...defaults }
  }
}

export async function saveSettings(partial: Partial<UserSettings>): Promise<UserSettings> {
  const current = await loadSettings()
  const merged = { ...current, ...partial }
  const settingsPath = getSettingsPath()
  const tmpPath = settingsPath + '.tmp'
  await fs.writeFile(tmpPath, JSON.stringify(merged, null, 2), 'utf-8')
  await fs.rename(tmpPath, settingsPath)
  return merged
}

export async function addRecentProject(projectPath: string): Promise<UserSettings> {
  const current = await loadSettings()
  const existing = current.recentProjects ?? []
  const prev = existing.find((p) => p.path === projectPath)
  const filtered = existing.filter((p) => p.path !== projectPath)

  let title = prev?.title
  if (!title) {
    try {
      const papers = await listPapers(projectPath)
      if (papers.length > 0) {
        title = papers[0].title
      }
    } catch {
      // ignore — title stays undefined
    }
  }

  const entry = {
    path: projectPath,
    name: path.basename(projectPath),
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
  const updated = existing.filter((p) => p.path !== projectPath)
  return saveSettings({ recentProjects: updated })
}

export async function updateRecentProject(
  projectPath: string,
  updates: { tag?: string; pinned?: boolean }
): Promise<UserSettings> {
  const current = await loadSettings()
  const existing = current.recentProjects ?? []
  const updated = existing.map((p) =>
    p.path === projectPath ? { ...p, ...updates } : p
  )
  return saveSettings({ recentProjects: updated })
}
