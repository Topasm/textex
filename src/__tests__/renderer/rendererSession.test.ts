import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultUserSettings } from '../../shared/defaultSettings'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { usePdfStore } from '../../renderer/store/usePdfStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import {
  installRendererSessionBridge,
  readRendererSessionSnapshot,
  restoreRendererSessionSnapshot
} from '../../renderer/services/rendererSession'

describe('renderer session migration', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(window.api.loadSettings).mockClear()
    vi.mocked(window.api.saveSettings).mockReset().mockResolvedValue(createDefaultUserSettings())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('captures only valid persisted Zustand entries', () => {
    localStorage.setItem('textex-editor-session', JSON.stringify({ state: { open: ['main.tex'] } }))
    localStorage.setItem('textex-project-storage', '{invalid')
    localStorage.setItem('textex-pdf-layout', JSON.stringify({ state: { zoomLevel: 125 } }))

    expect(readRendererSessionSnapshot(localStorage)).toEqual({
      version: 1,
      editor: JSON.stringify({ state: { open: ['main.tex'] } }),
      pdf: JSON.stringify({ state: { zoomLevel: 125 } })
    })
  })

  it('restores missing entries without overwriting current WebView state', () => {
    const currentProject = JSON.stringify({ state: { projectRoot: '/current' } })
    const legacyEditor = JSON.stringify({ state: { open: ['paper.tex'] } })
    const legacyProject = JSON.stringify({ state: { projectRoot: '/legacy' } })
    localStorage.setItem('textex-project-storage', currentProject)

    expect(
      restoreRendererSessionSnapshot(localStorage, {
        version: 1,
        editor: legacyEditor,
        project: legacyProject
      })
    ).toBe(true)
    expect(localStorage.getItem('textex-editor-session')).toBe(legacyEditor)
    expect(localStorage.getItem('textex-project-storage')).toBe(currentProject)
  })

  it('rejects unsupported snapshot versions and malformed entries', () => {
    expect(
      restoreRendererSessionSnapshot(localStorage, {
        version: 2,
        editor: JSON.stringify({ state: {} })
      } as never)
    ).toBe(false)
    expect(
      restoreRendererSessionSnapshot(localStorage, {
        version: 1,
        editor: '{invalid'
      })
    ).toBe(false)
  })

  it('installs one debounced synchronization bridge even when restoration fails', async () => {
    vi.useFakeTimers()
    const editorSubscribe = vi.spyOn(useEditorStore, 'subscribe').mockReturnValue(() => {})
    const projectSubscribe = vi.spyOn(useProjectStore, 'subscribe').mockReturnValue(() => {})
    const pdfSubscribe = vi.spyOn(usePdfStore, 'subscribe').mockReturnValue(() => {})
    vi.spyOn(useEditorStore.persist, 'rehydrate').mockRejectedValueOnce(
      new Error('renderer storage unavailable')
    )
    vi.spyOn(useProjectStore.persist, 'rehydrate').mockResolvedValue(undefined)
    vi.spyOn(usePdfStore.persist, 'rehydrate').mockResolvedValue(undefined)
    vi.mocked(window.api.saveSettings).mockRejectedValueOnce(new Error('native write unavailable'))

    const editorSession = JSON.stringify({ state: { open: ['paper.tex'] } })
    await expect(
      installRendererSessionBridge({
        ...createDefaultUserSettings(),
        rendererSession: { version: 1, editor: editorSession }
      })
    ).resolves.toBeUndefined()

    expect(window.api.loadSettings).not.toHaveBeenCalled()
    expect(window.api.saveSettings).toHaveBeenCalledTimes(1)
    expect(editorSubscribe).toHaveBeenCalledTimes(1)
    expect(projectSubscribe).toHaveBeenCalledTimes(1)
    expect(pdfSubscribe).toHaveBeenCalledTimes(1)

    const syncCallbacks = [editorSubscribe, projectSubscribe, pdfSubscribe].map(
      (subscribe) => subscribe.mock.calls[0][0] as () => void
    )
    syncCallbacks.forEach((sync) => sync())
    await vi.advanceTimersByTimeAsync(500)

    expect(window.api.saveSettings).toHaveBeenCalledTimes(2)
    expect(window.api.saveSettings).toHaveBeenLastCalledWith({
      rendererSession: { version: 1, editor: editorSession }
    })
  })
})
