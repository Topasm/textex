import { useEffect, useMemo } from 'react'
import type { editor as monacoEditor } from 'monaco-editor'
import type { AiActionDef } from './editorAiActions'
import './SelectionAiToolbar.css'

const TOOLBAR_WIDTH_ESTIMATE = 430
const TOOLBAR_HEIGHT_ESTIMATE = 44
const TOOLBAR_MARGIN = 8

interface SelectionAiToolbarProps {
  editorRef: React.RefObject<monacoEditor.IStandaloneCodeEditor | null>
  selection: monacoEditor.ISelection
  actions: readonly AiActionDef[]
  onAction: (action: AiActionDef) => void
  onClose: () => void
}

interface ToolbarPosition {
  top: number
  left: number
  flipped: boolean
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function getToolbarPosition(
  editor: monacoEditor.IStandaloneCodeEditor,
  selection: monacoEditor.ISelection
): ToolbarPosition | null {
  const editorDom = editor.getDomNode()
  if (!editorDom) return null

  const endPos = editor.getScrolledVisiblePosition({
    lineNumber: selection.endLineNumber,
    column: selection.endColumn
  })
  if (!endPos) return null

  const startPos =
    selection.startLineNumber === selection.endLineNumber
      ? editor.getScrolledVisiblePosition({
          lineNumber: selection.startLineNumber,
          column: selection.startColumn
        })
      : null

  const width = editorDom.clientWidth || editorDom.getBoundingClientRect().width
  const height = editorDom.clientHeight || editorDom.getBoundingClientRect().height
  const anchorLeft =
    startPos && endPos.left >= startPos.left ? startPos.left + (endPos.left - startPos.left) / 2 : endPos.left
  const maxLeft = Math.max(TOOLBAR_MARGIN, width - TOOLBAR_WIDTH_ESTIMATE - TOOLBAR_MARGIN)
  const left = clamp(anchorLeft - TOOLBAR_WIDTH_ESTIMATE / 2, TOOLBAR_MARGIN, maxLeft)
  const belowTop = endPos.top + endPos.height + TOOLBAR_MARGIN
  const flipped = belowTop + TOOLBAR_HEIGHT_ESTIMATE > height - TOOLBAR_MARGIN
  const top = flipped
    ? Math.max(TOOLBAR_MARGIN, endPos.top - TOOLBAR_HEIGHT_ESTIMATE - TOOLBAR_MARGIN)
    : belowTop

  return { top, left, flipped }
}

export function SelectionAiToolbar({
  editorRef,
  selection,
  actions,
  onAction,
  onClose
}: SelectionAiToolbarProps) {
  const position = useMemo(() => {
    const editor = editorRef.current
    if (!editor) return null
    return getToolbarPosition(editor, selection)
  }, [editorRef, selection])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!position) return null

  return (
    <div
      data-testid="selection-ai-toolbar"
      className={`selection-ai-toolbar${position.flipped ? ' flipped' : ''}`}
      style={{ top: position.top, left: position.left }}
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      {actions.map((action, index) => (
        <button
          key={action.id}
          type="button"
          className={`selection-ai-toolbar-btn${index === 0 ? ' is-primary' : ''}`}
          onClick={() => onAction(action)}
        >
          {action.buttonLabel}
        </button>
      ))}
    </div>
  )
}

export { getToolbarPosition }
