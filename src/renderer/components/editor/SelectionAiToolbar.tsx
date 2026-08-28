import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { editor as monacoEditor, Selection } from 'monaco-editor'
import type { AiActionDef } from './editorAiActions'
import type { AiContextStatus } from '../../services/aiContext'
import './SelectionAiToolbar.css'

const TOOLBAR_WIDTH_ESTIMATE = 430
const TOOLBAR_HEIGHT_ESTIMATE = 132
const TOOLBAR_MARGIN = 8

interface SelectionAiToolbarProps {
  editorRef: React.RefObject<monacoEditor.IStandaloneCodeEditor | null>
  selection: Selection
  actions: readonly AiActionDef[]
  onAction: (action: AiActionDef) => void
  onCommand: (command: string) => void
  onUpdateContext: () => void
  onAskChat?: () => void
  onFindSources?: () => void
  researchActionsDisabled?: boolean
  contextStatus: AiContextStatus
  isUpdatingContext: boolean
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
  selection: Selection
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
    startPos && endPos.left >= startPos.left
      ? startPos.left + (endPos.left - startPos.left) / 2
      : endPos.left
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
  onCommand,
  onUpdateContext,
  onAskChat,
  onFindSources,
  researchActionsDisabled = false,
  contextStatus,
  isUpdatingContext,
  onClose
}: SelectionAiToolbarProps) {
  const { t } = useTranslation()
  const [command, setCommand] = useState('')
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

  const contextButtonLabel =
    contextStatus === 'fresh'
      ? t('selectionAi.contextFresh')
      : contextStatus === 'stale'
        ? t('selectionAi.contextStale')
        : t('selectionAi.contextUpdate')

  const submitCommand = () => {
    const trimmed = command.trim()
    if (!trimmed) return
    onCommand(trimmed)
    setCommand('')
  }

  return (
    <div
      data-testid="selection-ai-toolbar"
      className={`selection-ai-toolbar${position.flipped ? ' flipped' : ''}`}
      style={{ top: position.top, left: position.left }}
      onMouseDown={(e) => {
        e.stopPropagation()
      }}
    >
      <div className="selection-ai-toolbar-context-row">
        {onAskChat && (
          <button
            type="button"
            className="selection-ai-toolbar-research-btn"
            onClick={onAskChat}
            disabled={researchActionsDisabled}
          >
            {t('selectionAi.askChat')}
          </button>
        )}
        {onFindSources && (
          <button
            type="button"
            className="selection-ai-toolbar-research-btn"
            onClick={onFindSources}
            disabled={researchActionsDisabled}
          >
            {t('selectionAi.findSources')}
          </button>
        )}
        <button
          type="button"
          className={`selection-ai-toolbar-context-btn status-${contextStatus}`}
          onClick={onUpdateContext}
          disabled={isUpdatingContext}
        >
          {isUpdatingContext && (
            <span className="selection-ai-toolbar-spinner" aria-hidden="true" />
          )}
          <span>{isUpdatingContext ? t('selectionAi.updatingContext') : contextButtonLabel}</span>
        </button>
      </div>
      <div className="selection-ai-toolbar-command-row">
        <input
          className="selection-ai-toolbar-command-input"
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder={t('selectionAi.commandPlaceholder')}
          aria-label={t('selectionAi.commandLabel')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submitCommand()
            }
          }}
        />
        <button
          type="button"
          className="selection-ai-toolbar-submit"
          onClick={submitCommand}
          disabled={!command.trim()}
        >
          Apply
        </button>
      </div>
      <div className="selection-ai-toolbar-actions-row">
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
    </div>
  )
}

export { getToolbarPosition }
