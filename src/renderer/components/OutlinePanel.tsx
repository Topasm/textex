import { useState, useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { DocumentSymbolNode } from '../../shared/types'

type SymbolCategory = 'section' | 'env' | 'math' | 'label' | 'default'

function getSymbolCategory(kind: number): SymbolCategory {
  switch (kind) {
    case 2: // Module (section)
    case 3: // Namespace
      return 'section'
    case 5: // Class (environment)
      return 'env'
    case 6: // Method (equation / math env)
      return 'math'
    case 13: // Variable (label)
    case 14: // Constant
      return 'label'
    case 15: // String
      return 'label'
    default:
      return 'default'
  }
}

function getSymbolIcon(category: SymbolCategory): string {
  switch (category) {
    case 'section':
      return '\u00A7' // §
    case 'env':
      return '\u25A1' // □
    case 'math':
      return '\u0192' // ƒ
    case 'label':
      return '\u2022' // •
    default:
      return '\u00A7'
  }
}

function OutlineNode({
  node,
  depth
}: {
  node: DocumentSymbolNode
  depth: number
}) {
  const [expanded, setExpanded] = useState(true)

  const handleClick = useCallback(() => {
    useAppStore
      .getState()
      .requestJumpToLine(node.selectionRange.startLine, node.selectionRange.startColumn)
  }, [node.selectionRange.startLine, node.selectionRange.startColumn])

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setExpanded((prev) => !prev)
  }, [])

  const hasChildren = node.children.length > 0
  const category = getSymbolCategory(node.kind)

  return (
    <>
      <div
        className={`outline-item outline-depth-${Math.min(depth, 4)}`}
        style={{ paddingLeft: `${10 + depth * 18}px` }}
        onClick={handleClick}
        title={node.detail || undefined}
      >
        {/* Indent guide lines */}
        {depth > 0 &&
          Array.from({ length: depth }).map((_, i) => (
            <span
              key={i}
              className="outline-indent-guide"
              style={{ left: `${10 + i * 18}px` }}
            />
          ))}

        {hasChildren ? (
          <button
            className={`outline-toggle ${expanded ? 'outline-toggle-expanded' : ''}`}
            onClick={handleToggle}
          >
            &#x25B6;
          </button>
        ) : (
          <span className="outline-toggle-spacer" />
        )}
        <span className={`outline-icon outline-icon-${category}`}>
          {getSymbolIcon(category)}
        </span>
        <span className="outline-name">{node.name}</span>
        {node.detail && <span className="outline-detail">{node.detail}</span>}
      </div>
      {hasChildren && expanded && (
        <div className="outline-children">
          {node.children.map((child, i) => (
            <OutlineNode key={`${child.name}-${i}`} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </>
  )
}

function OutlinePanel() {
  const documentSymbols = useAppStore((s) => s.documentSymbols)
  const filePath = useAppStore((s) => s.filePath)

  if (!filePath) {
    return (
      <div className="outline-panel">
        <div className="git-empty">No file open.</div>
      </div>
    )
  }

  if (documentSymbols.length === 0) {
    return (
      <div className="outline-panel">
        <div className="git-empty">No document outline found.</div>
      </div>
    )
  }

  return (
    <div className="outline-panel">
      {documentSymbols.map((sym, i) => (
        <OutlineNode key={`${sym.name}-${i}`} node={sym} depth={0} />
      ))}
    </div>
  )
}

export default OutlinePanel
