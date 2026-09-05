import { useCallback, useEffect, useRef } from 'react'
import { useUiStore, type LocalSearchTarget } from '../store/useUiStore'
import { useProjectStore } from '../store/useProjectStore'
import { useEditorStore } from '../store/useEditorStore'

/** Return false while the feature is mounting; call refresh when its input is ready. */
export function useLocalSearchRequest(target: LocalSearchTarget, open: () => boolean): () => void {
  const request = useUiStore((state) => state.searchRequest)
  const projectRoot = useProjectStore((state) => state.projectRoot)
  const filePath = useEditorStore((state) => state.filePath)
  const openRef = useRef(open)
  openRef.current = open
  const refresh = useCallback(() => {
    const request = useUiStore.getState().searchRequest
    if (request?.target !== target) return
    if (
      request.projectRoot !== useProjectStore.getState().projectRoot ||
      (target === 'document' && request.filePath !== useEditorStore.getState().filePath)
    ) {
      useUiStore.getState().setSearchRequest(null)
      return
    }
    if (openRef.current() && useUiStore.getState().searchRequest === request)
      useUiStore.getState().setSearchRequest(null)
  }, [target])
  useEffect(() => {
    refresh()
  }, [refresh, request, projectRoot, filePath])
  return refresh
}
