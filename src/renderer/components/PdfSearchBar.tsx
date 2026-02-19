import React, { useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

interface PdfSearchBarProps {
  visible: boolean
  onClose: () => void
  onSearch: (query: string) => void
  onNext: () => void
  onPrev: () => void
  matchCount: number
  currentMatch: number
}

const PdfSearchBar = React.memo(function PdfSearchBar({
  visible,
  onClose,
  onSearch,
  onNext,
  onPrev,
  matchCount,
  currentMatch
}: PdfSearchBarProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (visible) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [visible])

  if (!visible) return null

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      onPrev()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onNext()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="pdf-search-bar">
      <input
        ref={inputRef}
        type="text"
        placeholder={t('pdfSearch.placeholder')}
        onChange={(e) => onSearch(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <span className="pdf-search-count">
        {matchCount > 0 ? `${currentMatch + 1}/${matchCount}` : t('pdfSearch.noMatches')}
      </span>
      <button
        onClick={onPrev}
        disabled={matchCount === 0}
        title={t('pdfSearch.previous')}
        aria-label={t('pdfSearch.previous')}
      >
        &#x25B2;
      </button>
      <button
        onClick={onNext}
        disabled={matchCount === 0}
        title={t('pdfSearch.next')}
        aria-label={t('pdfSearch.next')}
      >
        &#x25BC;
      </button>
      <button onClick={onClose} title={t('pdfSearch.close')} aria-label={t('pdfSearch.close')}>
        &#x2715;
      </button>
    </div>
  )
})

export default PdfSearchBar
