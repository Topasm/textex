import type { ReactNode, SelectHTMLAttributes } from 'react'
import { Toggle } from './Toggle'

interface SettingsSectionProps {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
}

export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <section className="settings-pane-section">
      <header className="settings-pane-section-header">
        <h3 className="settings-heading">{title}</h3>
        {description && <p className="settings-subheading">{description}</p>}
      </header>
      <div className="settings-stack">{children}</div>
    </section>
  )
}

interface SettingsRowProps {
  label: ReactNode
  description?: ReactNode
  htmlFor?: string
  children: ReactNode
}

export function SettingsRow({ label, description, htmlFor, children }: SettingsRowProps) {
  const labelNode = htmlFor ? (
    <label className="settings-row-label" htmlFor={htmlFor}>
      {label}
    </label>
  ) : (
    <div className="settings-row-label">{label}</div>
  )

  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        {labelNode}
        {description && <div className="settings-row-description">{description}</div>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  )
}

interface SettingsToggleRowProps {
  label: string
  description?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
}

export function SettingsToggleRow({
  label,
  description,
  checked,
  onChange
}: SettingsToggleRowProps) {
  return (
    <SettingsRow label={label} description={description}>
      <Toggle aria-label={label} checked={checked} onChange={onChange} />
    </SettingsRow>
  )
}

type SettingsSelectWidth = 'narrow' | 'medium' | 'wide'

interface SettingsSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  width?: SettingsSelectWidth
}

export function SettingsSelect({
  width = 'medium',
  className = '',
  ...props
}: SettingsSelectProps) {
  const classes = ['settings-select', `settings-select-${width}`, className]
    .filter(Boolean)
    .join(' ')
  return <select {...props} className={classes} />
}

interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
}

interface SettingsSegmentedControlProps<T extends string> {
  label: string
  value: T
  options: readonly SegmentedOption<T>[]
  onChange: (value: T) => void
}

export function SettingsSegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange
}: SettingsSegmentedControlProps<T>) {
  return (
    <div className="settings-segmented-control" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? 'active' : ''}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
