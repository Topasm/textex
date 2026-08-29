import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../store/useEditorStore'
import { useProjectStore } from '../store/useProjectStore'
import { useSettingsStore } from '../store/useSettingsStore'
import type { BibEntry } from '../../shared/types'
import { BibPanelHeader } from './bib/BibPanelHeader'
import { BibGroupHeader } from './bib/BibGroupHeader'
import { BibEntryCard } from './bib/BibEntryCard'
import { useCitationGroupOps, groupEntries } from '../hooks/useCitationGroups'
import type { BibGroupMode } from '../hooks/useCitationGroups'
import type { ReferenceDragPayload } from './research/referenceActions'

interface BibPanelProps {
  onAddToChat?: (payload: ReferenceDragPayload) => void
}

function BibPanel({ onAddToChat }: BibPanelProps) {
  const { t } = useTranslation()
  const bibEntries = useProjectStore((s) => s.bibEntries)
  const configuredGroupMode = useSettingsStore((s) => s.settings.bibGroupMode) as BibGroupMode
  const bibGroupMode = configuredGroupMode
  const updateSetting = useSettingsStore((s) => s.updateSetting)
  const filter = useProjectStore((s) => s.researchSearchQuery)
  const setFilter = useProjectStore((s) => s.setResearchSearchQuery)
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
    useEditorStore.getState().requestInsertAtCursor(citeText)
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
        <div className="git-empty">{t('bibPanel.empty')}</div>
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
          customGroupsAvailable
          onGroupModeChange={(mode) => updateSetting('bibGroupMode', mode)}
        />
        <div className="bib-custom-toolbar">
          <button className="bib-new-group-btn" onClick={createGroup}>
            {t('bibPanel.newGroup')}
          </button>
        </div>
        <div
          className="bib-list"
          role="region"
          aria-label={t('bibPanel.projectReferences')}
          tabIndex={0}
        >
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
                      onAddToChat={onAddToChat}
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
                    onAddToChat={onAddToChat}
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
        customGroupsAvailable
        onGroupModeChange={(mode) => updateSetting('bibGroupMode', mode)}
      />
      <div
        className="bib-list"
        role="region"
        aria-label={t('bibPanel.projectReferences')}
        tabIndex={0}
      >
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
                <BibEntryCard
                  key={entry.key}
                  entry={entry}
                  onInsert={handleInsert}
                  onAddToChat={onAddToChat}
                />
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default BibPanel
