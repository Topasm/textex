import type { Diagnostic } from '../../shared/types'
import i18n from '../i18n'
import { normalizeDocumentId } from '../models/documentRegistry'
import { useEditorStore } from '../store/useEditorStore'
import { useNotificationStore } from '../store/useNotificationStore'
import { useProjectStore } from '../store/useProjectStore'
import { errorMessage } from '../utils/errorMessage'

const DIAGNOSTIC_NAVIGATION_NOTIFICATION_ID = 'diagnostic-navigation-failed'
const EDITOR_SWITCH_DELAY_MS = 50
let diagnosticNavigationEpoch = 0

interface AbsolutePath {
  kind: 'posix' | 'drive' | 'unc'
  prefix: string
  segments: string[]
  caseInsensitive: boolean
}

function pathSegments(value: string): string[] {
  return value.split('/').filter((segment) => segment.length > 0 && segment !== '.')
}

function normalizeSegments(segments: string[], minimumDepth = 0): string[] | null {
  const normalized: string[] = []
  for (const segment of segments) {
    if (segment !== '..') {
      normalized.push(segment)
      continue
    }
    if (normalized.length <= minimumDepth) return null
    normalized.pop()
  }
  return normalized
}

function parseAbsolutePath(value: string): AbsolutePath | null {
  const normalized = value.replace(/\\/g, '/')
  const drive = /^([a-zA-Z]:)\/(.*)$/.exec(normalized)
  if (drive) {
    const segments = normalizeSegments(pathSegments(drive[2]))
    return segments ? { kind: 'drive', prefix: drive[1], segments, caseInsensitive: true } : null
  }

  if (normalized.startsWith('//')) {
    const segments = normalizeSegments(pathSegments(normalized.slice(2)), 2)
    if (!segments || segments.length < 2) return null
    return {
      kind: 'unc',
      prefix: `//${segments[0]}/${segments[1]}`,
      segments: segments.slice(2),
      caseInsensitive: true
    }
  }

  if (normalized.startsWith('/')) {
    const segments = normalizeSegments(pathSegments(normalized.slice(1)))
    return segments ? { kind: 'posix', prefix: '/', segments, caseInsensitive: false } : null
  }
  return null
}

function formatAbsolutePath(path: AbsolutePath): string {
  if (path.kind === 'posix') return `/${path.segments.join('/')}`
  const suffix = path.segments.length > 0 ? `/${path.segments.join('/')}` : '/'
  return `${path.prefix}${suffix}`
}

function samePathPart(left: string, right: string, caseInsensitive: boolean): boolean {
  return caseInsensitive
    ? left.toLocaleLowerCase('en-US') === right.toLocaleLowerCase('en-US')
    : left === right
}

function isInsideRoot(root: AbsolutePath, target: AbsolutePath): boolean {
  if (
    root.kind !== target.kind ||
    !samePathPart(root.prefix, target.prefix, root.caseInsensitive) ||
    root.segments.length > target.segments.length
  ) {
    return false
  }
  return root.segments.every((segment, index) =>
    samePathPart(segment, target.segments[index], root.caseInsensitive)
  )
}

/**
 * Resolves compiler-reported paths without importing Node path APIs into the renderer.
 * Native readFile performs the authoritative canonical/symlink containment check too.
 */
export function resolveDiagnosticFilePath(filePath: string, projectRoot: string): string | null {
  const root = parseAbsolutePath(projectRoot)
  if (!root) return null

  const trimmedPath = filePath.trim()
  if (!trimmedPath) return null

  let target = parseAbsolutePath(trimmedPath)
  if (!target) {
    // Reject drive-relative paths (C:foo), which cannot be safely resolved by the renderer.
    if (/^[a-zA-Z]:/.test(trimmedPath)) return null
    const relativeSegments = pathSegments(trimmedPath.replace(/\\/g, '/'))
    const segments = normalizeSegments(
      [...root.segments, ...relativeSegments],
      root.segments.length
    )
    if (!segments) return null
    target = { ...root, segments }
  }

  return isInsideRoot(root, target) ? formatAbsolutePath(target) : null
}

