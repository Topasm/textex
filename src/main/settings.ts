import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'

export interface UserSettings {
  theme: 'dark' | 'light' | 'high-contrast'
  fontSize: number
  autoCompile: boolean
  spellCheckEnabled: boolean
  spellCheckLanguage: string
  gitEnabled: boolean
  autoUpdateEnabled: boolean
  lspEnabled: boolean
  texlabPath: string
}

const defaults: UserSettings = {
  theme: 'light',
  fontSize: 14,
  autoCompile: true,
  spellCheckEnabled: false,
  spellCheckLanguage: 'en-US',
  gitEnabled: true,
  autoUpdateEnabled: true,
  lspEnabled: true,
  texlabPath: ''
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
