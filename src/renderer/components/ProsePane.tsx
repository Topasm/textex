import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bold, Code2, FileCode2, FileText, Italic } from 'lucide-react'
import { documentRegistry } from '../models/documentRegistry'
import { useEditorStore } from '../store/useEditorStore'
import { isEditableProseBlock, projectLatexToProse } from '../../shared/proseProjection'
import {
  proseDocumentEdits,
  proseDocumentText,
  spanAtMarkdownLine,
  spanAtSourceLine
} from '../../shared/proseDocument'
import type { ProseRefusal } from '../../shared/proseDocument'
import { proseAnchorFor, useUiStore } from '../store/useUiStore'
import { PROSE_COMMIT_DELAY_MS } from '../constants'
import { registerPendingDocumentEditFlusher } from '../services/pendingDocumentEdits'
import {
  editMarkdownSelection,
  isMarkdownSelectionFormatted,
  proseDocumentStats,
  textareaVisibleLine,
  type MarkdownInlineFormat
} from '../utils/proseEditor'
import { ICON_SIZE } from './ui/IconSystem'
import './ProsePane.css'

/**
 * The document's prose as one editable Markdown source.
 *
 * There is no second file. The Markdown is projected from the `.tex` the editor
 * already holds, and an edit is attributed back to the blocks it touched, so
 * only those are rewritten. The preamble, labels, comments and every LaTeX
 * construct the projection does not model stay exactly as they were.
 */
