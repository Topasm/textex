import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppearanceSettings } from '../../renderer/components/settings/AppearanceSettings'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'

beforeEach(() => {
  useSettingsStore.setState((state) => ({
    settings: {
      ...state.settings,
      theme: 'light',
      pdfInvertMode: false
    }
  }))
  vi.mocked(window.api.saveSettings).mockResolvedValue(useSettingsStore.getState().settings)
})

describe('AppearanceSettings', () => {
  it('selects high contrast without overriding the independent PDF appearance', () => {
    render(<AppearanceSettings />)

    const highContrast = screen.getByRole('button', { name: 'High contrast' })
    expect(highContrast).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(highContrast)

    expect(useSettingsStore.getState().settings.theme).toBe('high-contrast')
    expect(useSettingsStore.getState().settings.pdfInvertMode).toBe(false)
    expect(highContrast).toHaveAttribute('aria-pressed', 'true')
  })
})
