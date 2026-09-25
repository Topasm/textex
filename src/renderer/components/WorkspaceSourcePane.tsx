import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { usePdfStore } from '../store/usePdfStore'
import { useCompileStore } from '../store/useCompileStore'
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
  const compiling = useCompileStore((state) => state.compileStatus === 'compiling')
  useEffect(() => {
    if (pdfOnly && !open && document.activeElement?.closest('#workspace-source-editor')) {
      document.querySelector<HTMLElement>('.preview-container')?.focus()
    }
  }, [pdfOnly, open])
  return (
    <section
      id="workspace-source-editor"
      className={`editor-pane workspace-source-pane${pdfOnly ? ' workspace-source-pane--floating' : ''}`}
      hidden={pdfOnly && !open}
      aria-label={t('pdfWorkspace.source')}
      style={{ width: `${ratio * 100}%` }}
      onKeyDown={(event) => {
        if (pdfOnly && event.key === 'Escape' && event.target === event.currentTarget) {
          usePdfStore.getState().setSourceEditorOpen(false)
        }
      }}
      tabIndex={-1}
    >
      {pdfOnly && (
        <header className="workspace-source-pane__header">
          <div>
            <strong>{t('pdfWorkspace.source')}</strong>
            <p>{t('pdfWorkspace.sourceHint')}</p>
          </div>
          <button
            type="button"
            className="workspace-button workspace-button-primary"
            disabled={compiling}
            onClick={() => void onCompile()}
          >
            {t('pdfWorkspace.refresh')}
          </button>
          <button
            type="button"
            className="workspace-button"
            onClick={() => usePdfStore.getState().setSourceEditorOpen(false)}
          >
            {t('pdfWorkspace.back')}
          </button>
        </header>
      )}
      {children}
    </section>
  )
}
