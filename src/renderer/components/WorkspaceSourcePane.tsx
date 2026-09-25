import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Code, Loader, X } from 'lucide-react'
import { usePdfStore } from '../store/usePdfStore'
import { useCompileStore } from '../store/useCompileStore'
import { useEditorStore } from '../store/useEditorStore'
import { useProjectStore } from '../store/useProjectStore'
import { openProblemsPanel } from '../services/appCommands'
import { describeNativeError } from '../services/nativeErrors'
import { ICON_SIZE } from './ui/IconSystem'
import './WorkspaceSourcePane.css'

/** Keep the canonical editor mounted so PDF edits retain its model and undo history. */
export function WorkspaceSourcePane({
  children,
  onCompile
}: {
  children: ReactNode
  onCompile: () => Promise<void>
}) {
  const { t } = useTranslation()
  const pdfOnly = usePdfStore((state) => state.pdfOnly)
  const open = usePdfStore((state) => state.sourceEditorOpen)
  const ratio = usePdfStore((state) => state.splitRatio)
  const compileStatus = useCompileStore((state) => state.compileStatus)
  const filePath = useEditorStore((state) => state.filePath)
  const dirty = useEditorStore((state) => state.isDirty)
  const projectRoot = useProjectStore((state) => state.projectRoot)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(0)
  const refreshing = useRef(false)
  const panel = useRef<HTMLElement>(null)
  const compiling = pending || compileStatus === 'compiling'
  const fileName = filePath?.split(/[\\/]/).at(-1) ?? t('toolbar.untitled')
  const close = () => {
    usePdfStore.getState().setSourceEditorOpen(false)
    document.querySelector<HTMLElement>('.pdf-source-toggle')?.focus()
  }
  useEffect(() => {
    request.current++
    refreshing.current = false
    setPending(false)
    setError('')
    return () => {
      request.current++
    }
  }, [projectRoot, filePath])
  useEffect(() => {
    if (pdfOnly && open) panel.current?.focus()
    else if (pdfOnly && document.activeElement?.closest('#workspace-source-editor'))
      document.querySelector<HTMLElement>('.preview-container')?.focus()
  }, [pdfOnly, open])
  const refresh = async () => {
    if (!filePath || compiling || refreshing.current) return
    const id = ++request.current
    const revision = useEditorStore.getState().revision
    refreshing.current = true
    setPending(true)
    setError('')
    try {
      await onCompile()
    } catch (reason) {
      if (
        request.current === id &&
        useEditorStore.getState().filePath === filePath &&
        useEditorStore.getState().revision === revision &&
        useProjectStore.getState().projectRoot === projectRoot
      )
        setError(describeNativeError(reason))
    } finally {
      if (request.current === id) {
        refreshing.current = false
        setPending(false)
      }
    }
  }
  return (
    <section
      ref={panel}
      id="workspace-source-editor"
      className={`editor-pane workspace-source-pane${pdfOnly ? ' workspace-source-pane--floating' : ''}`}
      hidden={pdfOnly && !open}
      aria-label={t('pdfWorkspace.source')}
      style={{ width: `${ratio * 100}%` }}
      onKeyDown={(event) => {
        if (!pdfOnly || event.defaultPrevented || event.nativeEvent.isComposing) return
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          close()
        } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault()
          event.stopPropagation()
          void refresh()
        }
      }}
      tabIndex={-1}
    >
      {pdfOnly && (
        <header className="workspace-source-pane__header">
          <div className="workspace-source-pane__heading">
            <Code size={ICON_SIZE.control} />
            <strong>{t('pdfWorkspace.source')}</strong>
            <span className="workspace-source-pane__file" title={filePath ?? undefined}>
              {fileName}
            </span>
          </div>
          <button
            type="button"
            className="workspace-button workspace-button-icon"
            title={t('pdfWorkspace.back')}
            aria-label={t('pdfWorkspace.back')}
            onClick={close}
          >
            <X size={ICON_SIZE.control} />
          </button>
          <p>{t('pdfWorkspace.sourceHint')}</p>
        </header>
      )}
      {children}
      {pdfOnly && (
        <footer className="workspace-source-pane__footer">
          <span role="status" className={`workspace-source-pane__state${dirty ? ' is-dirty' : ''}`}>
            {compiling
              ? t('pdfWorkspace.updating')
              : t(dirty ? 'pdfWorkspace.unsaved' : 'pdfWorkspace.saved')}
          </span>
          <button
            type="button"
            className="workspace-button workspace-button-primary"
            disabled={compiling || !filePath}
            onClick={() => void refresh()}
          >
            {compiling && <Loader size={ICON_SIZE.compact} className="spin" />}
            {t(compiling ? 'pdfWorkspace.updating' : 'pdfWorkspace.refresh')}
          </button>
          {(error || compileStatus === 'error') && (
            <div className="workspace-source-pane__error">
              <p role="alert">{error || t('pdfWorkspace.refreshFailed')}</p>
              <button type="button" className="workspace-button" onClick={openProblemsPanel}>
                {t('pdfWorkspace.showProblems')}
              </button>
            </div>
          )}
        </footer>
      )}
    </section>
  )
}
