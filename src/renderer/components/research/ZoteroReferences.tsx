import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ChevronRight,
  Loader,
  MessageSquarePlus,
  Plus,
  RefreshCw,
  Save,
  Search
} from 'lucide-react'
import type { ResearchConfig, ZoteroCollection, ZoteroSearchResult } from '../../../shared/types'
import { useProjectStore } from '../../store/useProjectStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import {
  addReferenceAtCursor,
  setReferenceDragData,
  setZoteroCollectionDragData,
  type ReferenceDragPayload
} from './referenceActions'

const DEFAULT_CONFIG: ResearchConfig = {
  version: 1,
  referencesFile: 'references.bib',
  zoteroFile: 'zotero.bib',
  zoteroCollection: null,
  syncOnOpen: false
}

const COLLECTION_PAGE_SIZE = 200

type CollectionRow = {
  collection: ZoteroCollection
  depth: number
  parentKey: string | null
  hasChildren: boolean
}

interface ZoteroReferencesProps {
  onAddToChat?: (payload: ReferenceDragPayload) => void
}

function buildZoteroReferencePayload(item: ZoteroSearchResult, port: number): ReferenceDragPayload {
  return {
    source: 'zotero',
    citekey: item.citekey,
    port,
    metadata: {
      title: item.title,
      authors: item.author
        .split(/\s+and\s+/u)
        .map((author) => author.trim())
        .filter(Boolean),
      year: item.year,
      type: item.type
    }
  }
}

