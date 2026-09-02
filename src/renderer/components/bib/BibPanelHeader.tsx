import { useTranslation } from 'react-i18next'
import { FolderPlus } from 'lucide-react'
import { ICON_SIZE } from '../ui/IconSystem'

interface BibPanelHeaderProps {
  filter: string
  onFilterChange: (value: string) => void
  onCreateGroup: () => void
}

export function BibPanelHeader({ filter, onFilterChange, onCreateGroup }: BibPanelHeaderProps) {
  const { t } = useTranslation()

  return (
    <div className="bib-panel-header">
      <input
        type="text"
        placeholder={t('bibPanel.filterPlaceholder')}
        aria-label={t('bibPanel.filterPlaceholder')}
        value={filter}
        onChange={(event) => onFilterChange(event.target.value)}
      />
      <button
        type="button"
        className="bib-new-group-btn"
        onClick={onCreateGroup}
        title={t('bibPanel.newGroup')}
        aria-label={t('bibPanel.newGroup')}
      >
        <FolderPlus size={ICON_SIZE.compact} aria-hidden="true" />
      </button>
    </div>
  )
}
