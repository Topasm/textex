import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFeatureModal } from '../hooks/useFeatureModal'
import { useTranslation } from 'react-i18next'
import type { RecoveryItem, RecoverySnapshot } from '../../shared/types'
import { documentRegistry } from '../models/documentRegistry'
import { applyRecoveryToEditor } from '../services/crashRecovery'
import { useProjectStore } from '../store/useProjectStore'
import { errorMessage } from '../utils/errorMessage'
import './CrashRecoveryDialog.css'

const MAX_COMPARISON_CHARACTERS = 200_000
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

function fileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath
}

function comparisonText(content: string, truncatedLabel: string): string {
  if (content.length <= MAX_COMPARISON_CHARACTERS) return content
  return `${content.slice(0, MAX_COMPARISON_CHARACTERS)}\n\n${truncatedLabel}`
}

interface CrashRecoveryDialogProps {
  enabled: boolean
}

export function CrashRecoveryDialog({ enabled }: CrashRecoveryDialogProps) {
  const { t, i18n } = useTranslation()
  const projectRoot = useProjectStore((state) => state.projectRoot)
  const [items, setItems] = useState<RecoveryItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [comparison, setComparison] = useState<RecoverySnapshot | null>(null)
  const [showComparison, setShowComparison] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const initialFocusRef = useRef<HTMLButtonElement>(null)
  const visible = items.length > 0
  useFeatureModal('crashRecovery', visible)

  useEffect(() => {
    if (!visible) return
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    initialFocusRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return
      if (event.key === 'Escape') {
        // Recovery requires an explicit recover/discard decision.
        event.preventDefault()
        event.stopPropagation()
        return
      }
      if (event.key !== 'Tab') return

      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) return
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault()
        const target = event.shiftKey ? last : first
        target.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [visible])

  useEffect(() => {
    if (!enabled || !projectRoot) {
      setItems([])
      setSelectedId(null)
      return
    }
    let active = true
    const expectedRoot = projectRoot
    void window.api
      .listRecoverySnapshots()
      .then((entries) => {
        if (!active || useProjectStore.getState().projectRoot !== expectedRoot) return
        setItems(entries)
        setSelectedId(entries[0]?.id ?? null)
        setError(null)
      })
      .catch((reason: unknown) => {
        if (active && useProjectStore.getState().projectRoot === expectedRoot) {
          setError(errorMessage(reason))
        }
      })
    return () => {
      active = false
    }
  }, [enabled, projectRoot])

  useEffect(() => {
    setComparison(null)
    setShowComparison(false)
    setError(null)
  }, [selectedId])

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId]
  )

  const removeItem = useCallback((id: string) => {
    setItems((current) => {
      const next = current.filter((item) => item.id !== id)
      setSelectedId((selectedItem) => (selectedItem === id ? (next[0]?.id ?? null) : selectedItem))
      return next
    })
  }, [])

  const loadSelected = useCallback(async (): Promise<RecoverySnapshot | null> => {
    if (!selectedId) return null
    setBusy(true)
    setError(null)
    try {
      return await window.api.loadRecoverySnapshot(selectedId)
    } catch (reason) {
      setError(errorMessage(reason))
      return null
    } finally {
      setBusy(false)
    }
  }, [selectedId])

  const handleCompare = useCallback(async () => {
    if (showComparison) {
      setShowComparison(false)
      return
    }
    const loaded = comparison ?? (await loadSelected())
    if (!loaded) return
    setComparison(loaded)
    setShowComparison(true)
  }, [comparison, loadSelected, showComparison])

  const handleRecover = useCallback(async () => {
    if (!selectedId) return
    // Reload at the moment of intent so disk comparison is not stale after a
    // user spends time reviewing the side-by-side preview.
    const loaded = await loadSelected()
    if (!loaded) return
    const current = documentRegistry.getModel(loaded.item.filePath)
    const currentText = documentRegistry.snapshot(loaded.item.filePath)?.text
    if (
      current?.isDirty &&
      currentText !== loaded.content &&
      !window.confirm(t('crashRecovery.replaceDirty', { name: fileName(loaded.item.filePath) }))
    ) {
      return
    }
    if (!applyRecoveryToEditor(loaded)) {
      setError(t('crashRecovery.applyFailed'))
      return
    }
    removeItem(selectedId)
  }, [loadSelected, removeItem, selectedId, t])

  const handleDiscard = useCallback(async () => {
    if (
      !selected ||
      !window.confirm(t('crashRecovery.discardConfirm', { name: fileName(selected.filePath) }))
    ) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await window.api.discardRecoverySnapshot(selected.id)
      removeItem(selected.id)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }, [removeItem, selected, t])

  if (items.length === 0) return null

  return (
    <div className="crash-recovery-overlay" role="presentation">
      <section
        ref={dialogRef}
        className="crash-recovery-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crash-recovery-title"
        tabIndex={-1}
      >
        <header className="crash-recovery-header">
          <div>
            <h2 id="crash-recovery-title">{t('crashRecovery.title')}</h2>
            <p>{t('crashRecovery.description')}</p>
          </div>
          <span className="crash-recovery-count">{items.length}</span>
        </header>

        <div className="crash-recovery-body">
          <nav className="crash-recovery-list" aria-label={t('crashRecovery.documents')}>
            {items.map((item) => (
              <button
                ref={item.id === selectedId ? initialFocusRef : undefined}
                key={item.id}
                type="button"
                className={item.id === selectedId ? 'active' : ''}
                onClick={() => setSelectedId(item.id)}
              >
                <strong>{fileName(item.filePath)}</strong>
                <span>{new Date(item.capturedAtEpochMs).toLocaleString(i18n.language)}</span>
                <span>{t(`crashRecovery.diskState.${item.diskState}`)}</span>
              </button>
            ))}
          </nav>

          <div className="crash-recovery-detail">
            {selected && (
              <>
                <div className="crash-recovery-path" title={selected.filePath}>
                  {selected.filePath}
                </div>
                {showComparison && comparison ? (
                  <div className="crash-recovery-comparison">
                    <div>
                      <h3>{t('crashRecovery.diskVersion')}</h3>
                      <pre>
                        {comparison.diskContent === null
                          ? t('crashRecovery.diskUnavailable')
                          : comparisonText(
                              comparison.diskContent,
                              t('crashRecovery.previewTruncated')
                            )}
                      </pre>
                    </div>
                    <div>
                      <h3>{t('crashRecovery.recoveredVersion')}</h3>
                      <pre>
                        {comparisonText(comparison.content, t('crashRecovery.previewTruncated'))}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <p className="crash-recovery-hint">{t('crashRecovery.hint')}</p>
                )}
              </>
            )}
            {error && <div className="crash-recovery-error">{error}</div>}
          </div>
        </div>

        <footer className="crash-recovery-actions">
          <button type="button" onClick={handleDiscard} disabled={busy || !selected}>
            {t('crashRecovery.discard')}
          </button>
          <button type="button" onClick={handleCompare} disabled={busy || !selected}>
            {showComparison ? t('crashRecovery.hideComparison') : t('crashRecovery.compare')}
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={handleRecover}
            disabled={busy || !selected}
          >
            {busy ? t('crashRecovery.loading') : t('crashRecovery.recover')}
          </button>
        </footer>
      </section>
    </div>
  )
}