export function ZoteroReferences({ onAddToChat }: ZoteroReferencesProps = {}) {
  const projectRoot = useProjectStore((state) => state.projectRoot)
  const query = useProjectStore((state) => state.researchSearchQuery)
  const setQuery = useProjectStore((state) => state.setResearchSearchQuery)
  const port = useSettingsStore((state) => state.settings.zoteroPort)
  const [results, setResults] = useState<ZoteroSearchResult[]>([])
  const [collections, setCollections] = useState<ZoteroCollection[]>([])
  const [config, setConfig] = useState<ResearchConfig>(DEFAULT_CONFIG)
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(() => new Set())
  const [collectionLimit, setCollectionLimit] = useState(COLLECTION_PAGE_SIZE)
  const [focusedCollection, setFocusedCollection] = useState<string | null>(null)
  const [busy, setBusy] = useState<'load' | 'search' | 'save' | 'sync' | string | null>('load')
  const [message, setMessage] = useState('')
  const scopeGeneration = useRef(0)
  const operationInFlight = useRef(false)
  const collectionRefs = useRef(new Map<string, HTMLButtonElement>())

  const isCurrentScope = useCallback((generation: number, root: string | null, apiPort: number) => {
    return (
      scopeGeneration.current === generation &&
      useProjectStore.getState().projectRoot === root &&
      useSettingsStore.getState().settings.zoteroPort === apiPort
    )
  }, [])

  useEffect(() => {
    const generation = ++scopeGeneration.current
    const root = projectRoot
    const apiPort = port
    operationInFlight.current = true
    setBusy('load')
    setMessage('')
    setResults([])
    setCollections([])
    setConfig(DEFAULT_CONFIG)
    setExpandedCollections(new Set())
    setCollectionLimit(COLLECTION_PAGE_SIZE)
    setFocusedCollection(null)
    Promise.all([window.api.researchLoadConfig(), window.api.zoteroCollections(port)])
      .then(([loadedConfig, loadedCollections]) => {
        if (!isCurrentScope(generation, root, apiPort)) return
        setConfig(loadedConfig)
        setCollections(loadedCollections)
        const rows = orderCollections(loadedCollections)
        const expanded = expandedAncestors(rows, loadedConfig.zoteroCollection)
        setExpandedCollections(expanded)
        const selectedIndex = filterExpandedCollections(rows, expanded).findIndex(
          ({ collection }) => collection.key === loadedConfig.zoteroCollection
        )
        setCollectionLimit(
          selectedIndex < 0
            ? COLLECTION_PAGE_SIZE
            : Math.max(
                COLLECTION_PAGE_SIZE,
                Math.ceil((selectedIndex + 1) / COLLECTION_PAGE_SIZE) * COLLECTION_PAGE_SIZE
              )
        )
      })
      .catch((error) => {
        if (isCurrentScope(generation, root, apiPort)) {
          setMessage(error instanceof Error ? error.message : String(error))
        }
      })
      .finally(() => {
        if (isCurrentScope(generation, root, apiPort)) {
          operationInFlight.current = false
          setBusy(null)
        }
      })
    return () => {
      if (scopeGeneration.current === generation) scopeGeneration.current += 1
    }
  }, [isCurrentScope, port, projectRoot])

  const targetFile = useMemo(() => {
    if (!projectRoot) return undefined
    const separator = projectRoot.includes('\\') ? '\\' : '/'
    return `${projectRoot.replace(/[\\/]$/, '')}${separator}${config.zoteroFile}`
  }, [config.zoteroFile, projectRoot])

  const collectionRows = useMemo(() => orderCollections(collections), [collections])
  const visibleCollectionRows = useMemo(
    () => filterExpandedCollections(collectionRows, expandedCollections),
    [collectionRows, expandedCollections]
  )
  const renderedCollectionRows = useMemo(
    () => visibleCollectionRows.slice(0, collectionLimit),
    [collectionLimit, visibleCollectionRows]
  )
  const activeCollectionKey =
    focusedCollection &&
    renderedCollectionRows.some(({ collection }) => collection.key === focusedCollection)
      ? focusedCollection
      : (renderedCollectionRows.find(({ collection }) => collection.key === config.zoteroCollection)
          ?.collection.key ??
        renderedCollectionRows[0]?.collection.key ??
        null)

  const focusCollection = useCallback((key: string) => {
    setFocusedCollection(key)
    collectionRefs.current.get(key)?.focus()
  }, [])

  const toggleCollection = useCallback((key: string) => {
    setExpandedCollections((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const handleCollectionKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, row: CollectionRow, index: number) => {
      let targetIndex: number | null = null
      switch (event.key) {
        case 'ArrowDown':
          targetIndex = Math.min(index + 1, renderedCollectionRows.length - 1)
          break
        case 'ArrowUp':
          targetIndex = Math.max(index - 1, 0)
          break
        case 'Home':
          targetIndex = 0
          break
        case 'End':
          targetIndex = renderedCollectionRows.length - 1
          break
        case 'ArrowRight':
          if (!row.hasChildren) return
          if (!expandedCollections.has(row.collection.key)) {
            event.preventDefault()
            if (
              index === renderedCollectionRows.length - 1 &&
              renderedCollectionRows.length === collectionLimit
            ) {
              setCollectionLimit((current) => current + COLLECTION_PAGE_SIZE)
            }
            toggleCollection(row.collection.key)
            return
          }
          if (renderedCollectionRows[index + 1]?.parentKey === row.collection.key) {
            targetIndex = index + 1
          }
          break
        case 'ArrowLeft':
          if (row.hasChildren && expandedCollections.has(row.collection.key)) {
            event.preventDefault()
            toggleCollection(row.collection.key)
            return
          }
          if (row.parentKey) {
            targetIndex = renderedCollectionRows.findIndex(
              ({ collection }) => collection.key === row.parentKey
            )
          }
          break
        default:
          return
      }
      if (targetIndex === null || targetIndex < 0) return
      event.preventDefault()
      const target = renderedCollectionRows[targetIndex]
      if (target) focusCollection(target.collection.key)
    },
    [
      collectionLimit,
      expandedCollections,
      focusCollection,
      renderedCollectionRows,
      toggleCollection
    ]
  )

  const search = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      const normalized = query.trim()
      if (!normalized || operationInFlight.current) return
      const generation = scopeGeneration.current
      const root = projectRoot
      const apiPort = port
      operationInFlight.current = true
      setBusy('search')
      setMessage('')
      try {
        const items = await window.api.zoteroSearch(normalized, port)
        if (!isCurrentScope(generation, root, apiPort)) return
        setResults(items)
        if (items.length === 0) setMessage('No matching Zotero items found.')
      } catch (error) {
        if (isCurrentScope(generation, root, apiPort)) {
          setMessage(error instanceof Error ? error.message : String(error))
        }
      } finally {
        if (isCurrentScope(generation, root, apiPort)) {
          operationInFlight.current = false
          setBusy(null)
        }
      }
    },
    [isCurrentScope, port, projectRoot, query]
  )

  const add = useCallback(
    async (item: ZoteroSearchResult) => {
      if (operationInFlight.current) return
      const generation = scopeGeneration.current
      const root = projectRoot
      const apiPort = port
      operationInFlight.current = true
      setBusy(item.citekey)
      setMessage('')
      try {
        const inserted = await addReferenceAtCursor({
          source: 'zotero',
          citekey: item.citekey,
          port
        })
        if (isCurrentScope(generation, root, apiPort)) {
          setMessage(
            inserted
              ? `Added @${item.citekey} and inserted its citation.`
              : `Added @${item.citekey} to the project bibliography, but the editor changed before citation insertion.`
          )
        }
      } catch (error) {
        if (isCurrentScope(generation, root, apiPort)) {
          setMessage(error instanceof Error ? error.message : String(error))
        }
      } finally {
        if (isCurrentScope(generation, root, apiPort)) {
          operationInFlight.current = false
          setBusy(null)
        }
      }
    },
    [isCurrentScope, port, projectRoot]
  )

  const saveConfig = useCallback(async () => {
    if (operationInFlight.current) return
    const generation = scopeGeneration.current
    const root = projectRoot
    const apiPort = port
    operationInFlight.current = true
    setBusy('save')
    setMessage('')
    try {
      const saved = await window.api.researchSaveConfig(config)
      if (!isCurrentScope(generation, root, apiPort)) return
      setConfig(saved)
      setMessage('Research settings saved.')
    } catch (error) {
      if (isCurrentScope(generation, root, apiPort)) {
        setMessage(error instanceof Error ? error.message : String(error))
      }
    } finally {
      if (isCurrentScope(generation, root, apiPort)) {
        operationInFlight.current = false
        setBusy(null)
      }
    }
  }, [config, isCurrentScope, port, projectRoot])

  const syncCollection = useCallback(
    async (confirmFirst = true) => {
      if (!config.zoteroCollection || !targetFile || operationInFlight.current) return
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
      const generation = scopeGeneration.current
      const root = projectRoot
      const apiPort = port
      operationInFlight.current = true
      setBusy('sync')
      setMessage('')
      try {
        const result = await window.api.zoteroSyncCollection(
          config.zoteroCollection,
          targetFile,
          port
        )
        if (!isCurrentScope(generation, root, apiPort)) return
        if (root) {
          const entries = await window.api.findBibInProject(root)
          if (!isCurrentScope(generation, root, apiPort)) return
          useProjectStore.getState().setBibEntries(entries)
          useProjectStore.getState().invalidateDirectory(root)
        }
        setMessage(`Synchronized ${result.entryCount} entries to ${config.zoteroFile}.`)
      } catch (error) {
        if (isCurrentScope(generation, root, apiPort)) {
          setMessage(error instanceof Error ? error.message : String(error))
        }
      } finally {
        if (isCurrentScope(generation, root, apiPort)) {
          operationInFlight.current = false
          setBusy(null)
        }
      }
    },
    [
      collections,
      config.zoteroCollection,
      config.zoteroFile,
      isCurrentScope,
      port,
      projectRoot,
      targetFile
    ]
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
          aria-label="Save research settings"
        >
          <Save size={14} />
        </button>
        <button
          type="button"
          onClick={() => void syncCollection(true)}
          disabled={busy !== null || !config.zoteroCollection || !projectRoot}
          title="Synchronize selected collection"
          aria-label="Synchronize selected collection"
        >
          {busy === 'sync' ? <Loader className="spin" size={14} /> : <RefreshCw size={14} />}
        </button>
      </div>
      <div className="zotero-collection-tree" role="tree" aria-label="Zotero collections">
        {collectionRows.length === 0 ? (
          <div className="research-muted">No Zotero collections found.</div>
        ) : (
          renderedCollectionRows.map((row, index) => (
            <button
              type="button"
              draggable
              role="treeitem"
              aria-level={row.depth + 1}
              aria-expanded={
                row.hasChildren ? expandedCollections.has(row.collection.key) : undefined
              }
              aria-selected={config.zoteroCollection === row.collection.key}
              className={config.zoteroCollection === row.collection.key ? 'active' : ''}
              style={{ paddingLeft: 8 + row.depth * 16 }}
              tabIndex={activeCollectionKey === row.collection.key ? 0 : -1}
              key={row.collection.key}
              ref={(element) => {
                if (element) collectionRefs.current.set(row.collection.key, element)
                else collectionRefs.current.delete(row.collection.key)
              }}
              onFocus={() => setFocusedCollection(row.collection.key)}
              onKeyDown={(event) => handleCollectionKeyDown(event, row, index)}
              onClick={() => {
                setConfig((current) => ({ ...current, zoteroCollection: row.collection.key }))
                if (row.hasChildren) {
                  if (
                    !expandedCollections.has(row.collection.key) &&
                    index === renderedCollectionRows.length - 1 &&
                    renderedCollectionRows.length === collectionLimit
                  ) {
                    setCollectionLimit((current) => current + COLLECTION_PAGE_SIZE)
                  }
                  toggleCollection(row.collection.key)
                }
              }}
              onDragStart={(event) =>
                setZoteroCollectionDragData(event, { collection: row.collection, port })
              }
            >
              <ChevronRight
                className={
                  row.hasChildren && expandedCollections.has(row.collection.key)
                    ? 'collection-chevron expanded'
                    : 'collection-chevron'
                }
                size={13}
                aria-hidden="true"
              />
              <span>{row.collection.name}</span>
              <small>{row.collection.itemCount}</small>
            </button>
          ))
        )}
      </div>
      {visibleCollectionRows.length > renderedCollectionRows.length && (
        <button
          type="button"
          className="zotero-show-more"
          onClick={() => setCollectionLimit((current) => current + COLLECTION_PAGE_SIZE)}
        >
          Show more collections ({visibleCollectionRows.length - renderedCollectionRows.length})
        </button>
      )}
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
      <div
        className="reference-card-list"
        role="region"
        aria-label="Zotero search results"
        tabIndex={results.length > 0 ? 0 : -1}
      >
        {results.map((item) => (
          <article
            className="reference-card"
            key={item.citekey}
            draggable
            onDragStart={(event) =>
              setReferenceDragData(event, buildZoteroReferencePayload(item, port))
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
              {onAddToChat && (
                <button
                  type="button"
                  onClick={() => onAddToChat(buildZoteroReferencePayload(item, port))}
                  aria-label={`Add ${item.title || item.citekey} to Chat`}
                >
                  <MessageSquarePlus size={13} /> Add to Chat
                </button>
              )}
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

function orderCollections(collections: ZoteroCollection[]): CollectionRow[] {
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
  const rows: CollectionRow[] = []
  const visited = new Set<string>()
  const append = (roots: ZoteroCollection[], depth: number, parentKey: string | null): void => {
    const stack = roots
      .slice()
      .reverse()
      .map((collection) => ({ collection, depth, parentKey }))
    while (stack.length > 0) {
      const next = stack.pop()
      if (!next || visited.has(next.collection.key)) continue
      visited.add(next.collection.key)
      rows.push({ ...next, hasChildren: false })
      const descendants = children.get(next.collection.key) ?? []
      for (let index = descendants.length - 1; index >= 0; index -= 1) {
        stack.push({
          collection: descendants[index],
          depth: next.depth + 1,
          parentKey: next.collection.key
        })
      }
    }
  }
  append(children.get(null) ?? [], 0, null)
  // Malformed parent cycles should not hide the rest of the library or recurse forever.
  for (const collection of collections) {
    if (visited.has(collection.key)) continue
    append([collection], 0, null)
  }
  const renderedParents = new Set(rows.flatMap((row) => (row.parentKey ? [row.parentKey] : [])))
  for (const row of rows) row.hasChildren = renderedParents.has(row.collection.key)
  return rows
}

function filterExpandedCollections(rows: CollectionRow[], expanded: Set<string>): CollectionRow[] {
  const hiddenDepths: number[] = []
  return rows.filter((row) => {
    while (hiddenDepths.length > 0 && row.depth <= hiddenDepths[hiddenDepths.length - 1]) {
      hiddenDepths.pop()
    }
    const hidden = hiddenDepths.length > 0
    if (!expanded.has(row.collection.key)) hiddenDepths.push(row.depth)
    return !hidden
  })
}

function expandedAncestors(rows: CollectionRow[], selectedKey: string | null): Set<string> {
  if (!selectedKey) return new Set()
  const byKey = new Map(rows.map((row) => [row.collection.key, row]))
  const expanded = new Set<string>()
  const visited = new Set<string>()
  let parent = byKey.get(selectedKey)?.parentKey ?? null
  while (parent && !visited.has(parent)) {
    visited.add(parent)
    expanded.add(parent)
    parent = byKey.get(parent)?.parentKey ?? null
  }
  return expanded
}
