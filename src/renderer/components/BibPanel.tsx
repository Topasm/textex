import { useState, useCallback, useMemo } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { BibEntry, CitationGroup } from '../types/api'

type BibGroupMode = 'flat' | 'author' | 'year' | 'type' | 'custom'

interface GroupedBib {
  label: string
  entries: BibEntry[]
}

function extractGroupKey(entry: BibEntry, mode: BibGroupMode): string {
  switch (mode) {
    case 'author': {
      const author = entry.author?.split(/\band\b/i)[0]?.trim() ?? 'Unknown'
      // Handle "Last, First" format — take the surname
      return author.split(',')[0]?.trim() || author
    }
    case 'year':
      return entry.year || 'Unknown'
    case 'type':
      return entry.type || 'misc'
    default:
      return ''
  }
}

function groupEntries(entries: BibEntry[], mode: BibGroupMode): GroupedBib[] {
  if (mode === 'flat' || mode === 'custom') {
    return [{ label: '', entries }]
  }

  const buckets: Record<string, BibEntry[]> = {}
  for (const entry of entries) {
    const key = extractGroupKey(entry, mode)
    ;(buckets[key] ??= []).push(entry)
  }

  return Object.entries(buckets)
    .map(([label, entries]) => ({ label, entries }))
    .sort((a, b) => b.entries.length - a.entries.length)
}

