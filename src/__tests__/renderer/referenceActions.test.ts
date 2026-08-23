import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addReferenceAndBuildCitation,
  parseZoteroCollectionDragData
} from '../../renderer/components/research/referenceActions'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'

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

  it('validates collection drag payloads', () => {
    expect(
      parseZoteroCollectionDragData(
        JSON.stringify({
          collection: { key: '/0/ABC', name: 'Research', parentKey: null, itemCount: 4 },
          port: 23_119
        })
      )
    ).toEqual({
      collection: { key: '/0/ABC', name: 'Research', parentKey: null, itemCount: 4 },
      port: 23_119
    })
    expect(
      parseZoteroCollectionDragData(
        JSON.stringify({ collection: { key: '../../outside', name: 'Bad', itemCount: 1 } })
      )
    ).toBeNull()
  })
})