export function ProsePane() {
  const { t } = useTranslation()
  const filePath = useEditorStore((state) => state.filePath)
  const revision = useEditorStore((state) => state.revision)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const scrollFrameRef = useRef<number | null>(null)
  const suppressScrollUntilRef = useRef(0)
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null)
  const [refusal, setRefusal] = useState<ProseRefusal | null>(null)
  const [selection, setSelection] = useState({ start: 0, end: 0 })
  const proseAnchor = useUiStore((state) => proseAnchorFor(state, filePath))

  const projection = useMemo(() => {
    // The store's revision is the signal that the buffer changed; the text
    // itself is read from the registry.
    void revision
    if (!filePath) return null
    const snapshot = documentRegistry.snapshot(filePath)
    if (!snapshot) return null
    const document = projectLatexToProse(snapshot.text)
    if (!document.hasBody) return { hasBody: false as const }
    return {
      hasBody: true as const,
      text: proseDocumentText(document),
      revision: snapshot.revision
    }
  }, [filePath, revision])

  const projected = projection?.hasBody ? projection.text.markdown : ''
  const [draft, setDraft] = useState(projected)
  const committed = useRef(projected)
  const stats = useMemo(() => proseDocumentStats(draft), [draft])
  const activeMarkdownLine = useMemo(
    () => draft.slice(0, selection.start).split('\n').length,
    [draft, selection.start]
  )
  const activeSpan =
    projection?.hasBody === true ? spanAtMarkdownLine(projection.text, activeMarkdownLine) : null
  const formattingDisabled = Boolean(activeSpan && !isEditableProseBlock(activeSpan.block))
  const syncState = refusal ? 'blocked' : draft === projected ? 'synced' : 'syncing'

  // A reprojection after somebody else's edit must not clobber live typing.
  useEffect(() => {
    if (projected === committed.current) return
    committed.current = projected
    if (document.activeElement !== areaRef.current) setDraft(projected)
  }, [projected])

  // Read through a ref so the debounce timer always commits the newest text
  // without being torn down on every keystroke.
  const pending = useRef({ draft, filePath, projection })
  pending.current = { draft, filePath, projection }

  const commit = useCallback(() => {
    const { draft: text, filePath: path, projection: current } = pending.current
    if (!path || !current?.hasBody) return
    if (text === committed.current) return

    // The projection must still describe the buffer we are about to edit.
    const snapshot = documentRegistry.snapshot(path)
    if (!snapshot || snapshot.revision !== current.revision) return

    const result = proseDocumentEdits(current.text, text)
    if (result.status === 'refused') {
      setRefusal(result.reason)
      return
    }
    setRefusal(null)
    if (result.status === 'unchanged') return

    const applied = useEditorStore.getState().applyDocumentEdits(
      path,
      'prose-view',
      result.edits.map((edit) => ({ ...edit, forceMoveMarkers: true }))
    )
    if (applied) committed.current = text
  }, [])

  /*
   * Typing reaches the document on its own.
   *
   * Committing only on blur lost the edit whenever the author left with the
   * keyboard or a swipe, because React fires no blur on unmount. Writing back
   * as they type also means the TeX side and the PDF are already current when
   * they switch, which is the point of having two views of one document.
   */
  const commitRef = useRef(commit)
  commitRef.current = commit
  useEffect(() => {
    if (!filePath) return
    return registerPendingDocumentEditFlusher(filePath, () => commitRef.current())
  }, [filePath])

  useEffect(() => {
    if (draft === committed.current) return
    const timer = setTimeout(() => commitRef.current(), PROSE_COMMIT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [draft])

  // The last debounce may still be pending when the view closes.
  useEffect(() => {
    return () => commitRef.current()
  }, [])

  /*
   * Keeping the two halves on the same passage.
   *
   * A caret position maps to a Markdown line exactly — counting newlines has
   * none of the wrapping trouble a scroll offset does — and from there to the
   * block that produced it. Publishing that block's `.tex` line lets the
   * rendering follow the sentence being written.
   */
  const publishCaret = useCallback(() => {
    const area = areaRef.current
    const current = pending.current.projection
    if (!area || !current?.hasBody) return
    setSelection((currentSelection) => {
      const next = { start: area.selectionStart, end: area.selectionEnd }
      return currentSelection.start === next.start && currentSelection.end === next.end
        ? currentSelection
        : next
    })
    const line = area.value.slice(0, area.selectionStart).split('\n').length
    const span = spanAtMarkdownLine(current.text, line)
    const path = pending.current.filePath
    if (path && span) {
      useUiStore.getState().setProseAnchor(path, span.block.startLine, 'source')
    }
  }, [])

  const publishScroll = useCallback(() => {
    if (Date.now() < suppressScrollUntilRef.current || scrollFrameRef.current !== null) return
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null
      if (Date.now() < suppressScrollUntilRef.current) return
      const area = areaRef.current
      const current = pending.current.projection
      const path = pending.current.filePath
      if (!area || !path || !current?.hasBody) return
      const span = spanAtMarkdownLine(current.text, textareaVisibleLine(area))
      if (span) {
        useUiStore.getState().setProseAnchor(path, span.block.startLine, 'source', 'scroll')
      }
    })
  }, [])

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current)
    },
    []
  )

  // Follow the rendering, or a mode switch, back to the right passage.
  useEffect(() => {
    if (!proseAnchor || proseAnchor.origin === 'source') return
    const area = areaRef.current
    if (!area || !projection?.hasBody) return

    const span = spanAtSourceLine(projection.text, proseAnchor.line)
    if (!span) return

    // Everything above the target line, plus the newline that ends it, so the
    // caret lands on the passage rather than just before its break.
    const lines = area.value.split('\n')
    const lineHeight = area.scrollHeight / Math.max(1, lines.length)
    suppressScrollUntilRef.current = Date.now() + 120
    area.scrollTop = Math.max(0, (span.startLine - 2) * lineHeight)
    if (proseAnchor.intent === 'scroll') return

    const preceding = lines.slice(0, span.startLine - 1).join('\n')
    const offset = span.startLine > 1 ? preceding.length + 1 : 0
    area.setSelectionRange(offset, offset)
    setSelection({ start: offset, end: offset })
    // The old surface can be hidden while it still owns DOM focus. Move focus
    // with the caret so a toolbar/gesture switch, or a rendered-passage click,
    // is immediately ready for typing without another click.
    area.focus({ preventScroll: true })
  }, [projection, proseAnchor])

  useLayoutEffect(() => {
    const next = pendingSelectionRef.current
    const area = areaRef.current
    if (!next || !area) return
    pendingSelectionRef.current = null
    area.focus({ preventScroll: true })
    area.setSelectionRange(next.start, next.end)
    setSelection(next)
    publishCaret()
  }, [draft, publishCaret])

  const formatSelection = useCallback(
    (format: MarkdownInlineFormat): void => {
      const area = areaRef.current
      if (!area || formattingDisabled) return
      const edit = editMarkdownSelection(area.value, area.selectionStart, area.selectionEnd, format)
      pendingSelectionRef.current = {
        start: edit.selectionStart,
        end: edit.selectionEnd
      }
      setRefusal(null)
      setDraft(edit.text)
    },
    [formattingDisabled]
  )

  if (!filePath) return <div className="prose-pane prose-pane--empty">{t('prosePane.noFile')}</div>
  if (!projection?.hasBody) {
    return <div className="prose-pane prose-pane--empty">{t('prosePane.noBody')}</div>
  }

  return (
    <div className="prose-pane">
      <header className="prose-pane__header">
        <div className="prose-pane__identity">
          <FileText size={ICON_SIZE.control} aria-hidden="true" />
          <span className="prose-pane__title">{t('prosePane.markdown')}</span>
          <span
            className={`prose-pane__sync prose-pane__sync--${syncState}`}
            role="status"
            aria-live="polite"
          >
            <span className="prose-pane__sync-dot" aria-hidden="true" />
            {t(`prosePane.sync.${syncState}`)}
          </span>
        </div>
        <div className="prose-pane__formatting" role="toolbar" aria-label={t('prosePane.format')}>
          {(
            [
              ['strong', Bold, 'prosePane.bold'],
              ['emphasis', Italic, 'prosePane.italic'],
              ['code', Code2, 'prosePane.inlineCode']
            ] as const
          ).map(([format, Icon, labelKey]) => {
            const label = t(labelKey)
            return (
              <button
                key={format}
                type="button"
                className="prose-pane__format-button"
                disabled={formattingDisabled}
                aria-label={label}
                aria-pressed={isMarkdownSelectionFormatted(
                  draft,
                  selection.start,
                  selection.end,
                  format
                )}
                title={formattingDisabled ? t('prosePane.protectedFormatting') : label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => formatSelection(format)}
              >
                <Icon size={ICON_SIZE.compact} aria-hidden="true" />
              </button>
            )
          })}
        </div>
        {/* The TeX line lives in the preview header beside this one; prose mode
            always shows both panes, so repeating it here would print the same
            number twice a few pixels apart. */}
        <div className="prose-pane__meta" aria-label={t('prosePane.statistics')}>
          <span>{t('prosePane.words', { count: stats.words })}</span>
          <span>{t('prosePane.lines', { count: stats.lines })}</span>
        </div>
      </header>
      {refusal && (
        <div className="prose-pane__refusal" role="alert">
          <FileCode2 size={ICON_SIZE.compact} aria-hidden="true" />
          <span>{t(`prosePane.refused.${refusal}`)}</span>
          <button
            type="button"
            onClick={() => {
              setDraft(committed.current)
              setRefusal(null)
            }}
          >
            {t('prosePane.discardChange')}
          </button>
        </div>
      )}
      <div className="prose-pane__canvas">
        <textarea
          ref={areaRef}
          className="prose-pane__source"
          value={draft}
          spellCheck
          aria-label={t('prosePane.sourceLabel')}
          placeholder={t('prosePane.placeholder')}
          onChange={(event) => {
            setRefusal(null)
            setDraft(event.target.value)
            publishCaret()
          }}
          onSelect={publishCaret}
          onClick={publishCaret}
          onScroll={publishScroll}
          onBlur={commit}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && !event.altKey) {
              const key = event.key.toLowerCase()
              if (key === 'b' || key === 'i') {
                event.preventDefault()
                formatSelection(key === 'b' ? 'strong' : 'emphasis')
                return
              }
            }
            if (event.key === 'Escape') {
              setDraft(committed.current)
              setRefusal(null)
              event.currentTarget.blur()
            }
          }}
        />
      </div>
    </div>
  )
}

export default ProsePane
