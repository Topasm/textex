import { useCallback, useEffect, useRef } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { useUiStore } from '../store/useUiStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { documentRegistry } from '../models/documentRegistry'
import { beginPendingDiskReload } from '../services/pendingDiskReloads'
import { projectPathKey } from '../services/projectIndex'
import { syncRecoveryForFile } from '../services/crashRecovery'
import type { DirectoryChangeEvent } from '../../shared/types'

const RELOAD_DEBOUNCE_MS = 100

interface PendingReload {
  timer: ReturnType<typeof setTimeout>
  finish: () => void
}

/** Accepts changed disk content, including over unsaved edits, without writing it back. */
export function useExternalFileReload(
  projectRoot: string | null
): (change: DirectoryChangeEvent) => void {
  const pendingRef = useRef(new Map<string, PendingReload>())

  useEffect(() => {
    const pending = pendingRef.current
    const cancel = (path: string): void => {
      const request = pending.get(path)
      if (!request) return
      pending.delete(path)
      clearTimeout(request.timer)
      request.finish()
    }
    const unsubscribe = useEditorStore.subscribe(
      (state) => state.openFiles,
      (openFiles) => {
        for (const path of pending.keys()) if (!openFiles[path]) cancel(path)
      }
    )
    return () => {
      unsubscribe()
      for (const path of pending.keys()) cancel(path)
    }
  }, [projectRoot])

  return useCallback(
    (change: DirectoryChangeEvent) => {
      if (!projectRoot || !useSettingsStore.getState().settings.watchOpenFiles) return
      const rootKey = projectPathKey(projectRoot)
      const prefix = rootKey.endsWith('/') ? rootKey : `${rootKey}/`
      const changedKey = projectPathKey(`${prefix}${change.filename}`)
      const paths = Object.keys(useEditorStore.getState().openFiles).filter((path) => {
        const key = projectPathKey(path)
        if (!key.startsWith(prefix)) return false
        return change.indexInvalidated || key === changedKey || key.startsWith(`${changedKey}/`)
      })

      for (const path of paths) {
        const model = documentRegistry.getModel(path)
        if (!model) continue
        const pending = pendingRef.current
        const previous = pending.get(path)
        if (previous) {
          clearTimeout(previous.timer)
          previous.finish()
        }
        const request: PendingReload = {
          finish: beginPendingDiskReload(model),
          timer: setTimeout(() => void reload(), RELOAD_DEBOUNCE_MS)
        }
        pending.set(path, request)

        const isCurrent = (): boolean =>
          pending.get(path) === request &&
          documentRegistry.getModel(path) === model &&
          !!useEditorStore.getState().openFiles[path] &&
          useSettingsStore.getState().settings.watchOpenFiles

        const reload = async (): Promise<void> => {
          let retry = false
          try {
            if (!isCurrent()) return
            const observed = model.revisionSnapshot()
            const { content } = await window.api.readFile(path)
            if (!isCurrent()) return
            // A save echo must not erase typing that happened after that save.
            if (documentRegistry.isKnownDiskContent(path, content)) return
            const result = documentRegistry.reloadIfCurrent(path, content, observed)
            if (result?.status === 'stale') {
              // Re-read against the new revision instead of losing the event.
              retry = true
              request.timer = setTimeout(() => void reload(), RELOAD_DEBOUNCE_MS)
              return
            }
            if (result) {
              useEditorStore.getState().reloadFileContent(path, result.snapshot.text)
              useUiStore.getState().removeExternalChangeConflict(path)
              void syncRecoveryForFile(path).catch(() => undefined)
            }
          } catch {
            // Deletion or a temporarily inaccessible file leaves the buffer intact.
          } finally {
            if (!retry) {
              if (pending.get(path) === request) pending.delete(path)
              request.finish()
            }
          }
        }
      }
    },
    [projectRoot]
  )
}
