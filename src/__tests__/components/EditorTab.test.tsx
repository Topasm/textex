import { render, screen } from '@testing-library/react'
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

  it('keeps the navigator fixed and omits the legacy position selector', () => {
    render(<EditorTab />)

    expect(screen.queryByText('Minimap')).toBeInTheDocument()

    expect(screen.queryByText('Sidebar Position')).not.toBeInTheDocument()
    expect(useSettingsStore.getState().settings.sidebarPosition).toBe('left')
  })
})
