import React, { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Box,
  ChevronRight,
  Diamond,
  FileCog,
  Hash,
  Heading1,
  Heading2,
  Heading3,
  Image,
  List,
  Rows3,
  Sigma,
  Table2,
  Workflow,
  type LucideIcon
} from 'lucide-react'
import { useEditorStore } from '../store/useEditorStore'
import { useUiStore } from '../store/useUiStore'
import { useSettingsStore } from '../store/useSettingsStore'
import type { DocumentSymbolNode } from '../../shared/types'
import { ICON_SIZE } from './ui/IconSystem'

type SymbolCategory =
  | 'frontmatter'
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

function isBandSymbol(node: DocumentSymbolNode): boolean {
  return node.semanticKind === 'section' || node.semanticKind === 'frontmatter'
}

function getSymbolCategory(node: DocumentSymbolNode, depth: number): SymbolCategory {
  if (node.semanticKind === 'frontmatter') return 'frontmatter'

  const { kind, name } = node
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

const SYMBOL_ICONS: Record<SymbolCategory, LucideIcon> = {
  frontmatter: FileCog,
  section: Heading1,
  subsection: Heading2,
  subsubsection: Heading3,
  figure: Image,
  table: Table2,
  list: List,
  equation: Sigma,
  algorithm: Workflow,
  env: Box,
  math: Sigma,
  label: Hash,
  default: Diamond
}

function SymbolIcon({ category }: { category: SymbolCategory }) {
  const Icon = SYMBOL_ICONS[category]
  return <Icon size={ICON_SIZE.compact} />
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
  const { t } = useTranslation()
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
  const category = getSymbolCategory(node, depth)

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
            type="button"
            className={`outline-toggle ${expanded ? 'outline-toggle-expanded' : ''}`}
            onClick={handleToggle}
            title={expanded ? t('fileTree.collapseFolder') : t('fileTree.expandFolder')}
            aria-label={expanded ? t('fileTree.collapseFolder') : t('fileTree.expandFolder')}
            aria-expanded={expanded}
          >
            <ChevronRight size={ICON_SIZE.micro} />
          </button>
        ) : (
          <span className="outline-toggle-spacer" />
        )}
        <span
          className={`outline-icon outline-icon-${category}`}
          style={bandColor ? { color: bandColor } : undefined}
        >
          <SymbolIcon category={category} />
        </span>
        <span className="outline-name">{node.name}</span>
        {node.detail && <span className="outline-detail">{node.detail}</span>}
      </div>
      {hasChildren && expanded && (
        <div className="outline-children">
          {node.children.map((child, i) => (
            <OutlineNode
              key={`${child.name}-${i}`}
              node={child}
              depth={depth + 1}
              bandColor={bandColor}
            />
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
            type="button"
            className={`outline-highlight-toggle${sectionHighlightEnabled ? ' active' : ''}`}
            onClick={toggleHighlight}
            title={
              sectionHighlightEnabled ? t('outlinePanel.hideBands') : t('outlinePanel.showBands')
            }
          >
            <Rows3 size={ICON_SIZE.compact} /> {t('outlinePanel.bands')}
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
          type="button"
          className={`outline-highlight-toggle${sectionHighlightEnabled ? ' active' : ''}`}
          onClick={toggleHighlight}
          title={
            sectionHighlightEnabled ? t('outlinePanel.hideBands') : t('outlinePanel.showBands')
          }
        >
          <Rows3 size={ICON_SIZE.compact} /> {t('outlinePanel.bands')}
        </button>
      </div>
      {documentSymbols.map((sym, i) => {
        const isSection = isBandSymbol(sym)
        let sectionColor: string | undefined
        if (sectionHighlightEnabled && isSection) {
          const sectionIndex = documentSymbols.slice(0, i).filter(isBandSymbol).length
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
