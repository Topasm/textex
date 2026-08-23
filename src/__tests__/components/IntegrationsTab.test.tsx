import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { IntegrationsTab } from '../../renderer/components/settings/IntegrationsTab'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'

describe('IntegrationsTab Zotero collection sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useProjectStore.setState({ projectRoot: '/project', bibEntries: [] })
    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        zoteroEnabled: true,
        zoteroPort: 23119,
        zoteroCollection: ''
      }
    }))
    vi.mocked(window.api.zoteroProbe).mockResolvedValue(true)
    vi.mocked(window.api.zoteroSyncCollection).mockResolvedValue({
      filePath: '/project/references.bib',
      bytesWritten: 42,
      entryCount: 1
    })
    vi.mocked(window.api.parseBibFile).mockResolvedValue([
      {
        key: 'smith2026',
        type: 'article',
        title: 'A Paper',
        author: 'Smith, Ada',
        year: '2026'
      }
    ])
  })

  it('syncs the configured collection and refreshes bibliography state', async () => {
    render(<IntegrationsTab />)
    fireEvent.change(screen.getByLabelText('Collection path'), {
      target: { value: '/0/8CV58ZVD' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sync collection' }))

    await waitFor(() => {
      expect(window.api.zoteroSyncCollection).toHaveBeenCalledWith('/0/8CV58ZVD', undefined, 23119)
    })
    expect(window.api.parseBibFile).toHaveBeenCalledWith('/project/references.bib')
    expect(useProjectStore.getState().bibEntries).toHaveLength(1)
    expect(await screen.findByText(/Synced 1 bibliography entry/)).toBeInTheDocument()
  })
})