function BibPanel() {
  const bibEntries = useAppStore((s) => s.bibEntries)
  const bibGroupMode = useAppStore((s) => s.settings.bibGroupMode)
  const updateSetting = useAppStore((s) => s.updateSetting)
  const citationGroups = useAppStore((s) => s.citationGroups)
  const setCitationGroups = useAppStore((s) => s.setCitationGroups)
  const projectRoot = useAppStore((s) => s.projectRoot)
  const [filter, setFilter] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

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

  // ---- Custom group helpers ----

  const saveGroups = useCallback(
    (groups: CitationGroup[]) => {
      setCitationGroups(groups)
      if (projectRoot) {
        window.api.saveCitationGroups(projectRoot, groups).catch(() => {})
      }
    },
    [setCitationGroups, projectRoot]
  )

  const handleCreateGroup = useCallback(() => {
    const name = prompt('Group name:')
    if (!name?.trim()) return
    const newGroup: CitationGroup = {
      id: crypto.randomUUID(),
      name: name.trim(),
      citekeys: []
    }
    saveGroups([...citationGroups, newGroup])
  }, [citationGroups, saveGroups])

  const handleDeleteGroup = useCallback(
    (groupId: string) => {
      saveGroups(citationGroups.filter((g) => g.id !== groupId))
    },
    [citationGroups, saveGroups]
  )

  const handleRenameCommit = useCallback(
    (groupId: string) => {
      if (!renameValue.trim()) {
        setRenamingGroupId(null)
        return
      }
      saveGroups(
        citationGroups.map((g) => (g.id === groupId ? { ...g, name: renameValue.trim() } : g))
      )
      setRenamingGroupId(null)
    },
    [citationGroups, renameValue, saveGroups]
  )

  const handleAddToGroup = useCallback(
    (groupId: string, citekey: string) => {
      saveGroups(
        citationGroups.map((g) =>
          g.id === groupId && !g.citekeys.includes(citekey)
            ? { ...g, citekeys: [...g.citekeys, citekey] }
            : g
        )
      )
    },
    [citationGroups, saveGroups]
  )

  const handleRemoveFromGroup = useCallback(
    (groupId: string, citekey: string) => {
      saveGroups(
        citationGroups.map((g) =>
          g.id === groupId ? { ...g, citekeys: g.citekeys.filter((k) => k !== citekey) } : g
        )
      )
    },
    [citationGroups, saveGroups]
  )

  // Keys assigned to any custom group
  const assignedKeys = useMemo(() => {
    const set = new Set<string>()
    for (const g of citationGroups) {
      for (const k of g.citekeys) set.add(k)
    }
    return set
  }, [citationGroups])

  // Ungrouped entries (filtered, not in any custom group)
  const ungroupedEntries = useMemo(
    () => filtered.filter((e) => !assignedKeys.has(e.key)),
    [filtered, assignedKeys]
  )

  // Most recently created group (for the [+] button on ungrouped entries)
  const lastGroupId = citationGroups.length > 0 ? citationGroups[citationGroups.length - 1].id : null

  if (bibEntries.length === 0) {
    return (
      <div className="bib-panel">
        <div className="git-empty">No bibliography entries found. Open a project with .bib files.</div>
      </div>
    )
  }

  // ---- Custom groups view ----
  if (bibGroupMode === 'custom') {
    // Build a lookup from citekey → BibEntry for quick access
    const entryMap = new Map(filtered.map((e) => [e.key, e]))

    return (
      <div className="bib-panel">
        <div className="bib-panel-header">
          <input
            type="text"
            placeholder="Filter citations..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <select
            value={bibGroupMode}
            onChange={(e) => updateSetting('bibGroupMode', e.target.value as BibGroupMode)}
            title="Group citations by"
          >
            <option value="flat">Flat</option>
            <option value="author">By Author</option>
            <option value="year">By Year</option>
            <option value="type">By Type</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        <div className="bib-custom-toolbar">
          <button className="bib-new-group-btn" onClick={handleCreateGroup}>
            + New Group
          </button>
        </div>

        <div className="bib-list">
          {citationGroups.map((group) => {
            const groupEntries = group.citekeys
              .map((k) => entryMap.get(k))
              .filter((e): e is BibEntry => e !== undefined)
            const isCollapsed = collapsed[group.id]

            return (
              <div key={group.id} className="bib-group">
                <div
                  className="bib-group-header bib-custom-group-header"
                  onClick={() => toggle(group.id)}
                  draggable
                  onDragStart={(e) => {
                    const keys = group.citekeys.join(',')
                    e.dataTransfer.setData('text/plain', `\\cite{${keys}}`)
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  title={`Drag to insert \\cite{} for all ${group.citekeys.length} entries`}
                >
                  <span className="bib-group-chevron">
                    {isCollapsed ? '\u25B8' : '\u25BE'}
                  </span>
                  {renamingGroupId === group.id ? (
                    <input
                      className="bib-rename-input"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => handleRenameCommit(group.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameCommit(group.id)
                        if (e.key === 'Escape') setRenamingGroupId(null)
                      }}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                    />
                  ) : (
                    <span
                      className="bib-group-label"
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        setRenamingGroupId(group.id)
                        setRenameValue(group.name)
                      }}
                    >
                      {group.name}
                    </span>
                  )}
                  <span className="bib-group-count">({groupEntries.length})</span>
                  <button
                    className="bib-group-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteGroup(group.id)
                    }}
                    title="Delete group"
                  >
                    ×
                  </button>
                </div>

                {!isCollapsed &&
                  groupEntries.map((entry) => {
                    const cleanTitle = (entry.title || '(no title)').replace(/[{}]/g, '')
                    let authors = entry.author || 'Unknown Author'
                    if (authors.length > 50) authors = authors.slice(0, 50) + '...'

                    return (
                      <div
                        key={entry.key}
                        className="bib-entry"
                        onClick={() => handleInsert(`\\cite{${entry.key}}`)}
                        title={`Insert \\cite{${entry.key}}`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', `\\cite{${entry.key}}`)
                          e.dataTransfer.effectAllowed = 'copy'
                        }}
                        style={{ cursor: 'grab' }}
                      >
                        <div className="bib-entry-header">
                          <span className="bib-title">{cleanTitle}</span>
                          <button
                            className="bib-entry-action-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRemoveFromGroup(group.id, entry.key)
                            }}
                            title="Remove from group"
                          >
                            ×
                          </button>
                        </div>
                        <div className="bib-authors">{authors}</div>
                        <div className="bib-meta-row">
                          <span className="bib-key">@{entry.key}</span>
                          {entry.year && <span className="bib-year">{entry.year}</span>}
                        </div>
                      </div>
                    )
                  })}
              </div>
            )
          })}

          {/* Ungrouped section */}
          {ungroupedEntries.length > 0 && (
            <div className="bib-group">
              <div
                className="bib-group-header bib-ungrouped-header"
                onClick={() => toggle('__ungrouped__')}
              >
                <span className="bib-group-chevron">
                  {collapsed['__ungrouped__'] ? '\u25B8' : '\u25BE'}
                </span>
                <span className="bib-group-label">Ungrouped</span>
                <span className="bib-group-count">({ungroupedEntries.length})</span>
              </div>

              {!collapsed['__ungrouped__'] &&
                ungroupedEntries.map((entry) => {
                  const cleanTitle = (entry.title || '(no title)').replace(/[{}]/g, '')
                  let authors = entry.author || 'Unknown Author'
                  if (authors.length > 50) authors = authors.slice(0, 50) + '...'

                  return (
                    <div
                      key={entry.key}
                      className="bib-entry"
                      onClick={() => handleInsert(`\\cite{${entry.key}}`)}
                      title={`Insert \\cite{${entry.key}}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', `\\cite{${entry.key}}`)
                        e.dataTransfer.effectAllowed = 'copy'
                      }}
                      style={{ cursor: 'grab' }}
                    >
                      <div className="bib-entry-header">
                        <span className="bib-title">{cleanTitle}</span>
                        {lastGroupId && (
                          <button
                            className="bib-entry-action-btn bib-entry-add-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleAddToGroup(lastGroupId, entry.key)
                            }}
                            title={`Add to "${citationGroups[citationGroups.length - 1]?.name}"`}
                          >
                            +
                          </button>
                        )}
                      </div>
                      <div className="bib-authors">{authors}</div>
                      <div className="bib-meta-row">
                        <span className="bib-key">@{entry.key}</span>
                        {entry.year && <span className="bib-year">{entry.year}</span>}
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ---- Standard (flat / author / year / type) view ----
  return (
    <div className="bib-panel">
      <div className="bib-panel-header">
        <input
          type="text"
          placeholder="Filter citations..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select
          value={bibGroupMode}
          onChange={(e) => updateSetting('bibGroupMode', e.target.value as BibGroupMode)}
          title="Group citations by"
        >
          <option value="flat">Flat</option>
          <option value="author">By Author</option>
          <option value="year">By Year</option>
          <option value="type">By Type</option>
          <option value="custom">Custom</option>
        </select>
      </div>

      <div className="bib-list">
        {groups.map((group) => (
          <div key={group.label || '__flat__'} className="bib-group">
            {bibGroupMode !== 'flat' && (
              <div
                className="bib-group-header"
                onClick={() => toggle(group.label)}
                draggable
                onDragStart={(e) => {
                  const keys = group.entries.map((entry) => entry.key).join(',')
                  e.dataTransfer.setData('text/plain', `\\cite{${keys}}`)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                title={`Drag to insert \\cite{} for all ${group.entries.length} entries`}
              >
                <span className="bib-group-chevron">
                  {collapsed[group.label] ? '\u25B8' : '\u25BE'}
                </span>
                <span className="bib-group-label">{group.label}</span>
                <span className="bib-group-count">({group.entries.length})</span>
              </div>
            )}

            {!collapsed[group.label] &&
              group.entries.map((entry) => {
                const cleanTitle = (entry.title || '(no title)').replace(/[{}]/g, '')
                let authors = entry.author || 'Unknown Author'
                if (authors.length > 50) {
                  authors = authors.slice(0, 50) + '...'
                }

                return (
                  <div
                    key={entry.key}
                    className="bib-entry"
                    onClick={() => handleInsert(`\\cite{${entry.key}}`)}
                    title={`Insert \\cite{${entry.key}}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', `\\cite{${entry.key}}`)
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    style={{ cursor: 'grab' }}
                  >
                    <div className="bib-entry-header">
                      <span className="bib-title">{cleanTitle}</span>
                    </div>
                    <div className="bib-authors">{authors}</div>
                    <div className="bib-meta-row">
                      <span className="bib-key">@{entry.key}</span>
                      {entry.year && <span className="bib-year">{entry.year}</span>}
                    </div>
                  </div>
                )
              })}
          </div>
        ))}
      </div>
    </div>
  )
}

export default BibPanel
