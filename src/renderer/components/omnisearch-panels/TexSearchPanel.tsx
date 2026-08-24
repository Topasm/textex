import { useTranslation } from 'react-i18next'
import type { TexSearchResult } from './types'

interface TexSearchPanelProps {
  texResults: TexSearchResult[]
  searchTerm: string
  highlightedIndex: number
  setHighlightedIndex: (index: number) => void
  jumpToLine: (line: number) => void
  getOptionId: (index: number) => string
}

export function TexSearchPanel({
  texResults,
  searchTerm,
  highlightedIndex,
  setHighlightedIndex,
  jumpToLine,
  getOptionId
}: TexSearchPanelProps) {
  const { t } = useTranslation()

  if (texResults.length === 0 && searchTerm) {
    return <div className="omni-search-message">{t('omniSearch.noResults')}</div>
  }

  return (
    <>
      {texResults.map((result, i) => (
        <div
          key={`${result.line}-${i}`}
          id={getOptionId(i)}
          role="option"
          aria-selected={i === highlightedIndex}
          className={`omni-search-result omni-search-tex-result${i === highlightedIndex ? ' highlighted' : ''}`}
          onClick={() => {
            setHighlightedIndex(i)
            jumpToLine(result.line)
          }}
          onMouseEnter={() => setHighlightedIndex(i)}
        >
          <span className="omni-search-line-number">{result.line}</span>
          <span className="omni-search-line-text">{result.text.trim()}</span>
        </div>
      ))}
      <div className="omni-search-footer" role="presentation">
        Enter {t('omniSearch.nextMatch')} · Shift+Enter {t('omniSearch.prevMatch')}
      </div>
    </>
  )
}
