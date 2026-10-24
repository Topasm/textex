import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SelectHTMLAttributes
} from 'react'
import { Toggle } from './Toggle'
import {
  SettingsHighlight,
  SettingsSectionScopeProvider,
  settingsSearchMatches,
  useSettingsSearch,
  useSettingsSectionScope
} from './SettingsSearch'

function renderCopy(value: ReactNode): ReactNode {
  return typeof value === 'string' ? <SettingsHighlight text={value} /> : value
}

interface SettingsSectionProps {
  title: ReactNode
  description?: ReactNode
  /** A control that belongs to the section as a whole, such as its master toggle. */
  action?: ReactNode
  /**
   * Copy that should keep the section's header on screen even when none of its
   * rows is rendered, e.g. the options hidden behind a disabled master toggle.
   */
  keywords?: readonly unknown[]
  children?: ReactNode
}

export function SettingsSection({
  title,
  description,
  action,
  keywords = [],
  children
}: SettingsSectionProps) {
  const { tokens } = useSettingsSearch()
  const searching = tokens.length > 0
  const headingMatches = searching && settingsSearchMatches(tokens, title, description)
  const selfMatches = headingMatches || (searching && settingsSearchMatches(tokens, keywords))
  const stackRef = useRef<HTMLDivElement>(null)
  const [empty, setEmpty] = useState(false)

  // Rows decide on their own whether they match, so the section learns it has
  // nothing left to show by looking at what its stack actually rendered. The
  // children element changes whenever the parent re-renders (a toggle revealed
  // more rows, say), which is exactly when the count has to be re-read.
  useLayoutEffect(() => {
    const next = searching && !selfMatches && (stackRef.current?.childElementCount ?? 0) === 0
    setEmpty((previous) => (previous === next ? previous : next))
  }, [searching, selfMatches, children])

  const scope = useMemo(() => ({ forceVisible: headingMatches }), [headingMatches])

  return (
    <SettingsSectionScopeProvider value={scope}>
      <section className="settings-pane-section" hidden={empty || undefined}>
        <header className="settings-pane-section-header">
          <div className="settings-pane-section-heading">
            <h3 className="settings-heading">{renderCopy(title)}</h3>
            {description && <p className="settings-subheading">{renderCopy(description)}</p>}
          </div>
          {action && <div className="settings-pane-section-action">{action}</div>}
        </header>
        <div ref={stackRef} className="settings-stack">
          {children}
        </div>
      </section>
    </SettingsSectionScopeProvider>
  )
}

interface SettingsRowProps {
  label: ReactNode
  description?: ReactNode
  htmlFor?: string
  /** Extra copy the row answers to, such as the labels of its options. */
  keywords?: readonly unknown[]
  children: ReactNode
}

export function SettingsRow({
  label,
  description,
  htmlFor,
  keywords = [],
  children
}: SettingsRowProps) {
  const { tokens } = useSettingsSearch()
  const { forceVisible } = useSettingsSectionScope()
  if (
    tokens.length > 0 &&
    !forceVisible &&
    !settingsSearchMatches(tokens, label, description, keywords)
  ) {
    return null
  }

  const labelNode = htmlFor ? (
    <label className="settings-row-label" htmlFor={htmlFor}>
      {renderCopy(label)}
    </label>
  ) : (
    <div className="settings-row-label">{renderCopy(label)}</div>
  )

  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        {labelNode}
        {description && <div className="settings-row-description">{renderCopy(description)}</div>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  )
}

interface SettingsToggleRowProps {
  label: string
  description?: ReactNode
  keywords?: readonly unknown[]
  checked: boolean
  onChange: (checked: boolean) => void
}

export function SettingsToggleRow({
  label,
  description,
  keywords,
  checked,
  onChange
}: SettingsToggleRowProps) {
  return (
    <SettingsRow label={label} description={description} keywords={keywords}>
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
