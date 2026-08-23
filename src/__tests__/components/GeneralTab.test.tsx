import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GeneralTab } from '../../renderer/components/settings/GeneralTab'
import { createDefaultUserSettings } from '../../shared/defaultSettings'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'

const { checkForAppUpdate } = vi.hoisted(() => ({
  checkForAppUpdate: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../../renderer/services/updateLifecycle', () => ({ checkForAppUpdate }))

describe('GeneralTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsStore.setState({ settings: createDefaultUserSettings() })
  })

  it('runs a visible manual check through the shared updater lifecycle', () => {
    render(<GeneralTab />)

    expect(screen.getByText('Automatically check for updates')).toBeInTheDocument()
    expect(
      screen.getByText(/download and installation still require confirmation/i)
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Check now' }))

    expect(checkForAppUpdate).toHaveBeenCalledTimes(1)
    expect(checkForAppUpdate).toHaveBeenCalledWith({ interactive: true })
  })
})
