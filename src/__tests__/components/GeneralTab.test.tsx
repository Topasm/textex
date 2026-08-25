import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppearanceTab } from '../../renderer/components/settings/AppearanceTab'
import { createDefaultUserSettings } from '../../shared/defaultSettings'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'

const { checkForAppUpdate } = vi.hoisted(() => ({
  checkForAppUpdate: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../../renderer/services/updateLifecycle', () => ({ checkForAppUpdate }))

describe('AppearanceTab application settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsStore.setState({ settings: createDefaultUserSettings() })
  })

  it('runs a visible manual check through the shared updater lifecycle', () => {
    render(<AppearanceTab />)

    expect(screen.queryByText('User Information')).not.toBeInTheDocument()
    expect(screen.getByText('Automatically check for updates')).toBeInTheDocument()
    expect(
      screen.getByText(/download and installation still require confirmation/i)
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Check now' }))

    expect(checkForAppUpdate).toHaveBeenCalledTimes(1)
    expect(checkForAppUpdate).toHaveBeenCalledWith({ interactive: true })
  })
})
