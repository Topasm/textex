type BibGroupMode = 'flat' | 'author' | 'year' | 'type' | 'custom'

interface BibPanelHeaderProps {
  filter: string
  onFilterChange: (value: string) => void
  groupMode: BibGroupMode
  onGroupModeChange: (mode: BibGroupMode) => void
}

export function BibPanelHeader({ filter, onFilterChange, groupMode, onGroupModeChange }: BibPanelHeaderProps) {
  return (
    <div className="bib-panel-header">
      <input
        type="text"
        placeholder="Filter citations..."
        value={filter}
        onChange={(e) => onFilterChange(e.target.value)}
      />
      <select
        value={groupMode}
        onChange={(e) => onGroupModeChange(e.target.value as BibGroupMode)}
        title="Group citations by"
      >
        <option value="flat">Flat</option>
        <option value="author">By Author</option>
        <option value="year">By Year</option>
        <option value="type">By Type</option>
        <option value="custom">Custom</option>
      </select>
    </div>
  )
}
