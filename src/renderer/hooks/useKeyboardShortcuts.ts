import { useEffect } from 'react'
import type { AppCommandId } from '../../shared/types'
import {
  APP_COMMAND_MANIFEST,
  RENDERER_SHORTCUT_MANIFEST,
  type RendererShortcutId
} from '../../shared/appCommandManifest'
import { useEditorStore } from '../store/useEditorStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { commandRegistry } from '../services/commandRegistry'
import { getDesktopCapabilities } from '../platform/capabilities'

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
    const capabilities = getDesktopCapabilities()
    commandRegistry.clear()

    for (const command of APP_COMMAND_MANIFEST) {
      if (!('shortcut' in command)) continue
      if ('requiredCapability' in command && !capabilities[command.requiredCapability]) {
        continue
      }
      commandRegistry.register(command.id, command.shortcut, () => runCommand(command.id))
    }

    const rendererHandlers: Record<RendererShortcutId, () => void> = {
      'font.increase': () => useSettingsStore.getState().increaseFontSize(),
      'font.decrease': () => useSettingsStore.getState().decreaseFontSize(),
      'tab.close': () => {
        const state = useEditorStore.getState()
        if (state.activeFilePath) state.closeTab(state.activeFilePath)
      },
      'tab.prev': () => {
        const state = useEditorStore.getState()
        const paths = Object.keys(state.openFiles)
        if (paths.length > 1 && state.activeFilePath) {
          const idx = paths.indexOf(state.activeFilePath)
          state.setActiveTab(paths[(idx - 1 + paths.length) % paths.length])
        }
      },
      'tab.next': () => {
        const state = useEditorStore.getState()
        const paths = Object.keys(state.openFiles)
        if (paths.length > 1 && state.activeFilePath) {
          const idx = paths.indexOf(state.activeFilePath)
          state.setActiveTab(paths[(idx + 1) % paths.length])
        }
      }
    }

    for (const command of RENDERER_SHORTCUT_MANIFEST) {
      commandRegistry.register(command.id, command.shortcut, rendererHandlers[command.id])
    }

    const handler = (e: KeyboardEvent): void => commandRegistry.handleKeyDown(e)
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      commandRegistry.clear()
    }
  }, [runCommand])
}
