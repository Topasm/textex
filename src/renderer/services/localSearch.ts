import { usePdfStore } from '../store/usePdfStore'
import { useEditorStore } from '../store/useEditorStore'
import { useProjectStore } from '../store/useProjectStore'
import { useUiStore, type LocalSearchTarget } from '../store/useUiStore'

export function requestLocalSearch(target: LocalSearchTarget): void {
  if (target === 'document' && usePdfStore.getState().pdfOnly)
    usePdfStore.getState().setSourceEditorOpen(true)
  if (target === 'references') usePdfStore.getState().setPdfToolsVisible(true)
  const filePath = useEditorStore.getState().filePath
  if (target === 'pdf' && filePath) useUiStore.getState().setProseMode(filePath, false)
  useUiStore.getState().setSearchRequest({
    target,
    projectRoot: useProjectStore.getState().projectRoot,
    filePath: useEditorStore.getState().filePath
  })
}
