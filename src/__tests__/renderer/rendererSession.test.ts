import { beforeEach, describe, expect, it } from 'vitest'
import {
  readRendererSessionSnapshot,
  restoreRendererSessionSnapshot
} from '../../renderer/services/rendererSession'

describe('renderer session migration', () => {
  beforeEach(() => {
    localStorage.clear()
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
})
