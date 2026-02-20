import { BookOpen, FolderOpen, Terminal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { HomeResult } from './types'

interface HomePanelProps {
  homeResults: HomeResult[]
  homeHighlightedIndex: number
  setHomeHighlightedIndex: (index: number) => void
  handleHomeSelect: (result: HomeResult) => void
}

function homeResultIcon(result: HomeResult): React.ReactNode {
  switch (result.kind) {
    case 'project':
      return <FolderOpen size={16} />
    case 'template':
      return <BookOpen size={16} />
    case 'command':
      return <Terminal size={16} />
  }
}

export function HomePanel({
  homeResults,
  homeHighlightedIndex,
  setHomeHighlightedIndex,
  handleHomeSelect
}: HomePanelProps) {
  const { t } = useTranslation()

  return (
    <>
      {homeResults.map((result, i) => (
        <div
          key={`${result.kind}-${result.label}-${i}`}
          className={`omni-search-result omni-search-home-result${i === homeHighlightedIndex ? ' highlighted' : ''}`}
          onMouseEnter={() => setHomeHighlightedIndex(i)}
          onClick={() => handleHomeSelect(result)}
        >
          <span className="omni-search-home-result-icon">{homeResultIcon(result)}</span>
          <div className="omni-search-result-text">
            <span className="omni-search-result-title">{result.label}</span>
            <span className="omni-search-result-meta">{result.detail}</span>
          </div>
          <span className="omni-search-home-badge">{t(result.badgeKey)}</span>
        </div>
      ))}
    </>
  )
}
