import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { EditorTab } from '../../renderer/components/settings/EditorTab'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'

describe('EditorTab', () => {
  beforeEach(() => {
    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        sidebarPosition: 'left',
        autoHideSidebar: false
      }
    }))
  })

  it('renders the sidebar position selector and updates the store', () => {
    render(<EditorTab />)

    expect(screen.queryByText('Minimap')).toBeInTheDocument()

    const sidebarLabel = screen.getByText('Sidebar Position')
    const row = sidebarLabel.closest('.settings-row')
    const select = row?.querySelector('select')

    expect(select).not.toBeNull()
    expect(select).toHaveValue('left')

    fireEvent.change(select as HTMLSelectElement, { target: { value: 'right' } })

    expect(useSettingsStore.getState().settings.sidebarPosition).toBe('right')
  })
})
