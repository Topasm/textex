import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import { commandRegistry } from '../services/commandRegistry'

interface KeyboardShortcutsOpts {
  handleOpen: () => void
  handleSave: () => void
  handleSaveAs: () => void
  handleCompile: () => void
  handleAiDraft: () => void
  zoteroEnabled: boolean
}

/**
 * Registers global keyboard shortcuts via the CommandRegistry.
 * Replaces the monolithic if/else chain that was in App.tsx.
 */
export function useKeyboardShortcuts(opts: KeyboardShortcutsOpts): void {
  const { handleOpen, handleSave, handleSaveAs, handleCompile, handleAiDraft, zoteroEnabled } = opts

  useEffect(() => {
    const s = () => useAppStore.getState()

    commandRegistry.register('file.open', { key: 'o', mod: true }, handleOpen)
    commandRegistry.register('file.saveAs', { key: 's', mod: true, shift: true }, handleSaveAs)
    commandRegistry.register('file.save', { key: 's', mod: true }, handleSave)
    commandRegistry.register('compile', { key: 'Enter', mod: true }, handleCompile)
    commandRegistry.register('log.toggle', { key: 'l', mod: true }, () => s().toggleLogPanel())
    commandRegistry.register('font.increase', { key: ['=', '+'], mod: true, shift: true }, () => s().increaseFontSize())
    commandRegistry.register('font.decrease', { key: '-', mod: true, shift: true }, () => s().decreaseFontSize())
    commandRegistry.register('zoom.in', { key: ['=', '+'], mod: true }, () => s().zoomIn())
    commandRegistry.register('zoom.out', { key: '-', mod: true }, () => s().zoomOut())
    commandRegistry.register('zoom.reset', { key: '0', mod: true }, () => s().resetZoom())
    commandRegistry.register('sidebar.toggle', { key: 'b', mod: true }, () => s().toggleSidebar())
    commandRegistry.register('tab.close', { key: 'w', mod: true }, () => {
      const state = s()
      if (state.activeFilePath) state.closeTab(state.activeFilePath)
    })
    commandRegistry.register('tab.prev', { key: 'Tab', mod: true, shift: true }, () => {
      const state = s()
      const paths = Object.keys(state.openFiles)
      if (paths.length > 1 && state.activeFilePath) {
        const idx = paths.indexOf(state.activeFilePath)
        state.setActiveTab(paths[(idx - 1 + paths.length) % paths.length])
      }
    })
    commandRegistry.register('tab.next', { key: 'Tab', mod: true }, () => {
      const state = s()
      const paths = Object.keys(state.openFiles)
      if (paths.length > 1 && state.activeFilePath) {
        const idx = paths.indexOf(state.activeFilePath)
        state.setActiveTab(paths[(idx + 1) % paths.length])
      }
    })
    commandRegistry.register('template.new', { key: 'n', mod: true, shift: true }, () => s().toggleTemplateGallery())
    commandRegistry.register('ai.draft', { key: ['d', 'D'], mod: true, shift: true }, handleAiDraft)
    commandRegistry.register('zotero.search', { key: ['z', 'Z'], mod: true, shift: true }, () => {
      if (zoteroEnabled) useAppStore.getState().requestCiteSearchFocus()
    })

    const handler = (e: KeyboardEvent): void => commandRegistry.handleKeyDown(e)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleOpen, handleSave, handleSaveAs, handleCompile, handleAiDraft, zoteroEnabled])
}
