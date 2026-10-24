import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  SettingsHighlight,
  SettingsSearchBlock,
  SettingsSearchProvider,
  collectSettingsCopy,
  highlightRanges,
  settingsSearchMatches,
  tokenizeSettingsSearch
} from '../../renderer/components/settings/SettingsSearch'
import { SettingsRow, SettingsSection } from '../../renderer/components/settings/SettingsControls'

describe('settings search matching', () => {
  it('folds case and diacritics and requires every term', () => {
    expect(
      settingsSearchMatches(tokenizeSettingsSearch('editeur COMPIL'), 'Éditeur et compilateur')
    ).toBe(true)
    expect(
      settingsSearchMatches(tokenizeSettingsSearch('editeur zotero'), 'Éditeur et compilateur')
    ).toBe(false)
    expect(settingsSearchMatches([], 'anything')).toBe(true)
  })

  it('collects copy from translation subtrees but not React elements', () => {
    expect(collectSettingsCopy({ a: 'one', b: { c: 'two', d: 3 }, e: ['three'] })).toEqual([
      'one',
      'two',
      'three'
    ])
    expect(collectSettingsCopy(<span>Rendered</span>)).toEqual([])
  })

  it('maps highlight ranges back onto the original text', () => {
    expect(highlightRanges('Éditeur', ['editeur'])).toEqual([[0, 7]])
    expect(highlightRanges('Word Wrap', ['word', 'wrap'])).toEqual([
      [0, 4],
      [5, 9]
    ])
    // Overlapping terms merge into one range.
    expect(highlightRanges('Automatically', ['auto', 'tomatic'])).toEqual([[0, 9]])
    // A ligature folds to two characters that both belong to one original code unit.
    expect(highlightRanges('ﬁle', ['fi'])).toEqual([[0, 1]])
    expect(highlightRanges('ﬁle', ['file'])).toEqual([[0, 3]])
    expect(highlightRanges('no hit', ['zotero'])).toEqual([])
  })
})

describe('settings search rendering', () => {
  it('wraps matches in marks and hides rows and sections that do not match', () => {
    render(
      <SettingsSearchProvider query="night">
        <SettingsSection title="PDF preview" description="Compiled page display">
          <SettingsRow label="PDF Night Mode" description="Invert colors at night">
            <input aria-label="PDF Night Mode" type="checkbox" />
          </SettingsRow>
          <SettingsRow label="Scroll Sync">
            <input aria-label="Scroll Sync" type="checkbox" />
          </SettingsRow>
        </SettingsSection>
        <SettingsSection title="Theme">
          <SettingsRow label="Light">
            <input aria-label="Light" type="checkbox" />
          </SettingsRow>
        </SettingsSection>
      </SettingsSearchProvider>
    )

    expect(screen.getByLabelText('PDF Night Mode')).toBeVisible()
    expect(screen.queryByLabelText('Scroll Sync')).not.toBeInTheDocument()
    expect(screen.getByText('PDF preview')).toBeVisible()
    expect(screen.getByText('Theme')).not.toBeVisible()

    const marks = screen.getAllByText('Night', { selector: 'mark' })
    expect(marks).toHaveLength(1)
    expect(screen.getByText('night', { selector: 'mark' })).toHaveClass('settings-search-match')
  })

  it('keeps every row of a section whose heading matches, and every child of a matching block', () => {
    render(
      <SettingsSearchProvider query="typography">
        <SettingsSection title="Typography">
          <SettingsRow label="Font Size">
            <input aria-label="Font Size" type="range" />
          </SettingsRow>
          <SettingsSearchBlock keywords={['Tab Size']}>
            <input aria-label="Tab Size" type="number" />
          </SettingsSearchBlock>
        </SettingsSection>
        <SettingsSection title="Behavior" keywords={['typography is mentioned here']}>
          <SettingsRow label="Word Wrap">
            <input aria-label="Word Wrap" type="checkbox" />
          </SettingsRow>
        </SettingsSection>
      </SettingsSearchProvider>
    )

    expect(screen.getByLabelText('Font Size')).toBeVisible()
    expect(screen.getByLabelText('Tab Size')).toBeVisible()
    // Section keywords keep the header visible without forcing its rows.
    expect(screen.getByText('Behavior')).toBeVisible()
    expect(screen.queryByLabelText('Word Wrap')).not.toBeInTheDocument()
  })

  it('renders plain text and everything visible when there is no query', () => {
    render(
      <SettingsSearchProvider query="">
        <SettingsSection title="Theme">
          <SettingsSearchBlock keywords={['Light']}>
            <SettingsHighlight text="Light" />
          </SettingsSearchBlock>
        </SettingsSection>
      </SettingsSearchProvider>
    )

    expect(screen.getByText('Light')).toBeVisible()
    expect(document.querySelector('mark')).toBeNull()
  })
})
