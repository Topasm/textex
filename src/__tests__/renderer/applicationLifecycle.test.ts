import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  handleWindowCloseRequest,
  quitApplication
} from '../../renderer/services/applicationLifecycle'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'

describe('application exit lifecycle', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    useEditorStore.getState().resetEditor()
    useProjectStore.getState().setProjectRoot('/project')
    vi.mocked(window.api.deactivateProject).mockResolvedValue({ success: true })
    vi.mocked(window.api.exitApp).mockResolvedValue({ success: true })
    vi.mocked(window.api.hideWindow).mockResolvedValue(undefined)
    document.documentElement.dataset.platform = 'linux'
  })

  it('hides the macOS window without discarding the active project', async () => {
    document.documentElement.dataset.platform = 'darwin'
    useEditorStore.getState().openFileInTab('/project/draft.tex', 'saved')
    useEditorStore.getState().updateActiveDocument('unsaved', 'editor')
    const confirm = vi.spyOn(window, 'confirm')

    await expect(handleWindowCloseRequest()).resolves.toBe(false)

    expect(window.api.hideWindow).toHaveBeenCalledOnce()
    expect(confirm).not.toHaveBeenCalled()
    expect(window.api.deactivateProject).not.toHaveBeenCalled()
    expect(window.api.exitApp).not.toHaveBeenCalled()
  })

  it('retains close-to-exit preparation outside macOS', async () => {
    await expect(handleWindowCloseRequest()).resolves.toBe(true)

    expect(window.api.hideWindow).not.toHaveBeenCalled()
    expect(window.api.deactivateProject).toHaveBeenCalledOnce()
  })

  it('does not invoke native exit when dirty discard is cancelled', async () => {
    useEditorStore.getState().openFileInTab('/project/draft.tex', 'saved')
    useEditorStore.getState().updateActiveDocument('unsaved', 'editor')
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    await expect(quitApplication()).resolves.toBe(false)

    expect(window.api.deactivateProject).not.toHaveBeenCalled()
    expect(window.api.exitApp).not.toHaveBeenCalled()
  })

  it('invokes native exit only after native project deactivation succeeds', async () => {
    await expect(quitApplication()).resolves.toBe(true)

    expect(window.api.deactivateProject).toHaveBeenCalledOnce()
    expect(vi.mocked(window.api.deactivateProject).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(window.api.exitApp).mock.invocationCallOrder[0]
    )
  })
})
