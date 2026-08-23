import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import { BookmarkPlus, ExternalLink, Loader, Plus, Search } from 'lucide-react'
import type { OnlineReference } from '../../../shared/types'
import { addReferenceAtCursor, setReferenceDragData } from './referenceActions'
import { useProjectStore } from '../../store/useProjectStore'
import { useSettingsStore } from '../../store/useSettingsStore'

export function OnlineReferences() {
  const query = useProjectStore((state) => state.researchSearchQuery)
  const [results, setResults] = useState<OnlineReference[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [message, setMessage] = useState('')
  const port = useSettingsStore((state) => state.settings.zoteroPort)

  const search = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      const normalized = query.trim()
      if (normalized.length < 2 || searching) return
      setSearching(true)
      setMessage('')
      try {
        const references = await window.api.researchSearchOnline(normalized)
        setResults(references)
        if (references.length === 0) setMessage('No matching references found.')
      } catch (error) {
        setResults([])
        setMessage(error instanceof Error ? error.message : String(error))
      } finally {
        setSearching(false)
      }
    },
    [query, searching]
  )

  const add = useCallback(async (reference: OnlineReference) => {
    setBusyId(reference.id)
    setMessage('')
    try {
      await addReferenceAtCursor({ source: 'online', reference })
      setMessage(`Added ${reference.title} and inserted its citation.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusyId(null)
    }
  }, [])

  const saveToLibrary = useCallback(
    async (reference: OnlineReference) => {
      setSavingId(reference.id)
      setMessage('Waiting for Zotero authorization…')
      try {
        const result = await window.api.zoteroSaveOnline(reference, port)
        setMessage(
          result.duplicate
            ? `Already in Zotero${result.citekey ? ` as @${result.citekey}` : ''}.`
            : `Saved to Zotero${result.citekey ? ` as @${result.citekey}` : ''}.`
        )
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error))
      } finally {
        setSavingId(null)
      }
    },
    [port]
  )

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
        <button type="submit" disabled={query.trim().length < 2 || searching} aria-label="Search">
          {searching ? <Loader className="spin" size={15} /> : <Search size={15} />}
        </button>
      </form>
      <p className="research-muted">
        Results are added atomically to the managed project bibliography.
      </p>
      <div className="reference-card-list">
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
              {reference.url && (
                <button type="button" onClick={() => void window.api.openExternal(reference.url!)}>
                  <ExternalLink size={13} /> Source
                </button>
              )}
              <button
                type="button"
                onClick={() => void saveToLibrary(reference)}
                disabled={savingId !== null || busyId !== null}
              >
                {savingId === reference.id ? (
                  <Loader className="spin" size={13} />
                ) : (
                  <BookmarkPlus size={13} />
                )}
                Save to library
              </button>
              <button
                type="button"
                onClick={() => void add(reference)}
                disabled={busyId !== null || savingId !== null}
              >
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
