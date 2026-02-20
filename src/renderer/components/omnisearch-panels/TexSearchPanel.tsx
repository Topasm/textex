import { ChevronDown, ChevronUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TexSearchResult } from './types'

interface TexSearchPanelProps {
  texResults: TexSearchResult[]
  searchTerm: string
  highlightedIndex: number
  setHighlightedIndex: (index: number) => void
  jumpToLine: (line: number) => void
  handleTexPrev: () => void
  handleTexNext: () => void
}

export function TexSearchPanel({
  texResults,
  searchTerm,
  highlightedIndex,
  setHighlightedIndex,
  jumpToLine,
  handleTexPrev,
  handleTexNext
}: TexSearchPanelProps) {
  const { t } = useTranslation()

  if (texResults.length === 0 && searchTerm) {
    return <div className="omni-search-message">{t('omniSearch.noResults')}</div>
  }

  return (
    <>
      <div className="omni-search-tex-nav">
        <span className="omni-search-tex-count">
          {texResults.length > 0
            ? t('omniSearch.matches', { current: highlightedIndex + 1, total: texResults.length })
            : ''}
        </span>
        <button
          onClick={handleTexPrev}
          disabled={texResults.length === 0}
          title={t('omniSearch.prevMatch')}
        >
          <ChevronUp size={14} />
        </button>
        <button
          onClick={handleTexNext}
          disabled={texResults.length === 0}
          title={t('omniSearch.nextMatch')}
        >
          <ChevronDown size={14} />
        </button>
      </div>
      {texResults.map((result, i) => (
        <div
          key={`${result.line}-${i}`}
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
      <div className="omni-search-footer">
        Enter {t('omniSearch.nextMatch')} · Shift+Enter {t('omniSearch.prevMatch')}
      </div>
    </>
  )
}
