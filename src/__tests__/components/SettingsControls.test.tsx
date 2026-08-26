import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  SettingsRow,
  SettingsSection,
  SettingsSegmentedControl,
  SettingsSelect,
  SettingsToggleRow
} from '../../renderer/components/settings/SettingsControls'

describe('settings controls', () => {
  it('provides semantic sections, rows, and associated controls', () => {
    render(
      <SettingsSection title="Application" description="Global preferences">
        <SettingsRow label="Language" description="Display language" htmlFor="language">
          <SettingsSelect id="language" width="narrow" defaultValue="en">
            <option value="en">English</option>
          </SettingsSelect>
        </SettingsRow>
      </SettingsSection>
    )

    expect(screen.getByRole('heading', { name: 'Application' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveClass('settings-select-narrow')
  })

  it('labels toggle rows and reports the next checked state', () => {
    const onChange = vi.fn()
    render(
      <SettingsToggleRow
        label="Automatic updates"
        description="Check after launch"
        checked={false}
        onChange={onChange}
      />
    )

    const toggle = screen.getByRole('switch', { name: 'Automatic updates' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('exposes segmented choices as a labeled pressed-state group', () => {
    const onChange = vi.fn()
    render(
      <SettingsSegmentedControl
        label="PDF view mode"
        value="continuous"
        options={[
          { value: 'continuous', label: 'Continuous' },
          { value: 'single', label: 'Single page' }
        ]}
        onChange={onChange}
      />
    )

    expect(screen.getByRole('group', { name: 'PDF view mode' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuous' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Single page' }))
    expect(onChange).toHaveBeenCalledWith('single')
  })
})
