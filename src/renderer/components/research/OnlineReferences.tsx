import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { BookmarkPlus, ExternalLink, Loader, MessageSquarePlus, Plus, Search } from 'lucide-react'
import type { OnlineReference } from '../../../shared/types'
import {
  addReferenceAtCursor,
  setReferenceDragData,
  type ReferenceDragPayload
} from './referenceActions'
import { useProjectStore } from '../../store/useProjectStore'
import { useSettingsStore } from '../../store/useSettingsStore'

interface OnlineReferencesProps {
  onAddToChat?: (payload: ReferenceDragPayload) => void
}

export function OnlineReferences({ onAddToChat }: OnlineReferencesProps = {}) {
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
        if (references.length === 0) setMessage('No matching references found.')
      } catch (error) {
        if (isCurrentScope(generation, root, apiPort)) {
          setResults([])
          setMessage(error instanceof Error ? error.message : String(error))
        }
      } finally {
        if (isCurrentScope(generation, root, apiPort)) {
          operationInFlight.current = false
          setSearching(false)
        }
      }
    },
    [isCurrentScope, port, projectRoot, query]
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
              ? `Added ${reference.title} and inserted its citation.`
              : `Added ${reference.title} to the project bibliography, but the editor changed before citation insertion.`
          )
        }
      } catch (error) {
        if (isCurrentScope(generation, root, apiPort)) {
          setMessage(error instanceof Error ? error.message : String(error))
        }
      } finally {
        if (isCurrentScope(generation, root, apiPort)) {
          operationInFlight.current = false
          setBusyId(null)
        }
      }
    },
    [isCurrentScope, port, projectRoot]
  )

  const saveToLibrary = useCallback(
    async (reference: OnlineReference) => {
      if (operationInFlight.current) return
      const generation = scopeGeneration.current
      const root = projectRoot
      const apiPort = port
      operationInFlight.current = true
      setSavingId(reference.id)
      setMessage('Waiting for Zotero authorization…')
      try {
        const result = await window.api.zoteroSaveOnline(reference, port)
        if (!isCurrentScope(generation, root, apiPort)) return
        setMessage(
          result.duplicate
            ? `Already in Zotero${result.citekey ? ` as @${result.citekey}` : ''}.`
            : `Saved to Zotero${result.citekey ? ` as @${result.citekey}` : ''}.`
        )
      } catch (error) {
        if (isCurrentScope(generation, root, apiPort)) {
          setMessage(error instanceof Error ? error.message : String(error))
        }
      } finally {
        if (isCurrentScope(generation, root, apiPort)) {
          operationInFlight.current = false
          setSavingId(null)
        }
      }
    },
    [isCurrentScope, port, projectRoot]
  )

  const busy = searching || busyId !== null || savingId !== null

  return (
    <section className="research-reference-view" aria-label="Online references">
      <form className="research-search" onSubmit={search}>
        <input
          value={query}
          onChange={(event) =>
            useProjectStore.getState().setResearchSearchQuery(event.target.value)
          }
          maxLength={512}
          placeholder="Search Crossref and arXiv"
          aria-label="Search Crossref and arXiv"
        />
        <button type="submit" disabled={query.trim().length < 2 || busy} aria-label="Search">
          {searching ? <Loader className="spin" size={15} /> : <Search size={15} />}
        </button>
      </form>
      <p className="research-muted">
        Results are added atomically to the managed project bibliography.
      </p>
      <div
        className="reference-card-list"
        role="region"
        aria-label="Online search results"
        tabIndex={results.length > 0 ? 0 : -1}
      >
        {results.map((reference) => (
          <article
            className="reference-card"
            key={`${reference.source}:${reference.id}`}
            draggable
            onDragStart={(event) => setReferenceDragData(event, { source: 'online', reference })}
          >
            <div>
              <strong>{reference.title}</strong>
              <span>{reference.source}</span>
            </div>
            <span>
              {reference.authors.slice(0, 3).join(', ') || 'Unknown author'}
              {reference.year ? ` · ${reference.year}` : ''}
            </span>
            {reference.abstract && <p>{reference.abstract}</p>}
            <div className="reference-card-actions">
              {onAddToChat && (
                <button
                  type="button"
                  onClick={() => onAddToChat({ source: 'online', reference })}
                  aria-label={`Add ${reference.title} to Chat`}
                >
                  <MessageSquarePlus size={13} /> Add to Chat
                </button>
              )}
              {reference.url && (
                <button
                  type="button"
                  onClick={() => reference.url && void window.api.openExternal(reference.url)}
                >
                  <ExternalLink size={13} /> Source
                </button>
              )}
              <button type="button" onClick={() => void saveToLibrary(reference)} disabled={busy}>
                {savingId === reference.id ? (
                  <Loader className="spin" size={13} />
                ) : (
                  <BookmarkPlus size={13} />
                )}
                Save to library
              </button>
              <button type="button" onClick={() => void add(reference)} disabled={busy}>
                {busyId === reference.id ? (
                  <Loader className="spin" size={13} />
                ) : (
                  <Plus size={13} />
                )}
                Add &amp; cite
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
