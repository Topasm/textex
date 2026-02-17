import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import crypto from 'crypto'
import { CitationGroup } from '../shared/types'

interface ProjectCitationData {
  groups: CitationGroup[]
}

function getProjectDataPath(projectRoot: string): string {
  const hash = crypto.createHash('sha256').update(projectRoot).digest('hex')
  return path.join(app.getPath('userData'), 'projects', `${hash}.json`)
}

export async function loadCitationGroups(projectRoot: string): Promise<CitationGroup[]> {
  try {
    const raw = await fs.readFile(getProjectDataPath(projectRoot), 'utf-8')
    const data: ProjectCitationData = JSON.parse(raw)
    return data.groups ?? []
  } catch {
    return []
  }
}

export async function saveCitationGroups(
  projectRoot: string,
  groups: CitationGroup[]
): Promise<void> {
  const filePath = getProjectDataPath(projectRoot)
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const data: ProjectCitationData = { groups }
  const tmpPath = filePath + '.tmp'
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  await fs.rename(tmpPath, filePath)
}
