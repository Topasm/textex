import { useTranslation } from 'react-i18next'

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
          : searchTerm ? t('omniSearch.noMatches') : ''}
      </span>
      <button onClick={handlePdfPrev} disabled={pdfMatchCount === 0} title={t('omniSearch.prevMatch')}>
        &#x25B2;
      </button>
      <button onClick={handlePdfNext} disabled={pdfMatchCount === 0} title={t('omniSearch.nextMatch')}>
        &#x25BC;
      </button>
    </div>
  )
}
