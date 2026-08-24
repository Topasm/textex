import { useTranslation } from 'react-i18next'
import type { OnlineReference } from '../../../shared/types'

interface OnlineSearchPanelProps {
  loading: boolean
  results: OnlineReference[]
  searchTerm: string
  highlightedIndex: number
  setHighlightedIndex: (index: number) => void
  addReference: (reference: OnlineReference) => void
  getOptionId: (index: number) => string
}

export function OnlineSearchPanel({
  loading,
  results,
  searchTerm,
  highlightedIndex,
  setHighlightedIndex,
  addReference,
  getOptionId
}: OnlineSearchPanelProps) {
  const { t } = useTranslation()

  if (loading) return <div className="omni-search-message">{t('omniSearch.searching')}</div>
  if (results.length === 0 && searchTerm.length > 1) {
    return <div className="omni-search-message">{t('omniSearch.noResults')}</div>
  }

  return (
    <>
      {results.map((reference, index) => (
        <button
          type="button"
          key={`${reference.source}:${reference.id}`}
          id={getOptionId(index)}
          role="option"
          aria-selected={index === highlightedIndex}
          tabIndex={-1}
          className={`omni-search-result${index === highlightedIndex ? ' highlighted' : ''}`}
          onClick={() => addReference(reference)}
          onMouseEnter={() => setHighlightedIndex(index)}
        >
          <div className="omni-search-result-text">
            <span className="omni-search-result-title">{reference.title}</span>
            <span className="omni-search-result-meta">
              {reference.authors.slice(0, 2).join(', ') || t('bibPanel.unknownAuthor')}
              {reference.year ? ` · ${reference.year}` : ''} · {reference.source}
            </span>
          </div>
        </button>
      ))}
      {results.length > 0 && (
        <div className="omni-search-footer" role="presentation">
          {t('omniSearch.onlineInsertHint')}
        </div>
      )}
    </>
  )
}
