import { beforeEach, describe, expect, it, vi } from 'vitest'
import { quitApplication } from '../../renderer/services/applicationLifecycle'
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
