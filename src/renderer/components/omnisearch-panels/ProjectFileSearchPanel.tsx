import { FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ProjectFileSearchResult } from './types'

interface ProjectFileSearchPanelProps {
  results: ProjectFileSearchResult[]
  searchTerm: string
  highlightedIndex: number
  setHighlightedIndex: (index: number) => void
  openFile: (result: ProjectFileSearchResult) => void
}

export function ProjectFileSearchPanel({
  results,
  searchTerm,
  highlightedIndex,
  setHighlightedIndex,
  openFile
}: ProjectFileSearchPanelProps) {
  const { t } = useTranslation()

  if (results.length === 0 && searchTerm) {
    return <div className="omni-search-message">{t('omniSearch.noResults')}</div>
  }

  return (
    <>
      {results.map((result, index) => (
        <div
          key={result.path}
          className={`omni-search-result${index === highlightedIndex ? ' highlighted' : ''}`}
          onClick={() => openFile(result)}
          onMouseEnter={() => setHighlightedIndex(index)}
        >
          <FileText size={15} aria-hidden="true" />
          <span className="omni-search-result-text">
            <span className="omni-search-result-title">{result.name}</span>
            <span className="omni-search-result-meta">{result.relativePath}</span>
          </span>
        </div>
      ))}
      {results.length > 0 && (
        <div className="omni-search-footer">{t('omniSearch.enterToOpenFile')}</div>
      )}
    </>
  )
}
