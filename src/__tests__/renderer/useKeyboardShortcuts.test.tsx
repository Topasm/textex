import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { APP_COMMAND_MANIFEST, RENDERER_SHORTCUT_MANIFEST } from '../../shared/appCommandManifest'
import { useKeyboardShortcuts } from '../../renderer/hooks/useKeyboardShortcuts'
import { getDesktopCapabilities } from '../../renderer/platform/capabilities'
import { commandRegistry } from '../../renderer/services/commandRegistry'
import { useEditorStore } from '../../renderer/store/useEditorStore'

afterEach(() => {
  cleanup()
  commandRegistry.clear()
  vi.restoreAllMocks()
})

describe('useKeyboardShortcuts', () => {
  it('registers the manifest shortcuts supported by the Tauri runtime', () => {
    const register = vi.spyOn(commandRegistry, 'register')
    const runCommand = vi.fn()
    const capabilities = getDesktopCapabilities()
    const expectedIds: string[] = []

    for (const command of APP_COMMAND_MANIFEST) {
      if (!('shortcut' in command)) continue
      if ('requiredCapability' in command && !capabilities[command.requiredCapability]) {
        continue
      }
      expectedIds.push(command.id)
    }
    expectedIds.push(...RENDERER_SHORTCUT_MANIFEST.map((command) => command.id))

    renderHook(() => useKeyboardShortcuts({ runCommand }))

    const registeredIds = register.mock.calls.map(([id]) => id)
    expect(registeredIds).toEqual(expectedIds)
    expect(registeredIds).toContain('ai.draft')
    expect(registeredIds).toContain('view.toggleTerminal')
    expect(registeredIds).toContain('file.newTemplate')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true }))
    expect(runCommand).toHaveBeenCalledWith('file.open')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'O', ctrlKey: true, shiftKey: true }))
    expect(runCommand).toHaveBeenCalledWith('file.openFolder')
  })

  it('does not close a dirty tab with Ctrl/Cmd+W when discard is cancelled', () => {
    const filePath = '/project/draft.tex'
    useEditorStore.getState().resetEditor()
    useEditorStore.getState().openFileInTab(filePath, 'saved')
    useEditorStore.getState().updateActiveDocument('unsaved', 'editor')
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderHook(() => useKeyboardShortcuts({ runCommand: vi.fn() }))

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', metaKey: true }))

    expect(window.confirm).toHaveBeenCalledOnce()
    expect(useEditorStore.getState().openFiles[filePath]?.isDirty).toBe(true)
  })
})
