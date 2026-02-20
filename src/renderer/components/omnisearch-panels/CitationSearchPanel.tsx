import { useTranslation } from 'react-i18next'
import type { BibEntry } from './types'

interface CitationSearchPanelProps {
  citeResults: BibEntry[]
  searchTerm: string
  highlightedIndex: number
  setHighlightedIndex: (index: number) => void
  selectedKeys: Set<string>
  toggleSelection: (key: string) => void
}

export function CitationSearchPanel({
  citeResults,
  searchTerm,
  highlightedIndex,
  setHighlightedIndex,
  selectedKeys,
  toggleSelection
}: CitationSearchPanelProps) {
  const { t } = useTranslation()

  if (citeResults.length === 0 && searchTerm) {
    return <div className="omni-search-message">{t('omniSearch.noResults')}</div>
  }

  return (
    <>
      {citeResults.map((entry, i) => (
        <div
          key={entry.key}
          className={`omni-search-result${i === highlightedIndex ? ' highlighted' : ''}${selectedKeys.has(entry.key) ? ' selected' : ''}`}
          onClick={() => toggleSelection(entry.key)}
          onMouseEnter={() => setHighlightedIndex(i)}
        >
          <input type="checkbox" checked={selectedKeys.has(entry.key)} readOnly />
          <div className="omni-search-result-text">
            <span className="omni-search-result-title">{entry.title || entry.key}</span>
            <span className="omni-search-result-meta">
              {entry.author} · {entry.year} · @{entry.key}
            </span>
          </div>
        </div>
      ))}
      <div className="omni-search-footer">
        {selectedKeys.size === 0
          ? t('omniSearch.enterToSelect')
          : t('omniSearch.selectedInsert', { count: selectedKeys.size })}
      </div>
    </>
  )
}
