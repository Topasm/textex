import React, { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../store/useEditorStore'
import { useUiStore } from '../store/useUiStore'
import { useSettingsStore } from '../store/useSettingsStore'
import type { DocumentSymbolNode } from '../../shared/types'

type SymbolCategory =
  | 'section'
  | 'subsection'
  | 'subsubsection'
  | 'figure'
  | 'table'
  | 'list'
  | 'equation'
  | 'algorithm'
  | 'env'
  | 'math'
  | 'label'
  | 'default'

function getSymbolCategory(kind: number, name: string, depth: number): SymbolCategory {
  switch (kind) {
    case 2: // Module (section)
    case 3: // Namespace
      if (depth >= 2) return 'subsubsection'
      if (depth === 1) return 'subsection'
      return 'section'
    case 5: {
      // Class (environment)
      const n = name.toLowerCase()
      if (/^(figure\*?|wrapfigure|subfigure|graphic)$/.test(n)) return 'figure'
      if (/^(table\*?|tabular x?|tabularx|longtable)$/.test(n)) return 'table'
      if (/^(itemize|enumerate|description|list)$/.test(n)) return 'list'
      if (/^(equation|align|gather|multline|eqnarray|displaymath|flalign)\*?$/.test(n))
        return 'equation'
      if (/^(algorithm|algorithm2e|algorithmic|lstlisting|verbatim|minted)$/.test(n))
        return 'algorithm'
      return 'env'
    }
    case 6: // Method (equation / math env)
      return 'equation'
    case 13: // Variable (label)
    case 14: // Constant
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
    case 'subsection':
      return '\u00B6' // ¶
    case 'subsubsection':
      return '\u22B3' // ⊳
    case 'figure':
      return '\u25A3' // ▣
    case 'table':
      return '\u25A6' // ▦
    case 'list':
      return '\u25A4' // ▤
    case 'equation':
      return '\u2211' // ∑
    case 'algorithm':
      return '\u25B7' // ▷
    case 'env':
      return '\u25A1' // □
    case 'math':
      return '\u2211' // ∑
    case 'label':
      return '#'
    default:
      return '\u25C7' // ◇
  }
}

const DEFAULT_COLORS = ['#e06c75', '#e5c07b', '#98c379', '#61afef', '#c678dd', '#56b6c2', '#d19a66']

const OutlineNode = React.memo(function OutlineNode({
  node,
  depth,
  bandColor
}: {
  node: DocumentSymbolNode
  depth: number
  bandColor?: string
}) {
  const [expanded, setExpanded] = useState(true)

  const handleClick = useCallback(() => {
    useEditorStore
      .getState()
      .requestJumpToLine(node.selectionRange.startLine, node.selectionRange.startColumn)
  }, [node.selectionRange.startLine, node.selectionRange.startColumn])

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setExpanded((prev) => !prev)
  }, [])

  const hasChildren = node.children.length > 0
  const category = getSymbolCategory(node.kind, node.name, depth)

  return (
    <>
      <div
        className={`outline-item outline-depth-${Math.min(depth, 4)}`}
        style={{
          paddingLeft: `${10 + depth * 18}px`,
          borderLeftColor: bandColor || undefined
        }}
        onClick={handleClick}
        title={node.detail || undefined}
      >
        {/* Indent guide lines */}
        {depth > 0 &&
          Array.from({ length: depth }).map((_, i) => (
            <span key={i} className="outline-indent-guide" style={{ left: `${10 + i * 18}px` }} />
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
        <span className={`outline-icon outline-icon-${category}`} style={bandColor ? { color: bandColor } : undefined}>{getSymbolIcon(category)}</span>
        <span className="outline-name">{node.name}</span>
        {node.detail && <span className="outline-detail">{node.detail}</span>}
      </div>
      {hasChildren && expanded && (
        <div className="outline-children">
          {node.children.map((child, i) => (
            <OutlineNode key={`${child.name}-${i}`} node={child} depth={depth + 1} bandColor={bandColor} />
          ))}
        </div>
      )}
    </>
  )
})

function OutlinePanel() {
  const { t } = useTranslation()
  const documentSymbols = useUiStore((s) => s.documentSymbols)
  const filePath = useEditorStore((s) => s.filePath)
  const sectionHighlightEnabled = useSettingsStore((s) => s.settings.sectionHighlightEnabled)
  const colors = useSettingsStore((s) => s.settings.sectionHighlightColors) ?? DEFAULT_COLORS

  const toggleHighlight = useCallback(() => {
    useSettingsStore.getState().updateSetting('sectionHighlightEnabled', !sectionHighlightEnabled)
  }, [sectionHighlightEnabled])

  if (!filePath) {
    return (
      <div className="outline-panel">
        <div className="git-empty">{t('outlinePanel.noFile')}</div>
      </div>
    )
  }

  if (documentSymbols.length === 0) {
    return (
      <div className="outline-panel">
        <div className="outline-panel-header">
          <button
            className={`outline-highlight-toggle${sectionHighlightEnabled ? ' active' : ''}`}
            onClick={toggleHighlight}
            title={
              sectionHighlightEnabled
                ? t('outlinePanel.hideBands')
                : t('outlinePanel.showBands')
            }
          >
            {'\u2261'} {t('outlinePanel.bands')}
          </button>
        </div>
        <div className="git-empty">{t('outlinePanel.noOutline')}</div>
      </div>
    )
  }

  return (
    <div className="outline-panel">
      <div className="outline-panel-header">
        <button
          className={`outline-highlight-toggle${sectionHighlightEnabled ? ' active' : ''}`}
          onClick={toggleHighlight}
          title={
            sectionHighlightEnabled
              ? t('outlinePanel.hideBands')
              : t('outlinePanel.showBands')
          }
        >
          {'\u2261'} {t('outlinePanel.bands')}
        </button>
      </div>
      {documentSymbols.map((sym, i) => {
        const isSection = sym.kind === 2 || sym.kind === 3
        let sectionColor: string | undefined
        if (sectionHighlightEnabled && isSection) {
          const sectionIndex = documentSymbols
            .slice(0, i)
            .filter((s) => s.kind === 2 || s.kind === 3).length
          sectionColor = colors[sectionIndex % colors.length]
        }
        return (
          <OutlineNode key={`${sym.name}-${i}`} node={sym} depth={0} bandColor={sectionColor} />
        )
      })}
    </div>
  )
}

export default OutlinePanel
