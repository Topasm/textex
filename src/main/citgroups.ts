import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import crypto from 'crypto'
import { CitationGroup } from '../shared/types'
import { loadProjectCitations, saveProjectCitations } from './projectData'

interface ProjectCitationData {
  groups: CitationGroup[]
}

/** Legacy path in userData (for backward compatibility migration). */
function getLegacyDataPath(projectRoot: string): string {
  const hash = crypto.createHash('sha256').update(projectRoot).digest('hex')
  return path.join(app.getPath('userData'), 'projects', `${hash}.json`)
}

/**
 * Load citation groups. Reads from .textex/citations.json first,
 * falling back to the legacy userData/projects/<hash>.json location.
 * If found in legacy location, migrates to .textex/ automatically.
 */
export async function loadCitationGroups(projectRoot: string): Promise<CitationGroup[]> {
  // Try new .textex/ location first
  const projectData = await loadProjectCitations(projectRoot)
  if (projectData.groups.length > 0) {
    return projectData.groups
  }

  // Fall back to legacy userData location
  try {
    const raw = await fs.readFile(getLegacyDataPath(projectRoot), 'utf-8')
    const data: ProjectCitationData = JSON.parse(raw)
    const groups = data.groups ?? []

    // Migrate to .textex/ if we found data
    if (groups.length > 0) {
      await saveProjectCitations(projectRoot, groups).catch(() => {
        /* migration is best-effort */
      })
    }

    return groups
  } catch {
    return []
  }
}

/**
 * Save citation groups to .textex/citations.json.
 */
export async function saveCitationGroups(
  projectRoot: string,
  groups: CitationGroup[]
): Promise<void> {
  await saveProjectCitations(projectRoot, groups)
}
