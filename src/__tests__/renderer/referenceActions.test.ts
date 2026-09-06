import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DragEvent } from 'react'
import {
  addReferenceAndBuildCitation,
  buildProjectReferenceDragPayload,
  MAX_REFERENCE_DRAG_BYTES,
  parseReferenceDragData,
  setReferenceDragData
} from '../../renderer/components/research/referenceActions'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'
import { isSafeCitationKey, MAX_CITATION_KEY_BYTES } from '../../shared/referenceValidation'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

const onlineReference = {
  source: 'crossref' as const,
  id: '10.1000/example',
  title: 'A Paper',
  authors: ['Ada Smith'],
  year: '2026',
  type: 'journal-article',
  doi: '10.1000/example'
}

describe('research reference actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useProjectStore.setState({ projectRoot: null })
    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        citeOnlineToZotero: false,
        zoteroPort: 23_119
      }
    }))
  })

  it('routes online citation through Zotero when the user enables it', async () => {
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, citeOnlineToZotero: true }
    }))
    vi.mocked(window.api.zoteroSaveOnline).mockResolvedValue({
      itemKey: 'ABC12345',
      citekey: 'Smith2026Paper',
      duplicate: false
    })
    vi.mocked(window.api.zoteroAddToProject).mockResolvedValue({
      filePath: '/project/references.bib',
      citekey: 'Smith2026Paper',
      inserted: true,
      duplicate: false
    })

    await expect(
      addReferenceAndBuildCitation({ source: 'online', reference: onlineReference })
    ).resolves.toBe('\\cite{Smith2026Paper}')
    expect(window.api.zoteroSaveOnline).toHaveBeenCalledWith(onlineReference, 23_119)
    expect(window.api.zoteroAddToProject).toHaveBeenCalledWith('Smith2026Paper', 23_119)
    expect(window.api.researchAddOnline).not.toHaveBeenCalled()
  })

  it('does not continue adding an online reference after the active project changes', async () => {
    const pendingSave = deferred<{ itemKey: string; citekey: string; duplicate: boolean }>()
    useProjectStore.setState({ projectRoot: '/project-a' })
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, citeOnlineToZotero: true }
    }))
    vi.mocked(window.api.zoteroSaveOnline).mockReturnValue(pendingSave.promise)

    const adding = addReferenceAndBuildCitation({
      source: 'online',
      reference: onlineReference
    })
    await vi.waitFor(() => expect(window.api.zoteroSaveOnline).toHaveBeenCalledOnce())
    useProjectStore.getState().setProjectRoot('/project-b')
    pendingSave.resolve({ itemKey: 'ABC12345', citekey: 'Smith2026Paper', duplicate: false })

    await expect(adding).rejects.toThrow('active project changed')
    expect(window.api.zoteroAddToProject).not.toHaveBeenCalled()
    expect(window.api.researchAddOnline).not.toHaveBeenCalled()
  })

  it('validates complete reference drag payloads', () => {
    expect(
      parseReferenceDragData(JSON.stringify({ source: 'online', reference: onlineReference }))
    ).toEqual({ source: 'online', reference: onlineReference })
    expect(
      parseReferenceDragData(
        JSON.stringify({ source: 'online', reference: { title: 'Missing fields' } })
      )
    ).toBeNull()
    expect(
      parseReferenceDragData(JSON.stringify({ source: 'zotero', citekey: 'bad\u0000key' }))
    ).toBeNull()
    expect(
      parseReferenceDragData(JSON.stringify({ source: 'project', citekey: 'bad}\\input{secrets' }))
    ).toBeNull()
  })

  it('shares a strict citation-key policy with persisted reference actions', () => {
    expect(isSafeCitationKey('Smith_2026:Paper-1')).toBe(true)
    expect(isSafeCitationKey('Smith.2026')).toBe(false)
    expect(isSafeCitationKey('bad}\\input{secrets')).toBe(false)
    expect(isSafeCitationKey('a'.repeat(MAX_CITATION_KEY_BYTES + 1))).toBe(false)
  })

  it('rejects unsafe citation keys even when an action bypasses drag parsing', async () => {
    await expect(
      addReferenceAndBuildCitation({ source: 'project', citekey: 'bad}\\input{secrets' })
    ).rejects.toThrow('invalid citation key')
    await expect(
      addReferenceAndBuildCitation({ source: 'zotero', citekey: 'Smith.2026' })
    ).rejects.toThrow('invalid citation key')
    expect(window.api.zoteroAddToProject).not.toHaveBeenCalled()
  })

  it('cancels unsafe internal drags without publishing fallback data', () => {
    const setData = vi.fn()
    const event = {
      dataTransfer: { setData, effectAllowed: 'uninitialized' }
    } as unknown as DragEvent

    expect(setReferenceDragData(event, { source: 'project', citekey: 'bad}\\input{secrets' })).toBe(
      false
    )
    expect(setData).not.toHaveBeenCalled()
    expect(event.dataTransfer.effectAllowed).toBe('none')
  })

  it('builds and validates project reference payloads without registering them again', async () => {
    const payload = buildProjectReferenceDragPayload({
      key: 'Smith2026Paper',
      title: 'A Paper',
      author: 'Ada Smith and Grace Lee',
      year: '2026',
      type: 'article'
    })

    useProjectStore.setState({ projectRoot: '/project' })
    vi.mocked(window.api.findBibInProject).mockResolvedValue([
      {
        key: 'Smith2026Paper',
        title: 'A Paper',
        author: 'Ada Smith and Grace Lee',
        year: '2026',
        type: 'article'
      }
    ])

    expect(parseReferenceDragData(JSON.stringify(payload))).toEqual(payload)
    await expect(addReferenceAndBuildCitation(payload)).resolves.toBe('\\cite{Smith2026Paper}')
    expect(window.api.findBibInProject).toHaveBeenCalledWith('/project')
    expect(window.api.researchAddOnline).not.toHaveBeenCalled()
    expect(window.api.zoteroAddToProject).not.toHaveBeenCalled()
  })

  it('rejects a stale project citation that is no longer in the native bibliography index', async () => {
    useProjectStore.setState({ projectRoot: '/project' })
    vi.mocked(window.api.findBibInProject).mockResolvedValue([])

    await expect(
      addReferenceAndBuildCitation({ source: 'project', citekey: 'Missing2026' })
    ).rejects.toThrow('no longer contains @Missing2026')
  })

  it('reconstructs accepted payloads and rejects unsafe metadata', () => {
    expect(
      parseReferenceDragData(
        JSON.stringify({
          source: 'zotero',
          citekey: 'Smith2026Paper',
          port: 23_119,
          metadata: { title: 'A Paper', authors: ['Ada Smith'] },
          injected: 'discard me'
        })
      )
    ).toEqual({
      source: 'zotero',
      citekey: 'Smith2026Paper',
      port: 23_119,
      metadata: { title: 'A Paper', authors: ['Ada Smith'] }
    })
    expect(
      parseReferenceDragData(
        JSON.stringify({
          source: 'online',
          reference: { ...onlineReference, url: 'javascript:alert(1)' }
        })
      )
    ).toBeNull()
    expect(
      parseReferenceDragData(
        JSON.stringify({
          source: 'online',
          reference: { ...onlineReference, url: 'https://user:secret@example.com/paper' }
        })
      )
    ).toBeNull()
    expect(
      parseReferenceDragData(
        JSON.stringify({
          source: 'online',
          reference: { ...onlineReference, year: '2'.repeat(33) }
        })
      )
    ).toBeNull()
    expect(
      parseReferenceDragData(
        JSON.stringify({
          source: 'online',
          reference: { ...onlineReference, type: 't'.repeat(129) }
        })
      )
    ).toBeNull()
    expect(
      parseReferenceDragData(
        JSON.stringify({
          source: 'online',
          reference: { ...onlineReference, url: `https://example.com/${'x'.repeat(4_080)}` }
        })
      )
    ).toBeNull()
    expect(
      parseReferenceDragData(
        JSON.stringify({
          source: 'project',
          citekey: 'Smith2026Paper',
          metadata: { title: 'unsafe\u0000title' }
        })
      )
    ).toBeNull()
  })

  it('enforces the drag payload limit in UTF-8 bytes', () => {
    const oversized = JSON.stringify({
      source: 'online',
      reference: { ...onlineReference, abstract: '논'.repeat(MAX_REFERENCE_DRAG_BYTES / 2) }
    })
    expect(oversized.length).toBeLessThan(MAX_REFERENCE_DRAG_BYTES)
    expect(parseReferenceDragData(oversized)).toBeNull()
  })
})
