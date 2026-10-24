import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { IntegrationsSettings } from '../../renderer/components/settings/IntegrationsSettings'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'

describe('IntegrationsSettings Zotero section', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useProjectStore.setState({ projectRoot: '/project', bibEntries: [] })
    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        zoteroEnabled: true,
        zoteroPort: 23119,
        zoteroSyncMode: 'continuous'
      }
    }))
    vi.mocked(window.api.zoteroProbe).mockResolvedValue(true)
  })

  it('owns the sync behavior for every project', () => {
    render(<IntegrationsSettings />)

    fireEvent.change(screen.getByLabelText('Collection sync'), { target: { value: 'off' } })

    expect(useSettingsStore.getState().settings.zoteroSyncMode).toBe('off')
  })

  it('no longer carries a second collection field and sync button', () => {
    render(<IntegrationsSettings />)

    // The collection is chosen with the picker in the Research panel, which
    // stores it per project. This tab used to keep a hand-typed path of its
    // own plus a sync button that used it, so the two never agreed.
    expect(screen.queryByLabelText('Collection path')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sync collection' })).not.toBeInTheDocument()
    expect(window.api.zoteroSyncCollection).not.toHaveBeenCalled()
  })
})
