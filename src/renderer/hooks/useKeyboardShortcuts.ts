import { useEffect } from 'react'
import type { AppCommandId } from '../../shared/types'
import { useEditorStore } from '../store/useEditorStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { commandRegistry } from '../services/commandRegistry'

interface KeyboardShortcutsOpts {
  runCommand: (command: AppCommandId) => void
}

/**
 * Registers global keyboard shortcuts via the CommandRegistry.
 * Replaces the monolithic if/else chain that was in App.tsx.
 */
export function useKeyboardShortcuts(opts: KeyboardShortcutsOpts): void {
  const { runCommand } = opts

  useEffect(() => {
    commandRegistry.clear()

    commandRegistry.register('file.open', { key: 'o', mod: true }, () => runCommand('file.open'))
    commandRegistry.register('file.openFolder', { key: 'o', mod: true, shift: true }, () =>
      runCommand('file.openFolder')
    )
    commandRegistry.register('file.saveAs', { key: 's', mod: true, shift: true }, () =>
      runCommand('file.saveAs')
    )
    commandRegistry.register('file.save', { key: 's', mod: true }, () => runCommand('file.save'))
    commandRegistry.register('compile.run', { key: 'Enter', mod: true }, () =>
      runCommand('compile.run')
    )
    commandRegistry.register('view.toggleLog', { key: 'l', mod: true }, () =>
      runCommand('view.toggleLog')
    )
    commandRegistry.register('edit.find', { key: 'f', mod: true }, () => runCommand('edit.find'))
    commandRegistry.register('font.increase', { key: ['=', '+'], mod: true, alt: true }, () =>
      useSettingsStore.getState().increaseFontSize()
    )
    commandRegistry.register('font.decrease', { key: '-', mod: true, alt: true }, () =>
      useSettingsStore.getState().decreaseFontSize()
    )
    commandRegistry.register('pdf.zoomIn', { key: ['=', '+'], mod: true }, () =>
      runCommand('pdf.zoomIn')
    )
    commandRegistry.register('pdf.zoomOut', { key: '-', mod: true }, () =>
      runCommand('pdf.zoomOut')
    )
    commandRegistry.register('pdf.fitWidth', { key: '0', mod: true }, () =>
      runCommand('pdf.fitWidth')
    )
    commandRegistry.register('pdf.fitHeight', { key: '9', mod: true }, () =>
      runCommand('pdf.fitHeight')
    )
    commandRegistry.register('view.toggleSidebar', { key: 'b', mod: true }, () =>
      runCommand('view.toggleSidebar')
    )
    commandRegistry.register('tab.close', { key: 'w', mod: true }, () => {
      const state = useEditorStore.getState()
      if (state.activeFilePath) state.closeTab(state.activeFilePath)
    })
    commandRegistry.register('tab.prev', { key: 'Tab', mod: true, shift: true }, () => {
      const state = useEditorStore.getState()
      const paths = Object.keys(state.openFiles)
      if (paths.length > 1 && state.activeFilePath) {
        const idx = paths.indexOf(state.activeFilePath)
        state.setActiveTab(paths[(idx - 1 + paths.length) % paths.length])
      }
    })
    commandRegistry.register('tab.next', { key: 'Tab', mod: true }, () => {
      const state = useEditorStore.getState()
      const paths = Object.keys(state.openFiles)
      if (paths.length > 1 && state.activeFilePath) {
        const idx = paths.indexOf(state.activeFilePath)
        state.setActiveTab(paths[(idx + 1) % paths.length])
      }
    })
    commandRegistry.register('file.newTemplate', { key: 'n', mod: true, shift: true }, () =>
      runCommand('file.newTemplate')
    )
    commandRegistry.register('ai.draft', { key: ['d', 'D'], mod: true, shift: true }, () =>
      runCommand('ai.draft')
    )
    commandRegistry.register(
      'view.search.citations',
      { key: ['c', 'C'], mod: true, shift: true },
      () => runCommand('view.search.citations')
    )
    commandRegistry.register('view.search.pdf', { key: ['f', 'F'], mod: true, shift: true }, () =>
      runCommand('view.search.pdf')
    )
    commandRegistry.register('app.settings', { key: ',', mod: true }, () =>
      runCommand('app.settings')
    )

    const handler = (e: KeyboardEvent): void => commandRegistry.handleKeyDown(e)
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      commandRegistry.clear()
    }
  }, [runCommand])
}
