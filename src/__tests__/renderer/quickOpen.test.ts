import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openIndexedFile } from '../../renderer/services/quickOpen'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { documentRegistry } from '../../renderer/models/documentRegistry'

describe('quick file opening', () => {
  beforeEach(() => {
    useEditorStore.getState().resetEditor()
    useProjectStore.getState().setProjectRoot('/project')
    vi.mocked(window.api.readFile).mockReset()
  })
  it('reuses an unsaved open buffer instead of reloading it from disk', async () => {
    useEditorStore.getState().openFileInTab('/project/main.tex', 'Saved')
    useEditorStore.getState().updateActiveDocument('Unsaved')
    useEditorStore.getState().openFileInTab('/project/other.tex', 'Other')
    await openIndexedFile('/project/main.tex')
    expect(useEditorStore.getState().filePath).toBe('/project/main.tex')
    expect(documentRegistry.snapshot('/project/main.tex')?.text).toBe('Unsaved')
    expect(window.api.readFile).not.toHaveBeenCalled()
  })
  it.each(['project', 'tab', 'new request', 'path mismatch'])(
    'rejects a late read after %s',
    async (change) => {
      let resolve!: (value: { filePath: string; content: string }) => void
      vi.mocked(window.api.readFile).mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done
          })
      )
      const pending = openIndexedFile('/project/main.tex')
      if (change === 'project') useProjectStore.getState().setProjectRoot('/other')
      if (change === 'tab') useEditorStore.getState().openFileInTab('/project/other.tex', 'Other')
      if (change === 'new request') {
        vi.mocked(window.api.readFile).mockResolvedValueOnce({
          filePath: '/project/new.tex',
          content: 'New'
        })
        await openIndexedFile('/project/new.tex')
      }
      resolve({
        filePath: change === 'path mismatch' ? '/project/wrong.tex' : '/project/main.tex',
        content: 'Stale'
      })
      await pending
      expect(documentRegistry.has('/project/main.tex')).toBe(false)
      expect(documentRegistry.has('/project/wrong.tex')).toBe(false)
    }
  )
})
