import { useEffect } from 'react'
import { useUiStore } from '../store/useUiStore'

/**
 * Declares a modal surface that App does not own.
 *
 * App has to suppress its own overlays — the command palette, settings, the AI
 * draft, the template gallery — while a feature dialog is on screen. Features
 * announce themselves here instead of App inferring it from the rendered DOM,
 * which previously required a `childList` observer over the whole body and so
 * ran on every Monaco and PDF mutation.
 *
 * Register from the site that decides the modal is shown, so a lazy modal is
 * covered while its loading fallback is still on screen.
 */
export function useFeatureModal(id: string, active: boolean): void {
  useEffect(() => {
    if (!active) return
    useUiStore.getState().registerFeatureModal(id)
    return () => useUiStore.getState().unregisterFeatureModal(id)
  }, [active, id])
}
