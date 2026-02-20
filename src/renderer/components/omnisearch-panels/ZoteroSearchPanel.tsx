import { useTranslation } from 'react-i18next'
import type { ZoteroSearchResult } from './types'

interface ZoteroSearchPanelProps {
  zoteroEnabled: boolean
  loading: boolean
  zoteroResults: ZoteroSearchResult[]
  searchTerm: string
  highlightedIndex: number
  setHighlightedIndex: (index: number) => void
  selectedKeys: Set<string>
  toggleSelection: (key: string) => void
}

export function ZoteroSearchPanel({
  zoteroEnabled,
  loading,
  zoteroResults,
  searchTerm,
  highlightedIndex,
  setHighlightedIndex,
  selectedKeys,
  toggleSelection
}: ZoteroSearchPanelProps) {
  const { t } = useTranslation()

  if (!zoteroEnabled) {
    return <div className="omni-search-message">{t('omniSearch.zoteroNotConnected')}</div>
  }
  if (loading) {
    return <div className="omni-search-message">Searching...</div>
  }
  if (zoteroResults.length === 0 && searchTerm.length > 2) {
    return <div className="omni-search-message">{t('omniSearch.noResults')}</div>
  }

  return (
    <>
      {zoteroResults.map((item, i) => (
        <div
          key={item.citekey}
          className={`omni-search-result${i === highlightedIndex ? ' highlighted' : ''}${selectedKeys.has(item.citekey) ? ' selected' : ''}`}
          onClick={() => toggleSelection(item.citekey)}
          onMouseEnter={() => setHighlightedIndex(i)}
        >
          <input type="checkbox" checked={selectedKeys.has(item.citekey)} readOnly />
          <div className="omni-search-result-text">
            <span className="omni-search-result-title">{item.title}</span>
            <span className="omni-search-result-meta">
              {item.author} · {item.year} · @{item.citekey}
            </span>
          </div>
        </div>
      ))}
      {zoteroResults.length > 0 && (
        <div className="omni-search-footer">
          {selectedKeys.size === 0
            ? t('omniSearch.enterToSelect')
            : t('omniSearch.selectedInsert', { count: selectedKeys.size })}
        </div>
      )}
    </>
  )
}
