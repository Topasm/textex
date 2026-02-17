import { useState, useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'

function getSymbolIcon(kind: number): string {
  // LSP SymbolKind: 2=Module, 3=Namespace, 5=Class, 6=Method, 13=Variable, 15=String
  switch (kind) {
    case 2:
    case 3:
      return '\u00A7' // section sign for sections
    case 5:
      return '\u25A1' // square for environments/classes
    case 13:
    case 14:
      return '\u2022' // bullet for variables/constants (labels)
    case 15:
      return '\u201C' // left double quote for strings
    default:
      return '\u00A7'
  }
}

function StructureNode({
  node,
  depth
}: {
  node: DocumentSymbolNode
  depth: number
}): JSX.Element {
  const [expanded, setExpanded] = useState(true)

  const handleClick = useCallback(() => {
    useAppStore.getState().requestJumpToLine(node.selectionRange.startLine, node.selectionRange.startColumn)
  }, [node.selectionRange.startLine, node.selectionRange.startColumn])

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setExpanded((prev) => !prev)
    },
    []
  )

  const hasChildren = node.children.length > 0

  return (
    <>
      <div
        className="structure-item"
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={handleClick}
      >
        {hasChildren ? (
          <button className="structure-toggle" onClick={handleToggle}>
            {expanded ? '\u25BC' : '\u25B6'}
          </button>
        ) : (
          <span className="structure-toggle-spacer" />
        )}
        <span className="structure-icon">{getSymbolIcon(node.kind)}</span>
        <span className="structure-name">{node.name}</span>
        {node.detail && <span className="structure-detail">{node.detail}</span>}
      </div>
      {hasChildren &&
        expanded &&
        node.children.map((child, i) => (
          <StructureNode key={`${child.name}-${i}`} node={child} depth={depth + 1} />
        ))}
    </>
  )
}

function StructurePanel(): JSX.Element {
  const documentSymbols = useAppStore((s) => s.documentSymbols)
  const filePath = useAppStore((s) => s.filePath)
  const lspStatus = useAppStore((s) => s.lspStatus)

  if (!filePath) {
    return (
      <div className="structure-panel">
        <div className="git-empty">No file open.</div>
      </div>
    )
  }

  if (lspStatus !== 'running') {
    return (
      <div className="structure-panel">
        <div className="git-empty">LSP not running.</div>
      </div>
    )
  }

  if (documentSymbols.length === 0) {
    return (
      <div className="structure-panel">
        <div className="git-empty">No document symbols found.</div>
      </div>
    )
  }

  return (
    <div className="structure-panel">
      {documentSymbols.map((sym, i) => (
        <StructureNode key={`${sym.name}-${i}`} node={sym} depth={0} />
      ))}
    </div>
  )
}

export default StructurePanel
