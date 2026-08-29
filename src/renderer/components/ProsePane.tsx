import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileCode2, Sigma, Image, Table2, Braces, FileInput } from 'lucide-react'
import { documentRegistry } from '../models/documentRegistry'
import { useEditorStore } from '../store/useEditorStore'
import { getActiveEditorAdapter } from '../editor/activeEditorAdapter'
import { projectLatexToProse, type ProseBlock } from '../../shared/proseProjection'
import { proseBlockEdit } from '../../shared/proseEdit'
import { ICON_SIZE } from './ui/IconSystem'
import './ProsePane.css'

/**
 * The prose view of the active LaTeX document.
 *
 * It is a view, not a second file: blocks are projected from the buffer and an
 * edit is written straight back into the same document through one ranged
 * edit. TeX mode therefore already shows the change, and saving and compiling
 * are unaffected.
 */

const PROTECTED_ICONS: Record<string, typeof Sigma> = {
  math: Sigma,
  equation: Sigma,
  align: Sigma,
  figure: Image,
  table: Table2,
  tabular: Table2,
  include: FileInput,
  declaration: Braces
}

function ProtectedCard({
  block,
  onOpenInTex
}: {
  block: ProseBlock
  onOpenInTex: (line: number) => void
}) {
  const { t } = useTranslation()
  const Icon = PROTECTED_ICONS[block.protectedLabel ?? ''] ?? FileCode2
  const preview = block.source.trim().split('\n').slice(0, 6).join('\n')

  return (
    <button
      type="button"
      className="prose-block prose-block--protected"
      onClick={() => onOpenInTex(block.startLine)}
      title={t('prosePane.openInTex')}
      aria-label={t('prosePane.protectedBlock', {
        kind: block.protectedLabel ?? 'tex',
        line: block.startLine
      })}
    >
      <span className="prose-block__badge">
        <Icon size={ICON_SIZE.compact} aria-hidden="true" />
        {block.protectedLabel ?? 'tex'}
      </span>
      <pre>{preview}</pre>
    </button>
  )
}

function EditableBlock({
  block,
  onCommit
}: {
  block: ProseBlock
  onCommit: (block: ProseBlock, markdown: string) => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(block.markdown)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  // A reprojection after somebody else's edit must not clobber live typing.
  const committed = useRef(block.markdown)
  useEffect(() => {
    if (block.markdown === committed.current) return
    committed.current = block.markdown
    if (document.activeElement !== areaRef.current) setDraft(block.markdown)
  }, [block.markdown])

  const resize = useCallback(() => {
    const area = areaRef.current
    if (!area) return
    area.style.height = 'auto'
    area.style.height = `${area.scrollHeight}px`
  }, [])

  useEffect(resize, [draft, resize])

  const isHeading = block.kind === 'heading'
  return (
    <textarea
      ref={areaRef}
      className={`prose-block prose-block--${isHeading ? `heading prose-block--h${block.level ?? 1}` : 'prose'}`}
      value={draft}
      rows={1}
      spellCheck
      aria-label={
        isHeading
          ? t('prosePane.headingField', { title: block.title })
          : t('prosePane.proseField', { line: block.startLine })
      }
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        committed.current = draft
        onCommit(block, draft)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setDraft(committed.current)
          event.currentTarget.blur()
          return
        }
        if (isHeading && event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
    />
  )
}

export function ProsePane() {
  const { t } = useTranslation()
  const filePath = useEditorStore((state) => state.filePath)
  const revision = useEditorStore((state) => state.revision)

  const projection = useMemo(() => {
    if (!filePath) return null
    const snapshot = documentRegistry.snapshot(filePath)
    if (!snapshot) return null
    return { ...projectLatexToProse(snapshot.text), revision: snapshot.revision }
    // `revision` is the signal that the buffer changed under us.
  }, [filePath, revision])

  const openInTex = useCallback((line: number) => {
    useEditorStore.getState().requestJumpToLine(line, 1)
  }, [])

  const commit = useCallback(
    (block: ProseBlock, markdown: string) => {
      if (!filePath) return
      const edit = proseBlockEdit(block, markdown)
      if (!edit) return

      // The projection must still describe the buffer we are about to edit.
      const current = documentRegistry.snapshot(filePath)
      if (!current || current.revision !== projection?.revision) return

      getActiveEditorAdapter()?.applyEdits('prose-view', [
        { range: edit.range, text: edit.text, forceMoveMarkers: true }
      ])
    },
    [filePath, projection?.revision]
  )

  if (!filePath) return <div className="prose-pane prose-pane--empty">{t('prosePane.noFile')}</div>
  if (!projection?.hasBody) {
    return <div className="prose-pane prose-pane--empty">{t('prosePane.noBody')}</div>
  }

  return (
    <div className="prose-pane" role="region" aria-label={t('prosePane.label')}>
      <div className="prose-pane__sheet">
        {projection.blocks.map((block) => {
          if (block.kind === 'boundary' || block.kind === 'hidden') return null
          if (block.kind === 'blank') {
            return <div key={block.startLine} className="prose-block__gap" aria-hidden="true" />
          }
          if (block.kind === 'protected') {
            return <ProtectedCard key={block.startLine} block={block} onOpenInTex={openInTex} />
          }
          if (block.kind === 'heading' && !block.titleRange) {
            return (
              <div key={block.startLine} className="prose-block prose-block--heading-readonly">
                {block.markdown}
              </div>
            )
          }
          return <EditableBlock key={block.startLine} block={block} onCommit={commit} />
        })}
      </div>
    </div>
  )
}

export default ProsePane
