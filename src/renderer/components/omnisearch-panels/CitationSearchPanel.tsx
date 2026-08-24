import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import type { BibEntry } from './types'
import { ICON_SIZE } from '../ui/IconSystem'

interface CitationSearchPanelProps {
  citeResults: BibEntry[]
  searchTerm: string
  highlightedIndex: number
  setHighlightedIndex: (index: number) => void
  selectedKeys: Set<string>
  toggleSelection: (key: string) => void
  getOptionId: (index: number) => string
}

export function CitationSearchPanel({
  citeResults,
  searchTerm,
  highlightedIndex,
  setHighlightedIndex,
  selectedKeys,
  toggleSelection,
  getOptionId
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
          id={getOptionId(i)}
          role="option"
          aria-selected={selectedKeys.has(entry.key)}
          className={`omni-search-result${i === highlightedIndex ? ' highlighted' : ''}${selectedKeys.has(entry.key) ? ' selected' : ''}`}
          onClick={() => toggleSelection(entry.key)}
          onMouseEnter={() => setHighlightedIndex(i)}
        >
          <span className="omni-search-selection-indicator" aria-hidden="true">
            {selectedKeys.has(entry.key) && <Check size={ICON_SIZE.micro} />}
          </span>
          <div className="omni-search-result-text">
            <span className="omni-search-result-title">{entry.title || entry.key}</span>
            <span className="omni-search-result-meta">
              {entry.author} · {entry.year} · @{entry.key}
            </span>
          </div>
        </div>
      ))}
      <div className="omni-search-footer" role="presentation">
        {selectedKeys.size === 0
          ? t('omniSearch.enterToSelect')
          : t('omniSearch.selectedInsert', { count: selectedKeys.size })}
      </div>
    </>
  )
}
