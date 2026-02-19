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
  content: string,
  files?: Record<string, string>
): Promise<Template> {
  const template: Template = {
    id: `custom-${Date.now()}`,
    name,
    description,
    content,
    builtIn: false,
    files
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

  const files: Record<string, string> = {}
  let mainTexEntry = null
  let mainTexContent = ''

  // Heuristic to find the "main" tex file
  // 1. "main.tex"
  // 2. Same name as zip file
  // 3. First .tex file found

  const zipName = path.basename(zipPath, '.zip').toLowerCase()

  for (const entry of entries) {
    if (entry.isDirectory) continue

    const entryName = entry.entryName
    const ext = path.extname(entryName).toLowerCase()
    
    // Check if it's a text file we can read directly
    const isText = [
      '.tex', '.sty', '.cls', '.bib', '.bst', '.txt', '.md', '.json', '.xml', '.yaml', '.yml'
    ].includes(ext)

    let content = ''
    if (isText) {
      content = entry.getData().toString('utf-8')
    } else {
      // Binary file - store as base64
      content = entry.getData().toString('base64')
    }

    files[entryName] = content

    // Main tex detection logic
    if (ext === '.tex') {
      const base = path.basename(entryName, '.tex').toLowerCase()
      if (!mainTexEntry) {
        mainTexEntry = entry
        mainTexContent = content
      } else if (base === 'main') {
        mainTexEntry = entry
        mainTexContent = content
      } else if (base === zipName && mainTexEntry.name !== 'main.tex') {
         mainTexEntry = entry
         mainTexContent = content
      }
    }
  }

  if (!mainTexEntry) {
    throw new Error('ZIP file does not contain a .tex file')
  }

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

  // Remove template.json from the files list as we don't need to copy it to the project
  const metaKey = metaEntry?.entryName
  if(metaKey && files[metaKey]) {
      delete files[metaKey]
  }

  // Remove the main tex file from the files list to avoid overwriting it (it's passed as content)
  // actually, keeping it in files is fine, just need to make sure createTemplateProject handles it.
  // But strictly speaking, the old logic passed content separately.
  // Let's keep it in 'files' but also return it as content for backward compatibility if needed,
  // or just rely on 'files' in the new handler.
  // The 'addCustomTemplate' function signature expects 'content'.
  // We should pass the main tex content there.
  
  // Note: addCustomTemplate stores 'content' in the template object.
  // We need to update addCustomTemplate to also store 'files'.
  
  // Wait, I need to update addCustomTemplate first.
  
  return addCustomTemplate(name, description, mainTexContent, files)
}
