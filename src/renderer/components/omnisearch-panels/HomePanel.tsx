import { BookOpen, FolderOpen, Terminal } from 'lucide-react'
import { ICON_SIZE } from '../ui/IconSystem'
import { useTranslation } from 'react-i18next'
import type { HomeResult } from './types'

interface HomePanelProps {
  homeResults: HomeResult[]
  emptyLabel?: string
  homeHighlightedIndex: number
  setHomeHighlightedIndex: (index: number) => void
  handleHomeSelect: (result: HomeResult) => void
  getOptionId: (index: number) => string
}

function homeResultIcon(result: HomeResult): React.ReactNode {
  switch (result.kind) {
    case 'project':
      return <FolderOpen size={ICON_SIZE.control} />
    case 'template':
      return <BookOpen size={ICON_SIZE.control} />
    case 'command':
    case 'app-command':
      return <Terminal size={ICON_SIZE.control} />
  }
}

export function HomePanel({
  homeResults,
  emptyLabel,
  homeHighlightedIndex,
  setHomeHighlightedIndex,
  handleHomeSelect,
  getOptionId
}: HomePanelProps) {
  const { t } = useTranslation()

  return (
    <>
      {homeResults.length === 0 && emptyLabel && (
        <div className="omni-search-message" aria-hidden="true">
          {emptyLabel}
        </div>
      )}
      {homeResults.map((result, i) => {
        const optionId = getOptionId(i)
        const detailId = `${optionId}-detail`
        return (
          <div
            key={`${result.kind}-${result.label}-${i}`}
            id={optionId}
            role="option"
            aria-label={result.label}
            aria-describedby={detailId}
            aria-selected={i === homeHighlightedIndex}
            aria-disabled={result.disabled || undefined}
            className={`omni-search-result omni-search-home-result${i === homeHighlightedIndex ? ' highlighted' : ''}${result.disabled ? ' disabled' : ''}`}
            onMouseEnter={() => setHomeHighlightedIndex(i)}
            onClick={() => {
              if (!result.disabled) handleHomeSelect(result)
            }}
          >
            <span className="omni-search-home-result-icon">{homeResultIcon(result)}</span>
            <div className="omni-search-result-text">
              <span className="omni-search-result-title">{result.label}</span>
              <span id={detailId} className="omni-search-result-meta">
                {result.detail}
              </span>
            </div>
            {result.shortcut && (
              <kbd className="omni-search-command-shortcut" aria-hidden="true">
                {result.shortcut}
              </kbd>
            )}
            <span className="omni-search-home-badge">{t(result.badgeKey)}</span>
          </div>
        )
      })}
    </>
  )
}
