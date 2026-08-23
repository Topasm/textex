import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppearanceTab } from '../../renderer/components/settings/AppearanceTab'
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

describe('AppearanceTab', () => {
  it('exposes the existing high-contrast theme and selects it accessibly', () => {
    render(<AppearanceTab />)

    const highContrast = screen.getByRole('button', { name: 'High contrast' })
    expect(highContrast).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(highContrast)

    expect(useSettingsStore.getState().settings.theme).toBe('high-contrast')
    expect(useSettingsStore.getState().settings.pdfInvertMode).toBe(true)
    expect(highContrast).toHaveAttribute('aria-pressed', 'true')
  })
})
