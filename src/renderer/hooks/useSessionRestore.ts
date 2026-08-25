import { useEffect, useState } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { useProjectStore } from '../store/useProjectStore'
import { useSettingsStore } from '../store/useSettingsStore'
import {
  isCurrentProjectTransitionSnapshot,
  openProject,
  type ProjectTransitionSnapshot
} from '../utils/openProject'
import { checkForAppUpdate } from '../services/updateLifecycle'
import { useNotificationStore } from '../store/useNotificationStore'
import i18n from '../i18n'
import { errorMessage, logError } from '../utils/errorMessage'
import { normalizeDocumentId } from '../models/documentRegistry'
import type { RestoredFileData } from '../store/useEditorStore'
import { findDefaultTexFile, isTexFilePath } from '../services/defaultTexFile'

const SESSION_RESTORE_NOTIFICATION_ID = 'session-restore-failed'
const SESSION_RESTORE_CONCURRENCY = 3

let currentSessionRestoreEpoch = 0

interface SessionCursor {
  cursorLine: number
  cursorColumn: number
}

interface RestoredSessionFile extends RestoredFileData {
  savedPath: string
}

function uniqueSessionPaths(paths: unknown): string[] {
  if (!Array.isArray(paths)) return []
  const seen = new Set<string>()
  return paths.filter((path): path is string => {
    if (typeof path !== 'string' || path.length === 0) return false
    const id = normalizeDocumentId(path)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function validCursorCoordinate(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 ? value : 1
}

function sessionCursorsByDocumentId(value: unknown): Map<string, SessionCursor> {
  const cursors = new Map<string, SessionCursor>()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return cursors
  for (const [filePath, cursor] of Object.entries(value)) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) continue
    const saved = cursor as Partial<SessionCursor>
    cursors.set(normalizeDocumentId(filePath), {
      cursorLine: validCursorCoordinate(saved.cursorLine),
      cursorColumn: validCursorCoordinate(saved.cursorColumn)
    })
  }
  return cursors
}

function publishSessionRestoreFailure(savedRoot: string, error: unknown): void {
  const reason = errorMessage(error)
  useNotificationStore.getState().pushNotification({
    id: SESSION_RESTORE_NOTIFICATION_ID,
    tone: 'error',
    message: i18n.t('notifications.sessionRestoreFailed', {
      path: savedRoot,
      reason
    }),
    action: {
      label: i18n.t('notifications.chooseReplacement'),
      dismissOnRun: false,
      run: async () => {
        const replacementPath = await window.api.openDirectory()
        if (!replacementPath) return

        try {
          const snapshot = await openProject(replacementPath)
          if (snapshot) {
            useNotificationStore.getState().dismissNotification(SESSION_RESTORE_NOTIFICATION_ID)
          }
        } catch (replacementError) {
          logError('SessionRestore:replacement', replacementError)
          useNotificationStore.getState().updateNotification(SESSION_RESTORE_NOTIFICATION_ID, {
            tone: 'error',
            message: i18n.t('notifications.replacementOpenFailed', {
              path: replacementPath,
              reason: errorMessage(replacementError)
            })
          })
          throw replacementError
        }
      }
    }
  })
}

/**
 * Restores the previous editing session on mount:
 * - Re-enters the serialized project-open lifecycle
 * - Re-opens files from disk
 * - Restores active tab
 *
 * Returns `sessionRestored` flag — false while async work is in progress.
 */
export function useSessionRestore(): boolean {
  const [sessionRestored, setSessionRestored] = useState(false)

  useEffect(() => {
    let active = true
    const restoreEpoch = ++currentSessionRestoreEpoch
    const isMountedRestore = (): boolean => active && restoreEpoch === currentSessionRestoreEpoch
    const publishWorkspace = (): void => {
      if (isMountedRestore()) setSessionRestored(true)
    }

    const restoreSession = async (): Promise<void> => {
      const projectState = useProjectStore.getState()
      const editorState = useEditorStore.getState()
      const savedRoot = projectState.projectRoot
      const { _sessionOpenPaths, _sessionActiveFile, _sessionCursors } = editorState
      const orderedSessionPaths = uniqueSessionPaths(_sessionOpenPaths)
      const activeDocumentId =
        typeof _sessionActiveFile === 'string' && _sessionActiveFile.length > 0
          ? normalizeDocumentId(_sessionActiveFile)
          : null
      const savedActivePath = activeDocumentId
        ? (orderedSessionPaths.find((path) => normalizeDocumentId(path) === activeDocumentId) ??
          null)
        : null
      const sessionCursors = sessionCursorsByDocumentId(_sessionCursors)
      if (!savedRoot) {
        publishWorkspace()
        return
      }

      let snapshot: ProjectTransitionSnapshot | null
      try {
        snapshot = await openProject(savedRoot, {
          autoOpenFirstTex: false,
          deferProjectEnrichment: true
        })
      } catch (error) {
        if (!isMountedRestore()) return
        logError('SessionRestore:project', error)
        if (useProjectStore.getState().projectRoot === savedRoot) {
          useProjectStore.getState().setProjectRoot(null)
        }
        publishSessionRestoreFailure(savedRoot, error)
        publishWorkspace()
        return
      }
      if (!isMountedRestore()) return
      if (!snapshot) {
        publishWorkspace()
        return
      }
      useNotificationStore.getState().dismissNotification(SESSION_RESTORE_NOTIFICATION_ID)

      const expectedTabMutationEpoch = useEditorStore.getState().tabMutationEpoch
      const isRestoreContextCurrent = (): boolean =>
        isMountedRestore() &&
        useProjectStore.getState().projectRoot === snapshot.projectPath &&
        isCurrentProjectTransitionSnapshot(snapshot) &&
        useEditorStore.getState().tabMutationEpoch === expectedTabMutationEpoch

      const readSessionFile = async (savedPath: string): Promise<RestoredSessionFile | null> => {
        try {
          const result = await window.api.readFile(savedPath)
          if (!result.filePath) return null
          const cursor = sessionCursors.get(normalizeDocumentId(savedPath)) ?? {
            cursorLine: 1,
            cursorColumn: 1
          }
          return { savedPath, filePath: result.filePath, content: result.content, ...cursor }
        } catch {
          return null
        }
      }

      const restoredPathBySessionId = new Map<string, string>()
      const orderedRestoredPaths = (): string[] =>
        orderedSessionPaths.flatMap((path) => {
          const restoredPath = restoredPathBySessionId.get(normalizeDocumentId(path))
          return restoredPath ? [restoredPath] : []
        })

      if (savedActivePath) {
        const restoredActiveFile = await readSessionFile(savedActivePath)
        if (!isRestoreContextCurrent()) {
          publishWorkspace()
          return
        }
        if (restoredActiveFile) {
          restoredPathBySessionId.set(
            normalizeDocumentId(restoredActiveFile.savedPath),
            restoredActiveFile.filePath
          )
          const restored = useEditorStore.getState().restoreFilesInTabs([restoredActiveFile], {
            orderedFilePaths: orderedRestoredPaths(),
            activeFilePath: restoredActiveFile.filePath,
            expectedTabMutationEpoch
          })
          if (!restored) {
            publishWorkspace()
            return
          }
        }
      }

      // The active document is usable before the remaining tabs touch disk.
      publishWorkspace()
      if (!isRestoreContextCurrent()) return

      const backgroundPaths = orderedSessionPaths.filter(
        (path) => normalizeDocumentId(path) !== activeDocumentId
      )
      for (let offset = 0; offset < backgroundPaths.length; offset += SESSION_RESTORE_CONCURRENCY) {
        if (!isRestoreContextCurrent()) return
        const batch = backgroundPaths.slice(offset, offset + SESSION_RESTORE_CONCURRENCY)
        const restoredFiles = (await Promise.all(batch.map(readSessionFile))).filter(
          (file): file is RestoredSessionFile => file !== null
        )
        if (!isRestoreContextCurrent()) return
        if (restoredFiles.length === 0) continue

        for (const file of restoredFiles) {
          restoredPathBySessionId.set(normalizeDocumentId(file.savedPath), file.filePath)
        }
        const fallbackActiveFile = useEditorStore.getState().activeFilePath
          ? undefined
          : restoredFiles.find((file) => isTexFilePath(file.filePath))?.filePath
        const restored = useEditorStore.getState().restoreFilesInTabs(restoredFiles, {
          orderedFilePaths: orderedRestoredPaths(),
          ...(fallbackActiveFile ? { activeFilePath: fallbackActiveFile } : {}),
          expectedTabMutationEpoch
        })
        if (!restored) return
      }

      if (!isRestoreContextCurrent() || useEditorStore.getState().activeFilePath) return

      // A valid TeX tab from the saved session always wins. If every saved TeX
      // file disappeared (or there was no saved tab), fall back to the same
      // conventional project document selection used for a manual open.
      const restoredTexPath = orderedRestoredPaths().find(isTexFilePath)
      if (restoredTexPath) {
        useEditorStore.getState().restoreFilesInTabs([], {
          orderedFilePaths: orderedRestoredPaths(),
          activeFilePath: restoredTexPath,
          expectedTabMutationEpoch
        })
        return
      }

      const defaultTexFile = findDefaultTexFile(useProjectStore.getState().directoryTree ?? [])
      if (!defaultTexFile) return
      const restoredDefaultFile = await readSessionFile(defaultTexFile.path)
      if (!restoredDefaultFile || !isRestoreContextCurrent()) return
      useEditorStore.getState().restoreFilesInTabs([restoredDefaultFile], {
        orderedFilePaths: [...orderedRestoredPaths(), restoredDefaultFile.filePath],
        activeFilePath: restoredDefaultFile.filePath,
        expectedTabMutationEpoch
      })
    }

    void restoreSession()
    return () => {
      active = false
      if (currentSessionRestoreEpoch === restoreEpoch) currentSessionRestoreEpoch += 1
    }
  }, [])

  // Also init spell check and check for updates on mount
  useEffect(() => {
    const settings = useSettingsStore.getState().settings
    if (settings.spellCheckEnabled) {
      void window.api.spellInit(settings.spellCheckLanguage || 'en-US').catch(() => {})
    }
    const updateTimer = window.setTimeout(() => {
      if (useSettingsStore.getState().settings.autoUpdateEnabled !== false) {
        void checkForAppUpdate({ interactive: false })
      }
    }, 3000)
    return () => window.clearTimeout(updateTimer)
  }, [])

  return sessionRestored
}
