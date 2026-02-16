import fs from 'fs/promises'
import path from 'path'

export interface LabelInfo {
  label: string
  file: string
  line: number
  context: string
}

export async function scanLabels(projectRoot: string): Promise<LabelInfo[]> {
  const labels: LabelInfo[] = []
  const labelRegex = /\\label\{([^}]+)\}/g

  try {
    const entries = await fs.readdir(projectRoot, { withFileTypes: true, recursive: true })
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.tex')) continue
      const fullPath = path.join(entry.parentPath || projectRoot, entry.name)
      try {
        const content = await fs.readFile(fullPath, 'utf-8')
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          let match: RegExpExecArray | null
          labelRegex.lastIndex = 0
          while ((match = labelRegex.exec(lines[i])) !== null) {
            labels.push({
              label: match[1],
              file: fullPath,
              line: i + 1,
              context: lines[i].trim()
            })
          }
        }
      } catch {
        // skip unreadable files
      }
    }
  } catch {
    // project root not readable
  }

  return labels
}
