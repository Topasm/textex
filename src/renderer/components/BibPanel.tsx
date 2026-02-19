import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/useAppStore'
import type { BibEntry } from '../../shared/types'
import { BibPanelHeader } from './bib/BibPanelHeader'
import { BibGroupHeader } from './bib/BibGroupHeader'
import { BibEntryCard } from './bib/BibEntryCard'
import { useCitationGroupOps, groupEntries } from '../hooks/useCitationGroups'
import type { BibGroupMode } from '../hooks/useCitationGroups'

function BibPanel() {
  const { t } = useTranslation()
  const bibEntries = useAppStore((s) => s.bibEntries)
  const bibGroupMode = useAppStore((s) => s.settings.bibGroupMode) as BibGroupMode
  const updateSetting = useAppStore((s) => s.updateSetting)
  const [filter, setFilter] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const {
    citationGroups,
    createGroup,
    deleteGroup,
    renameGroup,
    addToGroup,
    removeFromGroup,
    assignedKeys
  } = useCitationGroupOps()

  const handleInsert = useCallback((citeText: string) => {
    const state = useAppStore.getState()
    const { content, cursorLine, cursorColumn } = state
    const lines = content.split('\n')
    const lineIdx = cursorLine - 1
    if (lineIdx >= 0 && lineIdx < lines.length) {
      const line = lines[lineIdx]
      const col = cursorColumn - 1
      lines[lineIdx] = line.slice(0, col) + citeText + line.slice(col)
      state.setContent(lines.join('\n'))
    }
  }, [])

  const filtered = useMemo(
    () =>
      bibEntries.filter((e) => {
        if (!filter) return true
        const q = filter.toLowerCase()
        return (
          e.key.toLowerCase().includes(q) ||
          e.title.toLowerCase().includes(q) ||
          e.author.toLowerCase().includes(q)
        )
      }),
    [bibEntries, filter]
  )

  const groups = useMemo(() => groupEntries(filtered, bibGroupMode), [filtered, bibGroupMode])
  const toggle = useCallback(
    (label: string) => setCollapsed((prev) => ({ ...prev, [label]: !prev[label] })),
    []
  )

  const ungroupedEntries = useMemo(
    () => filtered.filter((e) => !assignedKeys.has(e.key)),
    [filtered, assignedKeys]
  )

  const lastGroupId =
    citationGroups.length > 0 ? citationGroups[citationGroups.length - 1].id : null

  if (bibEntries.length === 0) {
    return (
      <div className="bib-panel">
        <div className="git-empty">
          {t('bibPanel.empty')}
        </div>
      </div>
    )
  }

  // ---- Custom groups view ----
  if (bibGroupMode === 'custom') {
    const entryMap = new Map(filtered.map((e) => [e.key, e]))

    return (
      <div className="bib-panel">
        <BibPanelHeader
          filter={filter}
          onFilterChange={setFilter}
          groupMode={bibGroupMode}
          onGroupModeChange={(mode) => updateSetting('bibGroupMode', mode)}
        />
        <div className="bib-custom-toolbar">
          <button className="bib-new-group-btn" onClick={createGroup}>
            {t('bibPanel.newGroup')}
          </button>
        </div>
        <div className="bib-list">
          {citationGroups.map((group) => {
            const groupEntries = group.citekeys
              .map((k) => entryMap.get(k))
              .filter((e): e is BibEntry => e !== undefined)

            return (
              <div key={group.id} className="bib-group">
                <BibGroupHeader
                  label={group.name}
                  count={groupEntries.length}
                  isCollapsed={!!collapsed[group.id]}
                  onToggle={() => toggle(group.id)}
                  citekeys={group.citekeys}
                  isCustom
                  onRename={(name) => renameGroup(group.id, name)}
                  onDelete={() => deleteGroup(group.id)}
                />
                {!collapsed[group.id] &&
                  groupEntries.map((entry) => (
                    <BibEntryCard
                      key={entry.key}
                      entry={entry}
                      onInsert={handleInsert}
                      onRemove={() => removeFromGroup(group.id, entry.key)}
                    />
                  ))}
              </div>
            )
          })}

          {ungroupedEntries.length > 0 && (
            <div className="bib-group">
              <BibGroupHeader
                label={t('bibPanel.ungrouped')}
                count={ungroupedEntries.length}
                isCollapsed={!!collapsed['__ungrouped__']}
                onToggle={() => toggle('__ungrouped__')}
              />
              {!collapsed['__ungrouped__'] &&
                ungroupedEntries.map((entry) => (
                  <BibEntryCard
                    key={entry.key}
                    entry={entry}
                    onInsert={handleInsert}
                    onAdd={lastGroupId ? () => addToGroup(lastGroupId, entry.key) : undefined}
                    addTitle={`Add to "${citationGroups[citationGroups.length - 1]?.name}"`}
                  />
                ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ---- Standard (flat / author / year / type) view ----
  return (
    <div className="bib-panel">
      <BibPanelHeader
        filter={filter}
        onFilterChange={setFilter}
        groupMode={bibGroupMode}
        onGroupModeChange={(mode) => updateSetting('bibGroupMode', mode)}
      />
      <div className="bib-list">
        {groups.map((group) => (
          <div key={group.label || '__flat__'} className="bib-group">
            {bibGroupMode !== 'flat' && (
              <BibGroupHeader
                label={group.label}
                count={group.entries.length}
                isCollapsed={!!collapsed[group.label]}
                onToggle={() => toggle(group.label)}
                citekeys={group.entries.map((e) => e.key)}
              />
            )}
            {!collapsed[group.label] &&
              group.entries.map((entry) => (
                <BibEntryCard key={entry.key} entry={entry} onInsert={handleInsert} />
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default BibPanel
