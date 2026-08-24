import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { ICON_SIZE } from '../ui/IconSystem'

interface PdfSearchPanelProps {
  pdfMatchCount: number
  pdfCurrentMatch: number
  searchTerm: string
  handlePdfPrev: () => void
  handlePdfNext: () => void
}

export function PdfSearchPanel({
  pdfMatchCount,
  pdfCurrentMatch,
  searchTerm,
  handlePdfPrev,
  handlePdfNext
}: PdfSearchPanelProps) {
  const { t } = useTranslation()

  return (
    <div className="omni-search-pdf-controls">
      <span className="omni-search-pdf-count">
        {pdfMatchCount > 0
          ? t('omniSearch.matches', { current: pdfCurrentMatch + 1, total: pdfMatchCount })
          : searchTerm
            ? t('omniSearch.noMatches')
            : ''}
      </span>
      <button
        type="button"
        onClick={handlePdfPrev}
        disabled={pdfMatchCount === 0}
        title={t('omniSearch.prevMatch')}
        aria-label={t('omniSearch.prevMatch')}
      >
        <ChevronUp size={ICON_SIZE.compact} />
      </button>
      <button
        type="button"
        onClick={handlePdfNext}
        disabled={pdfMatchCount === 0}
        title={t('omniSearch.nextMatch')}
        aria-label={t('omniSearch.nextMatch')}
      >
        <ChevronDown size={ICON_SIZE.compact} />
      </button>
    </div>
  )
}
