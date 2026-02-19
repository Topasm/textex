import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import AdmZip from 'adm-zip'
import { Template, builtInTemplates } from '../shared/templates'

function getCustomTemplatesPath(): string {
  return path.join(app.getPath('userData'), 'custom-templates.json')
}

export async function loadCustomTemplates(): Promise<Template[]> {
  try {
    const raw = await fs.readFile(getCustomTemplatesPath(), 'utf-8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

async function saveCustomTemplates(templates: Template[]): Promise<void> {
  const filePath = getCustomTemplatesPath()
  const tmpPath = filePath + '.tmp'
  try {
    await fs.writeFile(tmpPath, JSON.stringify(templates, null, 2), 'utf-8')
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

export async function listAllTemplates(): Promise<Template[]> {
  const custom = await loadCustomTemplates()
  return [...builtInTemplates, ...custom]
}

export async function addCustomTemplate(
  name: string,
  description: string,
  content: string
): Promise<Template> {
  const template: Template = {
    id: `custom-${Date.now()}`,
    name,
    description,
    content,
    builtIn: false
  }
  const custom = await loadCustomTemplates()
  custom.push(template)
  await saveCustomTemplates(custom)
  return template
}

export async function removeCustomTemplate(id: string): Promise<{ success: boolean }> {
  if (builtInTemplates.some((t) => t.id === id)) {
    throw new Error('Cannot remove built-in templates')
  }
  const custom = await loadCustomTemplates()
  const filtered = custom.filter((t) => t.id !== id)
  if (filtered.length === custom.length) {
    throw new Error(`Template with id "${id}" not found`)
  }
  await saveCustomTemplates(filtered)
  return { success: true }
}

export async function importTemplateFromZip(zipPath: string): Promise<Template> {
  const zip = new AdmZip(zipPath)
  const entries = zip.getEntries()

  // Find .tex file
  const texEntry = entries.find((e) => !e.isDirectory && e.entryName.endsWith('.tex'))
  if (!texEntry) {
    throw new Error('ZIP file does not contain a .tex file')
  }
  const content = texEntry.getData().toString('utf-8')

  // Look for template.json metadata
  let name = path.basename(zipPath, '.zip')
  let description = 'Imported template'

  const metaEntry = entries.find(
    (e) => !e.isDirectory && path.basename(e.entryName) === 'template.json'
  )
  if (metaEntry) {
    try {
      const meta = JSON.parse(metaEntry.getData().toString('utf-8'))
      if (typeof meta.name === 'string' && meta.name.trim()) {
        name = meta.name.trim()
      }
      if (typeof meta.description === 'string' && meta.description.trim()) {
        description = meta.description.trim()
      }
    } catch {
      // Ignore invalid JSON — use defaults
    }
  }

  return addCustomTemplate(name, description, content)
}
