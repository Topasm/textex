import { useTranslation } from 'react-i18next'

type BibGroupMode = 'flat' | 'author' | 'year' | 'type' | 'custom'

interface BibPanelHeaderProps {
  filter: string
  onFilterChange: (value: string) => void
  groupMode: BibGroupMode
  onGroupModeChange: (mode: BibGroupMode) => void
}

export function BibPanelHeader({
  filter,
  onFilterChange,
  groupMode,
  onGroupModeChange
}: BibPanelHeaderProps) {
  const { t } = useTranslation()

  return (
    <div className="bib-panel-header">
      <input
        type="text"
        placeholder={t('bibPanel.filterPlaceholder')}
        value={filter}
        onChange={(e) => onFilterChange(e.target.value)}
      />
      <select
        value={groupMode}
        onChange={(e) => onGroupModeChange(e.target.value as BibGroupMode)}
        title={t('bibPanel.groupBy')}
      >
        <option value="flat">{t('bibPanel.flat')}</option>
        <option value="author">{t('bibPanel.byAuthor')}</option>
        <option value="year">{t('bibPanel.byYear')}</option>
        <option value="type">{t('bibPanel.byType')}</option>
        <option value="custom">{t('bibPanel.custom')}</option>
      </select>
    </div>
  )
}
