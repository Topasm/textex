import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Loader, Plus, RefreshCw, Save, Search } from 'lucide-react'
import type { ResearchConfig, ZoteroCollection, ZoteroSearchResult } from '../../../shared/types'
import { useProjectStore } from '../../store/useProjectStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import {
  addReferenceAtCursor,
  setReferenceDragData,
  setZoteroCollectionDragData
} from './referenceActions'

const DEFAULT_CONFIG: ResearchConfig = {
  version: 1,
  referencesFile: 'references.bib',
  zoteroFile: 'zotero.bib',
  zoteroCollection: null,
  syncOnOpen: false
}

export function ZoteroReferences() {
  const projectRoot = useProjectStore((state) => state.projectRoot)
  const port = useSettingsStore((state) => state.settings.zoteroPort)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ZoteroSearchResult[]>([])
  const [collections, setCollections] = useState<ZoteroCollection[]>([])
  const [config, setConfig] = useState<ResearchConfig>(DEFAULT_CONFIG)
  const [busy, setBusy] = useState<'load' | 'search' | 'save' | 'sync' | string | null>('load')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([window.api.researchLoadConfig(), window.api.zoteroCollections(port)])
      .then(([loadedConfig, loadedCollections]) => {
        if (!active) return
        setConfig(loadedConfig)
        setCollections(loadedCollections)
      })
      .catch((error) => {
        if (active) setMessage(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (active) setBusy(null)
      })
    return () => {
      active = false
    }
  }, [port, projectRoot])

  const targetFile = useMemo(() => {
    if (!projectRoot) return undefined
    const separator = projectRoot.includes('\\') ? '\\' : '/'
    return `${projectRoot.replace(/[\\/]$/, '')}${separator}${config.zoteroFile}`
  }, [config.zoteroFile, projectRoot])

  const collectionRows = useMemo(() => orderCollections(collections), [collections])

  const search = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      const normalized = query.trim()
      if (!normalized || busy) return
      setBusy('search')
      setMessage('')
      try {
        const items = await window.api.zoteroSearch(normalized, port)
        setResults(items)
        if (items.length === 0) setMessage('No matching Zotero items found.')
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error))
      } finally {
        setBusy(null)
      }
    },
    [busy, port, query]
  )

  const add = useCallback(
    async (item: ZoteroSearchResult) => {
      setBusy(item.citekey)
      setMessage('')
      try {
        await addReferenceAtCursor({ source: 'zotero', citekey: item.citekey, port })
        setMessage(`Added @${item.citekey} and inserted its citation.`)
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error))
      } finally {
        setBusy(null)
      }
    },
    [port]
  )

  const saveConfig = useCallback(async () => {
    setBusy('save')
    setMessage('')
    try {
      const saved = await window.api.researchSaveConfig(config)
      setConfig(saved)
      setMessage('Research settings saved.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }, [config])

  const syncCollection = useCallback(
    async (confirmFirst = true) => {
      if (!config.zoteroCollection || !targetFile) return
      const selected = collections.find((collection) => collection.key === config.zoteroCollection)
      if (
        confirmFirst &&
        !window.confirm(
          `Sync ${selected?.name ?? config.zoteroCollection}?\n\n` +
            `${selected?.itemCount ?? 0} references\nTarget: ${config.zoteroFile}`
        )
      ) {
        return
      }
      setBusy('sync')
      setMessage('')
      try {
        const result = await window.api.zoteroSyncCollection(
          config.zoteroCollection,
          targetFile,
          port
        )
        if (projectRoot) {
          const entries = await window.api.findBibInProject(projectRoot)
          useProjectStore.getState().setBibEntries(entries)
          useProjectStore.getState().invalidateDirectory(projectRoot)
        }
        setMessage(`Synchronized ${result.entryCount} entries to ${config.zoteroFile}.`)
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error))
      } finally {
        setBusy(null)
      }
    },
    [collections, config.zoteroCollection, config.zoteroFile, port, projectRoot, targetFile]
  )

  if (busy === 'load') {
    return (
      <div className="research-empty">
        <Loader className="spin" size={18} /> Loading Zotero…
      </div>
    )
  }

  return (
    <section className="research-reference-view" aria-label="Zotero references">
      <div className="research-config-row">
        <button
          type="button"
          onClick={() => void saveConfig()}
          disabled={busy !== null}
          title="Save research settings"
        >
          <Save size={14} />
        </button>
        <button
          type="button"
          onClick={() => void syncCollection(true)}
          disabled={busy !== null || !config.zoteroCollection || !projectRoot}
          title="Synchronize selected collection"
        >
          {busy === 'sync' ? <Loader className="spin" size={14} /> : <RefreshCw size={14} />}
        </button>
      </div>
      <div className="zotero-collection-tree" role="tree" aria-label="Zotero collections">
        {collectionRows.length === 0 ? (
          <div className="research-muted">No Zotero collections found.</div>
        ) : (
          collectionRows.map(({ collection, depth }) => (
            <button
              type="button"
              draggable
              role="treeitem"
              aria-selected={config.zoteroCollection === collection.key}
              className={config.zoteroCollection === collection.key ? 'active' : ''}
              style={{ paddingLeft: 10 + depth * 16 }}
              key={collection.key}
              onClick={() =>
                setConfig((current) => ({ ...current, zoteroCollection: collection.key }))
              }
              onDragStart={(event) => setZoteroCollectionDragData(event, { collection, port })}
            >
              <span>{collection.name}</span>
              <small>{collection.itemCount}</small>
            </button>
          ))
        )}
      </div>
      <label className="research-check-row">
        <input
          type="checkbox"
          checked={config.syncOnOpen}
          onChange={(event) =>
            setConfig((current) => ({ ...current, syncOnOpen: event.target.checked }))
          }
        />
        Keep synchronized when this project opens
      </label>
      <form className="research-search" onSubmit={search}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={1_024}
          placeholder="Search Zotero library"
          aria-label="Search Zotero library"
        />
        <button type="submit" disabled={!query.trim() || busy !== null} aria-label="Search">
          {busy === 'search' ? <Loader className="spin" size={15} /> : <Search size={15} />}
        </button>
      </form>
      <div className="reference-card-list">
        {results.map((item) => (
          <article
            className="reference-card"
            key={item.citekey}
            draggable
            onDragStart={(event) =>
              setReferenceDragData(event, { source: 'zotero', citekey: item.citekey, port })
            }
          >
            <div>
              <strong>{item.title || item.citekey}</strong>
              <span>@{item.citekey}</span>
            </div>
            <span>
              {item.author || 'Unknown author'}
              {item.year ? ` · ${item.year}` : ''}
            </span>
            <div className="reference-card-actions">
              <button type="button" onClick={() => void add(item)} disabled={busy !== null}>
                {busy === item.citekey ? <Loader className="spin" size={13} /> : <Plus size={13} />}
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

function orderCollections(
  collections: ZoteroCollection[]
): Array<{ collection: ZoteroCollection; depth: number }> {
  const children = new Map<string | null, ZoteroCollection[]>()
  const known = new Set(collections.map((collection) => collection.key))
  for (const collection of collections) {
    const parent =
      collection.parentKey && known.has(collection.parentKey) ? collection.parentKey : null
    const siblings = children.get(parent) ?? []
    siblings.push(collection)
    children.set(parent, siblings)
  }
  for (const siblings of children.values()) {
    siblings.sort((left, right) => left.name.localeCompare(right.name))
  }
  const rows: Array<{ collection: ZoteroCollection; depth: number }> = []
  const visit = (parent: string | null, depth: number) => {
    for (const collection of children.get(parent) ?? []) {
      rows.push({ collection, depth })
      visit(collection.key, depth + 1)
    }
  }
  visit(null, 0)
  return rows
}