function findOpenPath(
  openFiles: Record<string, unknown>,
  requestedPath: string
): string | undefined {
  const requestedId = normalizeDocumentId(requestedPath)
  return Object.keys(openFiles).find((filePath) => normalizeDocumentId(filePath) === requestedId)
}

function requestJumpAfterEditorSwitch(line: number, column: number, navigationEpoch: number): void {
  setTimeout(() => {
    if (navigationEpoch === diagnosticNavigationEpoch) {
      useEditorStore.getState().requestJumpToLine(line, column)
    }
  }, EDITOR_SWITCH_DELAY_MS)
}

function showNavigationError(filePath: string, error: unknown): void {
  useNotificationStore.getState().pushNotification({
    id: DIAGNOSTIC_NAVIGATION_NOTIFICATION_ID,
    tone: 'error',
    message: i18n.t('recentProjects.openFailed', {
      path: filePath || '(unknown)',
      reason: errorMessage(error)
    })
  })
}

function jumpInOpenFile(
  filePath: string,
  line: number,
  column: number,
  navigationEpoch: number
): boolean {
  const editor = useEditorStore.getState()
  const openPath = findOpenPath(editor.openFiles, filePath)
  if (!openPath) return false

  if (normalizeDocumentId(editor.activeFilePath ?? '') === normalizeDocumentId(openPath)) {
    editor.requestJumpToLine(line, column)
  } else {
    editor.setActiveTab(openPath)
    requestJumpAfterEditorSwitch(line, column, navigationEpoch)
  }
  return true
}

export async function navigateToDiagnostic(diagnostic: Diagnostic): Promise<void> {
  const navigationEpoch = ++diagnosticNavigationEpoch
  const line = Number.isSafeInteger(diagnostic.line) && diagnostic.line >= 1 ? diagnostic.line : 1
  const column =
    diagnostic.column && Number.isSafeInteger(diagnostic.column) && diagnostic.column >= 1
      ? diagnostic.column
      : 1
  const editor = useEditorStore.getState()

  // Some compiler errors do not carry a file. They still refer to the active root document.
  if (!diagnostic.file.trim()) {
    if (editor.activeFilePath) editor.requestJumpToLine(line, column)
    else showNavigationError('', new Error('No editor file is open.'))
    return
  }

  // This also supports an already-open absolute Windows path when project state is unavailable.
  if (jumpInOpenFile(diagnostic.file, line, column, navigationEpoch)) return

  const projectRoot = useProjectStore.getState().projectRoot
  if (!projectRoot) {
    showNavigationError(diagnostic.file, new Error('There is no open project.'))
    return
  }
  const targetPath = resolveDiagnosticFilePath(diagnostic.file, projectRoot)
  if (!targetPath) {
    showNavigationError(
      diagnostic.file,
      new Error('The diagnostic file is outside the open project.')
    )
    return
  }

  if (jumpInOpenFile(targetPath, line, column, navigationEpoch)) return

  try {
    const result = await window.api.readFile(targetPath)
    const currentRoot = useProjectStore.getState().projectRoot
    if (
      navigationEpoch !== diagnosticNavigationEpoch ||
      !currentRoot ||
      normalizeDocumentId(currentRoot) !== normalizeDocumentId(projectRoot)
    ) {
      return
    }

    // The same file may have been opened while the disk read was in flight.
    if (!jumpInOpenFile(result.filePath, line, column, navigationEpoch)) {
      useEditorStore.getState().openFileInTab(result.filePath, result.content)
      requestJumpAfterEditorSwitch(line, column, navigationEpoch)
    }
  } catch (error) {
    if (
      navigationEpoch === diagnosticNavigationEpoch &&
      normalizeDocumentId(useProjectStore.getState().projectRoot ?? '') ===
        normalizeDocumentId(projectRoot)
    ) {
      showNavigationError(targetPath, error)
    }
  }
}
