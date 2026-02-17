import { useState } from 'react'

interface BibGroupHeaderProps {
  label: string
  count: number
  isCollapsed: boolean
  onToggle: () => void
  /** If provided, enables drag with all citekeys */
  citekeys?: string[]
  /** Custom group features */
  isCustom?: boolean
  onRename?: (newName: string) => void
  onDelete?: () => void
}

export function BibGroupHeader({
  label,
  count,
  isCollapsed,
  onToggle,
  citekeys,
  isCustom,
  onRename,
  onDelete
}: BibGroupHeaderProps) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')

  const handleRenameCommit = () => {
    if (renameValue.trim() && onRename) {
      onRename(renameValue.trim())
    }
    setIsRenaming(false)
  }

  return (
    <div
      className={`bib-group-header${isCustom ? ' bib-custom-group-header' : ''}`}
      onClick={onToggle}
      draggable={!!citekeys}
      onDragStart={(e) => {
        if (citekeys) {
          e.dataTransfer.setData('text/plain', `\\cite{${citekeys.join(',')}}`)
          e.dataTransfer.effectAllowed = 'copy'
        }
      }}
      title={citekeys ? `Drag to insert \\cite{} for all ${count} entries` : undefined}
    >
      <span className="bib-group-chevron">{isCollapsed ? '\u25B8' : '\u25BE'}</span>
      {isRenaming ? (
        <input
          className="bib-rename-input"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={handleRenameCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRenameCommit()
            if (e.key === 'Escape') setIsRenaming(false)
          }}
          onClick={(e) => e.stopPropagation()}
          autoFocus
        />
      ) : (
        <span
          className="bib-group-label"
          onDoubleClick={
            isCustom
              ? (e) => {
                  e.stopPropagation()
                  setIsRenaming(true)
                  setRenameValue(label)
                }
              : undefined
          }
        >
          {label}
        </span>
      )}
      <span className="bib-group-count">({count})</span>
      {isCustom && onDelete && (
        <button
          className="bib-group-delete-btn"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          title="Delete group"
        >
          ×
        </button>
      )}
    </div>
  )
}
