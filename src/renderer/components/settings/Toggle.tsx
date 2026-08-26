import type { ButtonHTMLAttributes } from 'react'

export const Toggle = ({
  checked,
  onChange,
  ...buttonProps
}: {
  checked: boolean
  onChange: (checked: boolean) => void
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'role'>) => (
  <button
    {...buttonProps}
    type="button"
    onClick={() => onChange(!checked)}
    className="settings-toggle-track"
    role="switch"
    aria-checked={checked}
  >
    <span aria-hidden="true" className="settings-toggle-knob" />
  </button>
)
