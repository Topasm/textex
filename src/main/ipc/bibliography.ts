import { ipcMain } from 'electron'
import path from 'path'
import { parseBibFile, findBibFilesInProject } from '../../shared/bibparser'
import { loadCitationGroups, saveCitationGroups } from '../citgroups'
import { zoteroProbe, zoteroSearch, zoteroCiteCAYW, zoteroExportBibtex } from '../zotero'
import { CitationGroup } from '../../shared/types'

function validateFilePath(filePath: unknown): string {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('Invalid file path')
  }
  if (!path.isAbsolute(filePath)) {
    throw new Error('File path must be absolute')
  }
  return filePath
}

export function registerBibliographyHandlers(): void {
  ipcMain.handle('bib:parse', async (_event, filePath: string) => {
    const validPath = validateFilePath(filePath)
    return parseBibFile(validPath)
  })

  ipcMain.handle('bib:find-in-project', async (_event, projectRoot: string) => {
    const validPath = validateFilePath(projectRoot)
    return findBibFilesInProject(validPath)
  })

  // ---- Zotero ----
  ipcMain.handle('zotero:probe', (_e, port?: number) => zoteroProbe(port))
  ipcMain.handle('zotero:search', (_e, term: string, port?: number) => zoteroSearch(term, port))
  ipcMain.handle('zotero:cite-cayw', (_e, port?: number) => zoteroCiteCAYW(port))
  ipcMain.handle('zotero:export-bibtex', (_e, citekeys: string[], port?: number) =>
    zoteroExportBibtex(citekeys, port)
  )

  // ---- Citation Groups ----
  ipcMain.handle('citgroups:load', async (_event, projectRoot: string) => {
    const validPath = validateFilePath(projectRoot)
    return loadCitationGroups(validPath)
  })

  ipcMain.handle('citgroups:save', async (_event, projectRoot: string, groups: CitationGroup[]) => {
    const validPath = validateFilePath(projectRoot)
    await saveCitationGroups(validPath, groups)
    return { success: true }
  })
}
