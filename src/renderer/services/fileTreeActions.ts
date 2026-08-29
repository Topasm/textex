import { useEditorStore } from '../store/useEditorStore'
import { useUiStore } from '../store/useUiStore'
import { flushPendingDocumentEdits } from './pendingDocumentEdits'
import { documentRegistry } from '../models/documentRegistry'

export interface FileTreeActionEntry {
  name: string
  path: string
}

export type FileTreeRenameResult =
  | { status: 'unchanged' | 'invalid-name' | 'dirty-documents' }
  | { status: 'renamed'; destination: string }

export type FileTreeDeleteResult =
  { status: 'cancelled' | 'dirty-documents' } | { status: 'deleted' }

function pathIdentity(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  return /^[a-zA-Z]:\//.test(normalized) || normalized.startsWith('//')
    ? normalized.toLocaleLowerCase('en-US')
    : normalized
}

function isPathInside(candidate: string, parent: string): boolean {
  const candidateId = pathIdentity(candidate)
  const parentId = pathIdentity(parent).replace(/\/$/, '')
  return candidateId === parentId || candidateId.startsWith(`${parentId}/`)
}

function siblingPath(filePath: string, name: string): string {
  const separatorIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return `${filePath.slice(0, separatorIndex + 1)}${name}`
}

function remapChildPath(filePath: string, source: string, destination: string): string {
  return `${destination}${filePath.slice(source.length)}`
}

function affectedOpenDocuments(entryPath: string) {
  return Object.entries(useEditorStore.getState().openFiles).filter(([filePath]) =>
    isPathInside(filePath, entryPath)
  )
}

export async function renameFileTreeEntry(
  entry: FileTreeActionEntry,
  name: string
): Promise<FileTreeRenameResult> {
  if (name === entry.name) return { status: 'unchanged' }
  if (name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    return { status: 'invalid-name' }
  }

  const editor = useEditorStore.getState()
  const affected = affectedOpenDocuments(entry.path)
  for (const [filePath] of affected) flushPendingDocumentEdits(filePath)
  if (affected.some(([filePath]) => documentRegistry.getModel(filePath)?.isDirty)) {
    return { status: 'dirty-documents' }
  }

  const destination = siblingPath(entry.path, name)
  await window.api.renamePath(entry.path, destination)

  const activePath = editor.activeFilePath
  const reopen = affected
    .map(([filePath]) => ({
      oldPath: filePath,
      newPath: remapChildPath(filePath, entry.path, destination),
      wasActive: filePath === activePath
    }))
    .sort((left, right) => Number(left.wasActive) - Number(right.wasActive))

  for (const file of reopen) {
    useUiStore.getState().moveProseMode(file.oldPath, file.newPath)
    editor.closeTab(file.oldPath)
  }
  for (const file of reopen) {
    const result = await window.api.readFile(file.newPath)
    useEditorStore.getState().openFileInTab(result.filePath, result.content)
  }
  return { status: 'renamed', destination }
}

export async function deleteFileTreeEntry(
  entry: FileTreeActionEntry,
  confirmDelete: () => boolean
): Promise<FileTreeDeleteResult> {
  const affected = affectedOpenDocuments(entry.path)
  for (const [filePath] of affected) flushPendingDocumentEdits(filePath)
  if (affected.some(([filePath]) => documentRegistry.getModel(filePath)?.isDirty)) {
    return { status: 'dirty-documents' }
  }
  if (!confirmDelete()) return { status: 'cancelled' }

  await window.api.deletePath(entry.path)
  for (const [filePath] of affected) {
    useUiStore.getState().forgetProseMode(filePath)
    useEditorStore.getState().closeTab(filePath)
  }
  return { status: 'deleted' }
}
