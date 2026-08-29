import { useCallback, useEffect, useRef, useState } from 'react'
import { ICON_SIZE } from '../ui/IconSystem'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { BookmarkPlus, ExternalLink, Loader, MessageSquarePlus, Plus, Search } from 'lucide-react'
import type { OnlineReference } from '../../../shared/types'
import {
  addReferenceAtCursor,
  setReferenceDragData,
  type ReferenceDragPayload
} from './referenceActions'
import { invalidateZoteroInventory } from '../../services/zoteroInventoryCache'
import { useProjectStore } from '../../store/useProjectStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { describeNativeError } from '../../services/nativeErrors'

interface OnlineReferencesProps {
  onAddToChat?: (payload: ReferenceDragPayload) => void
}

export function OnlineReferences({ onAddToChat }: OnlineReferencesProps = {}) {
  const { t } = useTranslation()
  const projectRoot = useProjectStore((state) => state.projectRoot)
  const query = useProjectStore((state) => state.researchSearchQuery)
  const [results, setResults] = useState<OnlineReference[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [message, setMessage] = useState('')
  const port = useSettingsStore((state) => state.settings.zoteroPort)
  const scopeGeneration = useRef(0)
  const operationInFlight = useRef(false)

  const isCurrentScope = useCallback((generation: number, root: string | null, apiPort: number) => {
    return (
      scopeGeneration.current === generation &&
      useProjectStore.getState().projectRoot === root &&
      useSettingsStore.getState().settings.zoteroPort === apiPort
    )
  }, [])

  useEffect(() => {
    const generation = ++scopeGeneration.current
    operationInFlight.current = false
    setResults([])
    setBusyId(null)
    setSavingId(null)
    setSearching(false)
    setMessage('')
    return () => {
      if (scopeGeneration.current === generation) scopeGeneration.current += 1
    }
  }, [port, projectRoot])

  const search = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      const normalized = query.trim()
      if (normalized.length < 2 || operationInFlight.current) return
      const generation = scopeGeneration.current
      const root = projectRoot
      const apiPort = port
      operationInFlight.current = true
      setSearching(true)
      setMessage('')
      try {
        const references = await window.api.researchSearchOnline(normalized)
        if (!isCurrentScope(generation, root, apiPort)) return
        setResults(references)
        if (references.length === 0) setMessage(t('researchPanel.online.noResults'))
      } catch (error) {
        if (isCurrentScope(generation, root, apiPort)) {
          setResults([])
          setMessage(describeNativeError(error))
        }
      } finally {
        if (isCurrentScope(generation, root, apiPort)) {
          operationInFlight.current = false
          setSearching(false)
        }
      }
    },
    [isCurrentScope, port, projectRoot, query, t]
  )

  const add = useCallback(
    async (reference: OnlineReference) => {
      if (operationInFlight.current) return
      const generation = scopeGeneration.current
      const root = projectRoot
      const apiPort = port
      operationInFlight.current = true
      setBusyId(reference.id)
      setMessage('')
      try {
        const inserted = await addReferenceAtCursor({ source: 'online', reference })
        if (isCurrentScope(generation, root, apiPort)) {
          setMessage(
            inserted
              ? t('researchPanel.online.addedAndCited', { title: reference.title })
              : t('researchPanel.online.addedWithoutCitation', { title: reference.title })
          )
        }
      } catch (error) {
        if (isCurrentScope(generation, root, apiPort)) {
          setMessage(describeNativeError(error))
        }
      } finally {
        if (isCurrentScope(generation, root, apiPort)) {
          operationInFlight.current = false
          setBusyId(null)
        }
      }
    },
    [isCurrentScope, port, projectRoot, t]
  )

  const saveToLibrary = useCallback(
    async (reference: OnlineReference) => {
      if (operationInFlight.current) return
      const generation = scopeGeneration.current
      const root = projectRoot
      const apiPort = port
      operationInFlight.current = true
      setSavingId(reference.id)
      setMessage(t('researchPanel.online.waitingForZotero'))
      try {
        const result = await window.api.zoteroSaveOnline(reference, port)
        if (!isCurrentScope(generation, root, apiPort)) return
        invalidateZoteroInventory(port)
        const citekeySuffix = result.citekey
          ? t('researchPanel.online.asCitekey', { citekey: result.citekey })
          : ''
        setMessage(
          result.duplicate
            ? t('researchPanel.online.alreadyInZotero', { citekey: citekeySuffix })
            : t('researchPanel.online.savedToZotero', { citekey: citekeySuffix })
        )
      } catch (error) {
        if (isCurrentScope(generation, root, apiPort)) {
          setMessage(describeNativeError(error))
        }
      } finally {
        if (isCurrentScope(generation, root, apiPort)) {
          operationInFlight.current = false
          setSavingId(null)
        }
      }
    },
    [isCurrentScope, port, projectRoot, t]
  )

  const busy = searching || busyId !== null || savingId !== null

  return (
    <section className="research-reference-view" aria-label={t('researchPanel.online.label')}>
      <form className="research-search" onSubmit={search}>
        <input
          value={query}
          onChange={(event) =>
            useProjectStore.getState().setResearchSearchQuery(event.target.value)
          }
          maxLength={512}
          placeholder={t('researchPanel.online.searchPlaceholder')}
          aria-label={t('researchPanel.online.searchPlaceholder')}
        />
        <button
          type="submit"
          disabled={query.trim().length < 2 || busy}
          aria-label={t('researchPanel.online.search')}
        >
          {searching ? (
            <Loader className="spin" size={ICON_SIZE.compact} />
          ) : (
            <Search size={ICON_SIZE.compact} />
          )}
        </button>
      </form>
      <p className="research-muted">{t('researchPanel.online.atomicNotice')}</p>
      <div
        className="reference-card-list"
        role="region"
        aria-label={t('researchPanel.online.resultsLabel')}
        tabIndex={results.length > 0 ? 0 : -1}
      >
        {results.map((reference) => (
          <article
            className="reference-card"
            key={`${reference.source}:${reference.id}`}
            tabIndex={0}
            draggable
            onDragStart={(event) => setReferenceDragData(event, { source: 'online', reference })}
          >
            <div>
              <strong>{reference.title}</strong>
              <span>{reference.source}</span>
            </div>
            <span>
              {reference.authors.slice(0, 3).join(', ') ||
                t('researchPanel.referenceCard.unknownAuthor')}
              {reference.year ? ` · ${reference.year}` : ''}
            </span>
            {reference.abstract && <p>{reference.abstract}</p>}
            <div className="reference-card-actions">
              {onAddToChat && (
                <button
                  type="button"
                  onClick={() => onAddToChat({ source: 'online', reference })}
                  aria-label={t('researchPanel.referenceCard.addNamedToChat', {
                    name: reference.title
                  })}
                >
                  <MessageSquarePlus size={ICON_SIZE.micro} />{' '}
                  {t('researchPanel.referenceCard.addToChat')}
                </button>
              )}
              {reference.url && (
                <button
                  type="button"
                  onClick={() => reference.url && void window.api.openExternal(reference.url)}
                >
                  <ExternalLink size={ICON_SIZE.micro} /> {t('researchPanel.online.source')}
                </button>
              )}
              <button type="button" onClick={() => void saveToLibrary(reference)} disabled={busy}>
                {savingId === reference.id ? (
                  <Loader className="spin" size={ICON_SIZE.micro} />
                ) : (
                  <BookmarkPlus size={ICON_SIZE.micro} />
                )}
                {t('researchPanel.online.saveToLibrary')}
              </button>
              <button type="button" onClick={() => void add(reference)} disabled={busy}>
                {busyId === reference.id ? (
                  <Loader className="spin" size={ICON_SIZE.micro} />
                ) : (
                  <Plus size={ICON_SIZE.micro} />
                )}
                {t('researchPanel.online.addAndCite')}
              </button>
            </div>
          </article>
        ))}
      </div>
      {message && (
        <div className="research-status" aria-live="polite">
          {message}
        </div>
      )}
    </section>
  )
}
