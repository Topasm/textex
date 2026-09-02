import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../store/useEditorStore'
import { useProjectStore } from '../store/useProjectStore'
import type { BibEntry } from '../../shared/types'
import { BibPanelHeader } from './bib/BibPanelHeader'
import { BibGroupHeader } from './bib/BibGroupHeader'
import { BibEntryCard } from './bib/BibEntryCard'
import { useCitationGroupOps } from '../hooks/useCitationGroups'
import type { ReferenceDragPayload } from './research/referenceActions'

interface BibPanelProps {
  onAddToChat?: (payload: ReferenceDragPayload) => void
}

/**
 * Citation groups: named sets of project references that can be cited together.
 *
 * This panel used to offer flat/author/year/type views of the whole
 * bibliography as well, which is what the References list already shows — same
 * entries, one sorted list, plus Zotero linkage and health. Groups are the one
 * thing References cannot express, so this panel does only that.
 */
function BibPanel({ onAddToChat }: BibPanelProps) {
  const { t } = useTranslation()
  const bibEntries = useProjectStore((s) => s.bibEntries)
  // A local filter: the References list has its own search box, and sharing one
  // store field made a query typed in one panel appear in the other.
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
    useEditorStore.getState().requestInsertAtCursor(citeText)
  }, [])

  const filtered = useMemo(
    () =>
      bibEntries.filter((entry) => {
        if (!filter) return true
        const needle = filter.toLowerCase()
        return (
          entry.key.toLowerCase().includes(needle) ||
          entry.title.toLowerCase().includes(needle) ||
          entry.author.toLowerCase().includes(needle)
        )
      }),
    [bibEntries, filter]
  )

  const toggle = useCallback(
    (label: string) => setCollapsed((prev) => ({ ...prev, [label]: !prev[label] })),
    []
  )

  const ungroupedEntries = useMemo(
    () => filtered.filter((entry) => !assignedKeys.has(entry.key)),
    [filtered, assignedKeys]
  )

  if (bibEntries.length === 0) {
    return (
      <div className="bib-panel">
        <div className="panel-empty">{t('bibPanel.empty')}</div>
      </div>
    )
  }

  const entryMap = new Map(filtered.map((entry) => [entry.key, entry]))

  return (
    <div className="bib-panel">
      <BibPanelHeader filter={filter} onFilterChange={setFilter} onCreateGroup={createGroup} />
      <div
        className="bib-list"
        role="region"
        aria-label={t('bibPanel.projectReferences')}
        tabIndex={0}
      >
        {citationGroups.length === 0 && <p className="panel-empty">{t('bibPanel.noGroups')}</p>}
        {citationGroups.map((group) => {
          const entries = group.citekeys
            .map((key) => entryMap.get(key))
            .filter((entry): entry is BibEntry => entry !== undefined)

          return (
            <div key={group.id} className="bib-group">
              <BibGroupHeader
                label={group.name}
                count={entries.length}
                isCollapsed={!!collapsed[group.id]}
                onToggle={() => toggle(group.id)}
                citekeys={group.citekeys}
                isCustom
                onRename={(name) => renameGroup(group.id, name)}
                onDelete={() => deleteGroup(group.id)}
              />
              {!collapsed[group.id] &&
                entries.map((entry) => (
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
                  // Every group is offered, so filing an entry no longer means
                  // guessing which one "add" would pick.
                  groups={citationGroups.map((group) => ({ id: group.id, name: group.name }))}
                  onAddToGroup={(groupId) => addToGroup(groupId, entry.key)}
                  onAddToChat={onAddToChat}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default BibPanel
