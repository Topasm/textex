import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileCode2 } from 'lucide-react'
import { documentRegistry } from '../models/documentRegistry'
import { useEditorStore } from '../store/useEditorStore'
import { getActiveEditorAdapter } from '../editor/activeEditorAdapter'
import { projectLatexToProse } from '../../shared/proseProjection'
import { proseDocumentEdits, proseDocumentText } from '../../shared/proseDocument'
import type { ProseRefusal } from '../../shared/proseDocument'
import { PROSE_COMMIT_DELAY_MS } from '../constants'
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
  const [refusal, setRefusal] = useState<ProseRefusal | null>(null)

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

    committed.current = text
    getActiveEditorAdapter()?.applyEdits(
      'prose-view',
      result.edits.map((edit) => ({ ...edit, forceMoveMarkers: true }))
    )
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
    if (draft === committed.current) return
    const timer = setTimeout(() => commitRef.current(), PROSE_COMMIT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [draft])

  // The last debounce may still be pending when the view closes.
  useEffect(() => {
    return () => commitRef.current()
  }, [])

  if (!filePath) return <div className="prose-pane prose-pane--empty">{t('prosePane.noFile')}</div>
  if (!projection?.hasBody) {
    return <div className="prose-pane prose-pane--empty">{t('prosePane.noBody')}</div>
  }

  return (
    <div className="prose-pane">
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
      <textarea
        ref={areaRef}
        className="prose-pane__source"
        value={draft}
        spellCheck
        aria-label={t('prosePane.sourceLabel')}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setDraft(committed.current)
            setRefusal(null)
            event.currentTarget.blur()
          }
        }}
      />
    </div>
  )
}

export default ProsePane
