import { usePdfStore } from '../store/usePdfStore'
import { proseModeFor, useUiStore } from '../store/useUiStore'

/** The prose view shows only outside the PDF workspace. */
export function useProseModeVisible(filePath: string | null): boolean {
  const pdfOnly = usePdfStore((state) => state.pdfOnly)
  const proseMode = useUiStore((state) => proseModeFor(state, filePath))
  return !pdfOnly && proseMode
}

/** Side panels show in split view, or once the PDF workspace reveals its tools. */
export function usePanelsVisible(): boolean {
  return usePdfStore((state) => !state.pdfOnly || state.pdfToolsVisible)
}
