import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Check,
  ChevronRight,
  Circle,
  BookMarked,
  FileCheck2,
  FolderTree,
  Loader,
  MessageSquarePlus,
  Plus,
  RefreshCw,
  Save,
  Search
} from 'lucide-react'
import type {
  CitationLocation,
  CitationUsage,
  ResearchConfig,
  ZoteroCollectionItem,
  ZoteroLibrary,
  ZoteroSearchResult
} from '../../../shared/types'
import { useProjectStore } from '../../store/useProjectStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useEditorStore } from '../../store/useEditorStore'
import { useCompileStore } from '../../store/useCompileStore'
import { cacheZoteroInventory, getCachedZoteroInventory } from '../../services/zoteroInventoryCache'
import { navigateToDiagnostic } from '../../services/diagnosticNavigation'
import {
  addReferenceAtCursor,
  setReferenceDragData,
  setZoteroCollectionDragData,
  type ReferenceDragPayload
} from './referenceActions'
import {
  buildReferenceHealth,
  type ProjectReferenceHealth,
  type ZoteroReferenceHealth
} from '../../services/referenceHealth'
import {
  expandedZoteroAncestors,
  filterExpandedZoteroCollections,
  orderZoteroCollections,
  type ZoteroCollectionRow
} from '../../services/zoteroCollectionTree'
import {
  loadAllZoteroCollectionItems,
  scanCurrentCitationUsages
} from '../../services/zoteroReferenceInventory'
import { ProjectReferenceCard } from './ProjectReferenceCard'

const DEFAULT_CONFIG: ResearchConfig = {
  version: 1,
  referencesFile: 'references.bib',
  zoteroFile: 'zotero.bib',
  zoteroCollection: null,
  syncOnOpen: false
}

const COLLECTION_PAGE_SIZE = 200
const ITEM_PAGE_SIZE = 50
const COUNT_PREFETCH_LIMIT = 40
const CITATION_REFRESH_DELAY_MS = 500

interface ZoteroReferencesProps {
  onAddToChat?: (payload: ReferenceDragPayload) => void
  onOpenProjectGroups?: () => void
  onSearchOnline?: () => void
  onOpenProblems?: () => void
  onOpenSubmission?: () => void
}

type CollectionInventory = {
  items: ZoteroCollectionItem[]
  totalResults: number
}

type SyncPreview = {
  added: string[]
  removed: string[]
  unchanged: number
  unresolved: number
}

type HealthFilter = 'all' | 'cited' | 'missing' | 'unused' | 'zotero'

function matchesProjectFilter(
  status: ProjectReferenceHealth,
  filter: HealthFilter,
  zoteroReady: boolean
): boolean {
  if (filter === 'cited') return status.citationCount > 0
  if (filter === 'missing') return zoteroReady && status.zoteroItem === null
  if (filter === 'unused') return status.citationCount === 0
  if (filter === 'zotero') return false
  return true
}

function matchesZoteroFilter(status: ZoteroReferenceHealth, filter: HealthFilter): boolean {
  if (filter === 'cited') return status.citationCount > 0
  if (filter === 'missing') return false
  if (filter === 'unused') return status.projectEntry !== null && status.citationCount === 0
  return true
}

function buildZoteroReferencePayload(item: ZoteroSearchResult, port: number): ReferenceDragPayload {
  return {
    source: 'zotero',
    citekey: item.citekey,
    port,
    metadata: {
      title: item.title,
      authors: item.author
        .split(/\s+and\s+|;\s*/u)
        .map((author) => author.trim())
        .filter(Boolean),
      year: item.year,
      type: item.type
    }
  }
}

export function ZoteroReferences({
  onAddToChat,
  onOpenProjectGroups,
  onSearchOnline,
  onOpenProblems,
  onOpenSubmission
}: ZoteroReferencesProps = {}) {
  const projectRoot = useProjectStore((state) => state.projectRoot)
  const query = useProjectStore((state) => state.researchSearchQuery)
  const setQuery = useProjectStore((state) => state.setResearchSearchQuery)
  const bibEntries = useProjectStore((state) => state.bibEntries)
  const port = useSettingsStore((state) => state.settings.zoteroPort)
  const compileDiagnosticCount = useCompileStore((state) => state.diagnostics.length)
  const [results, setResults] = useState<ZoteroSearchResult[]>([])
  const [libraries, setLibraries] = useState<ZoteroLibrary[]>([])
  const [config, setConfig] = useState<ResearchConfig>(DEFAULT_CONFIG)
  const [libraryExpanded, setLibraryExpanded] = useState(true)
  const [selectedCollectionKey, setSelectedCollectionKey] = useState<string | null>(null)
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(() => new Set())
  const [collectionLimit, setCollectionLimit] = useState(COLLECTION_PAGE_SIZE)
  const [focusedCollection, setFocusedCollection] = useState<string | null>(null)
  const [inventory, setInventory] = useState<CollectionInventory | null>(null)
  const [inventoryBusy, setInventoryBusy] = useState(false)
  const [syncPreview, setSyncPreview] = useState<SyncPreview | null>(null)
  const [syncPreviewBusy, setSyncPreviewBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [citationUsages, setCitationUsages] = useState<CitationUsage[]>([])
  const [libraryInventory, setLibraryInventory] = useState<ZoteroCollectionItem[]>([])
  const [libraryInventoryLoaded, setLibraryInventoryLoaded] = useState(false)
  const [libraryInventoryError, setLibraryInventoryError] = useState('')
  const [zoteroAvailable, setZoteroAvailable] = useState<boolean | null>(null)
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all')
  const [lastLocalSearch, setLastLocalSearch] = useState('')
  const [busy, setBusy] = useState<'load' | 'search' | 'save' | 'sync' | string | null>('load')
  const [message, setMessage] = useState('')
  const scopeGeneration = useRef(0)
  const operationInFlight = useRef(false)
  const collectionRefs = useRef(new Map<string, HTMLButtonElement>())
  const requestedCounts = useRef(new Set<string>())

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
    setLibraries([])
    setConfig(DEFAULT_CONFIG)
    setLibraryExpanded(true)
    setSelectedCollectionKey(null)
    setExpandedCollections(new Set())
    setCollectionLimit(COLLECTION_PAGE_SIZE)
    setFocusedCollection(null)
    setInventory(null)
    setInventoryBusy(false)
    setSyncPreview(null)
    setSyncPreviewBusy(false)
    setLoaded(false)
    setCitationUsages([])
    setLibraryInventory([])
    setLibraryInventoryLoaded(false)
    setLibraryInventoryError('')
    setZoteroAvailable(null)
    setHealthFilter('all')
    setLastLocalSearch('')
    requestedCounts.current.clear()
    Promise.all([
      window.api.researchLoadConfig(),
      window.api.zoteroLibraryTree(port).then(
        (loadedLibraries) => ({ loadedLibraries, zoteroError: '' }),
        (error: unknown) => ({
          loadedLibraries: [] as ZoteroLibrary[],
          zoteroError: error instanceof Error ? error.message : String(error)
        })
      ),
      root
        ? scanCurrentCitationUsages(root).then(
            (loadedCitations) => ({ loadedCitations, citationError: '' }),
            (error: unknown) => ({
              loadedCitations: [] as CitationUsage[],
              citationError: error instanceof Error ? error.message : String(error)
            })
          )
        : Promise.resolve({ loadedCitations: [] as CitationUsage[], citationError: '' })
    ])
      .then(([loadedConfig, zoteroResult, citationResult]) => {
        if (!isCurrentScope(generation, root, apiPort)) return
        setLibraries(zoteroResult.loadedLibraries)
        setZoteroAvailable(!zoteroResult.zoteroError)
        setMessage(
          [zoteroResult.zoteroError, citationResult.citationError].filter(Boolean).join('\n')
        )
        setCitationUsages(citationResult.loadedCitations)
        setLoaded(true)
        const loadedLibraries = zoteroResult.loadedLibraries
        const loadedCollections = loadedLibraries.flatMap((library) => library.collections)
        const configuredCollectionExists = loadedCollections.some(
          (collection) => collection.key === loadedConfig.zoteroCollection
        )
        const effectiveConfig =
          !zoteroResult.zoteroError && !configuredCollectionExists
            ? { ...loadedConfig, zoteroCollection: null, syncOnOpen: false }
            : loadedConfig
        setConfig(effectiveConfig)
        setSelectedCollectionKey(
          configuredCollectionExists
            ? effectiveConfig.zoteroCollection
            : (loadedLibraries[0]?.key ?? null)
        )
        const rows = orderZoteroCollections(loadedCollections)
        const expanded = expandedZoteroAncestors(rows, effectiveConfig.zoteroCollection)
        setExpandedCollections(expanded)
        const selectedIndex = filterExpandedZoteroCollections(rows, expanded).findIndex(
          ({ collection }) => collection.key === effectiveConfig.zoteroCollection
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

  useEffect(() => {
    if (!loaded || !projectRoot) return
    const root = projectRoot
    const apiPort = port
    const generation = scopeGeneration.current
    let refreshGeneration = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    const scheduleRefresh = () => {
      refreshGeneration += 1
      const requestedRefresh = refreshGeneration
      clearTimeout(timer)
      timer = setTimeout(() => {
        void scanCurrentCitationUsages(root).then(
          (usages) => {
            if (
              requestedRefresh === refreshGeneration &&
              isCurrentScope(generation, root, apiPort)
            ) {
              setCitationUsages(usages)
            }
          },
          () => undefined
        )
      }, CITATION_REFRESH_DELAY_MS)
    }

    const unsubscribeRevision = useEditorStore.subscribe((state) => state.revision, scheduleRefresh)
    const unsubscribeProjectIndex = useProjectStore.subscribe(
      (state) => state.projectIndex?.generation ?? 0,
      scheduleRefresh
    )
    return () => {
      refreshGeneration += 1
      clearTimeout(timer)
      unsubscribeRevision()
      unsubscribeProjectIndex()
    }
  }, [isCurrentScope, loaded, port, projectRoot])

  const targetFile = useMemo(() => {
    if (!projectRoot) return undefined
    const separator = projectRoot.includes('\\') ? '\\' : '/'
    return `${projectRoot.replace(/[\\/]$/, '')}${separator}${config.zoteroFile}`
  }, [config.zoteroFile, projectRoot])

  const library = libraries[0] ?? null
  const libraryKey = library?.key ?? null
  const collections = useMemo(
    () => libraries.flatMap((candidate) => candidate.collections),
    [libraries]
  )
  const collectionRows = useMemo(() => orderZoteroCollections(collections), [collections])
  const visibleCollectionRows = useMemo(
    () =>
      libraryExpanded ? filterExpandedZoteroCollections(collectionRows, expandedCollections) : [],
    [collectionRows, expandedCollections, libraryExpanded]
  )
  const renderedCollectionRows = useMemo(
    () => visibleCollectionRows.slice(0, collectionLimit),
    [collectionLimit, visibleCollectionRows]
  )
  const activeCollectionKey =
    focusedCollection &&
    (focusedCollection === library?.key ||
      renderedCollectionRows.some(({ collection }) => collection.key === focusedCollection))
      ? focusedCollection
      : (renderedCollectionRows.find(({ collection }) => collection.key === selectedCollectionKey)
          ?.collection.key ??
        library?.key ??
        null)

  const configuredCollection = useMemo(
    () => collections.find((collection) => collection.key === config.zoteroCollection) ?? null,
    [collections, config.zoteroCollection]
  )
  const viewedCollection = useMemo(() => {
    if (library && selectedCollectionKey === library.key) {
      return {
        key: library.key,
        name: library.name,
        parentKey: null,
        itemCount: library.itemCount
      }
    }
    return collections.find((collection) => collection.key === selectedCollectionKey) ?? null
  }, [collections, library, selectedCollectionKey])
  const projectCitekeys = useMemo(() => new Set(bibEntries.map((entry) => entry.key)), [bibEntries])
  const referenceHealth = useMemo(
    () => buildReferenceHealth(bibEntries, citationUsages, libraryInventory),
    [bibEntries, citationUsages, libraryInventory]
  )
  const zoteroHealthByItemKey = useMemo(
    () => new Map(referenceHealth.zotero.map((status) => [status.item.itemKey, status])),
    [referenceHealth.zotero]
  )
  const inventoryProjectCount = useMemo(
    () =>
      inventory?.items.filter((item) => {
        const status = zoteroHealthByItemKey.get(item.itemKey)
        if (status) return status.projectEntry !== null
        return item.citekey ? projectCitekeys.has(item.citekey) : false
      }).length ?? 0,
    [inventory, projectCitekeys, zoteroHealthByItemKey]
  )
  const selectedZoteroOnlyCount = (inventory?.items.length ?? 0) - inventoryProjectCount
  const normalizedQuery = query.trim().toLocaleLowerCase('en-US')
  const projectSearchResults = useMemo(
    () =>
      normalizedQuery
        ? referenceHealth.project.filter(({ entry }) =>
            [entry.key, entry.title, entry.author, entry.year].some((value) =>
              value.toLocaleLowerCase('en-US').includes(normalizedQuery)
            )
          )
        : [],
    [normalizedQuery, referenceHealth.project]
  )
  const localSearchResultCount = projectSearchResults.length + results.length
  const issueCount =
    referenceHealth.missingCitations.length +
    referenceHealth.duplicateCount +
    (zoteroAvailable && libraryInventoryLoaded && !libraryInventoryError
      ? referenceHealth.projectOnlyCount
      : 0)
  const selectedInventoryKeys = useMemo(
    () => new Set(inventory?.items.map((item) => item.itemKey) ?? []),
    [inventory]
  )
  const visibleProjectReferences = useMemo(
    () =>
      referenceHealth.project.filter(
        (status) =>
          matchesProjectFilter(
            status,
            healthFilter,
            zoteroAvailable === true && libraryInventoryLoaded && !libraryInventoryError
          ) &&
          (!status.zoteroItem || !selectedInventoryKeys.has(status.zoteroItem.itemKey))
      ),
    [
      healthFilter,
      libraryInventoryLoaded,
      libraryInventoryError,
      referenceHealth.project,
      selectedInventoryKeys,
      zoteroAvailable
    ]
  )
  const visibleInventoryItems = useMemo(
    () =>
      inventory?.items.filter((item) => {
        const status = zoteroHealthByItemKey.get(item.itemKey)
        if (status) return matchesZoteroFilter(status, healthFilter)
        const inProject = item.citekey ? projectCitekeys.has(item.citekey) : false
        if (healthFilter === 'cited') return false
        if (healthFilter === 'unused') return inProject
        if (healthFilter === 'missing') return false
        return true
      }) ?? [],
    [healthFilter, inventory, projectCitekeys, zoteroHealthByItemKey]
  )

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

  const updateCollectionCount = useCallback((key: string, itemCount: number) => {
    setLibraries((current) =>
      current.map((candidate) => ({
        ...candidate,
        collections: candidate.collections.map((collection) =>
          collection.key === key ? { ...collection, itemCount } : collection
        )
      }))
    )
  }, [])

  useEffect(() => {
    if (!loaded) return
    const candidates = renderedCollectionRows
      .slice(0, COUNT_PREFETCH_LIMIT)
      .map(({ collection }) => collection)
      .filter(
        (collection) =>
          collection.itemCount === null && !requestedCounts.current.has(collection.key)
      )
    if (candidates.length === 0) return
    const generation = scopeGeneration.current
    const root = projectRoot
    const apiPort = port
    let cancelled = false
    void (async () => {
      for (let index = 0; index < candidates.length; index += 4) {
        const batch = candidates.slice(index, index + 4)
        for (const collection of batch) requestedCounts.current.add(collection.key)
        const pages = await Promise.all(
          batch.map((collection) =>
            window.api
              .zoteroCollectionItems(collection.key, 0, 0, port)
              .then((page) => ({ key: collection.key, count: page.totalResults }))
              .catch(() => null)
          )
        )
        if (cancelled || !isCurrentScope(generation, root, apiPort)) return
        for (const page of pages) {
          if (page) updateCollectionCount(page.key, page.count)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isCurrentScope, loaded, port, projectRoot, renderedCollectionRows, updateCollectionCount])

  useEffect(() => {
    const collectionKey = selectedCollectionKey
    if (!collectionKey || !loaded) {
      setInventory(null)
      setInventoryBusy(false)
      return
    }
    const generation = scopeGeneration.current
    const root = projectRoot
    const apiPort = port
    let cancelled = false
    setInventory(null)
    setInventoryBusy(true)
    setResults([])
    setSyncPreview(null)
    void window.api
      .zoteroCollectionItems(collectionKey, 0, ITEM_PAGE_SIZE, port)
      .then((page) => {
        if (cancelled || !isCurrentScope(generation, root, apiPort)) return
        setInventory({ items: page.items, totalResults: page.totalResults })
        updateCollectionCount(collectionKey, page.totalResults)
      })
      .catch((error) => {
        if (!cancelled && isCurrentScope(generation, root, apiPort)) {
          setMessage(error instanceof Error ? error.message : String(error))
        }
      })
      .finally(() => {
        if (!cancelled && isCurrentScope(generation, root, apiPort)) setInventoryBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [isCurrentScope, loaded, port, projectRoot, selectedCollectionKey, updateCollectionCount])

  useEffect(() => {
    if (!loaded) return
    if (!libraryKey) {
      setLibraryInventory([])
      setLibraryInventoryLoaded(true)
      setLibraryInventoryError('')
      return
    }
    const generation = scopeGeneration.current
    const root = projectRoot
    const apiPort = port
    let cancelled = false
    const cachedInventory = getCachedZoteroInventory(port, libraryKey)
    if (cachedInventory) {
      setLibraryInventory(cachedInventory)
      setLibraryInventoryLoaded(true)
      setLibraryInventoryError('')
      return
    }
    setLibraryInventory([])
    setLibraryInventoryLoaded(false)
    setLibraryInventoryError('')
    void loadAllZoteroCollectionItems(libraryKey, port)
      .then((items) => {
        if (cancelled || !isCurrentScope(generation, root, apiPort)) return
        setLibraryInventory(items)
        cacheZoteroInventory(port, libraryKey, items)
        setLibraryInventoryLoaded(true)
        setLibraryInventoryError('')
      })
      .catch((error) => {
        if (!cancelled && isCurrentScope(generation, root, apiPort)) {
          const detail = error instanceof Error ? error.message : String(error)
          setLibraryInventoryError(detail)
          setLibraryInventoryLoaded(true)
          setMessage(detail)
        }
      })
    return () => {
      cancelled = true
    }
  }, [isCurrentScope, libraryKey, loaded, port, projectRoot])

  const handleCollectionKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, row: ZoteroCollectionRow, index: number) => {
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
          } else if (library) {
            event.preventDefault()
            focusCollection(library.key)
            return
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
      library,
      renderedCollectionRows,
      toggleCollection
    ]
  )

  const handleLibraryKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (!library) return
      if (event.key === 'ArrowLeft' && libraryExpanded) {
        event.preventDefault()
        setLibraryExpanded(false)
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault()
        if (!libraryExpanded) {
          setLibraryExpanded(true)
        } else if (renderedCollectionRows[0]) {
          focusCollection(renderedCollectionRows[0].collection.key)
        }
      }
    },
    [focusCollection, library, libraryExpanded, renderedCollectionRows]
  )

  const runSearch = useCallback(
    async (searchQuery: string) => {
      const normalized = searchQuery.trim()
      if (!normalized || operationInFlight.current) return
      const generation = scopeGeneration.current
      const root = projectRoot
      const apiPort = port
      operationInFlight.current = true
      setBusy('search')
      setMessage('')
      try {
        const items =
          zoteroAvailable === false ? [] : await window.api.zoteroSearch(normalized, port)
        if (!isCurrentScope(generation, root, apiPort)) return
        setResults(items)
        setLastLocalSearch(normalized.toLocaleLowerCase('en-US'))
        const normalizedLower = normalized.toLocaleLowerCase('en-US')
        const hasProjectMatch = bibEntries.some((entry) =>
          [entry.key, entry.title, entry.author, entry.year].some((value) =>
            value.toLocaleLowerCase('en-US').includes(normalizedLower)
          )
        )
        if (items.length === 0 && !hasProjectMatch) {
          setMessage('No matching project or Zotero references found.')
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
    [bibEntries, isCurrentScope, port, projectRoot, zoteroAvailable]
  )

  const search = useCallback(
    (event: FormEvent) => {
      event.preventDefault()
      void runSearch(query)
    },
    [query, runSearch]
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

  const citeProjectReference = useCallback((citekey: string) => {
    useEditorStore.getState().requestInsertAtCursor(`\\cite{${citekey}}`)
  }, [])

  const openCitationLocation = useCallback((location: CitationLocation) => {
    void navigateToDiagnostic({
      file: location.file,
      line: location.line,
      column: 1,
      severity: 'info',
      message: 'Citation location'
    })
  }, [])

  const loadMoreInventory = useCallback(async () => {
    if (
      !selectedCollectionKey ||
      !inventory ||
      inventoryBusy ||
      inventory.items.length >= inventory.totalResults
    ) {
      return
    }
    const generation = scopeGeneration.current
    const root = projectRoot
    const apiPort = port
    setInventoryBusy(true)
    try {
      const page = await window.api.zoteroCollectionItems(
        selectedCollectionKey,
        inventory.items.length,
        ITEM_PAGE_SIZE,
        port
      )
      if (!isCurrentScope(generation, root, apiPort)) return
      setInventory((current) =>
        current
          ? {
              items: [
                ...current.items,
                ...page.items.filter(
                  (item) =>
                    !current.items.some((currentItem) => currentItem.itemKey === item.itemKey)
                )
              ],
              totalResults: page.totalResults
            }
          : { items: page.items, totalResults: page.totalResults }
      )
    } catch (error) {
      if (isCurrentScope(generation, root, apiPort)) {
        setMessage(error instanceof Error ? error.message : String(error))
      }
    } finally {
      if (isCurrentScope(generation, root, apiPort)) setInventoryBusy(false)
    }
  }, [inventory, inventoryBusy, isCurrentScope, port, projectRoot, selectedCollectionKey])

  const loadAllCollectionItems = useCallback(
    (collectionKey: string) => loadAllZoteroCollectionItems(collectionKey, port),
    [port]
  )

  const prepareSyncPreview = useCallback(async () => {
    if (!config.zoteroCollection || !targetFile || syncPreviewBusy || operationInFlight.current) {
      return
    }
    const generation = scopeGeneration.current
    const root = projectRoot
    const apiPort = port
    setSyncPreviewBusy(true)
    setMessage('')
    try {
      const collectionItems = await loadAllCollectionItems(config.zoteroCollection)
      if (!isCurrentScope(generation, root, apiPort)) return
      const currentEntries = await window.api.parseBibFile(targetFile)
      if (!isCurrentScope(generation, root, apiPort)) return
      const incoming = new Set(
        collectionItems.flatMap((item) => (item.citekey ? [item.citekey] : []))
      )
      const current = new Set(currentEntries.map((entry) => entry.key))
      setSyncPreview({
        added: [...incoming].filter((citekey) => !current.has(citekey)),
        removed: [...current].filter((citekey) => !incoming.has(citekey)),
        unchanged: [...incoming].filter((citekey) => current.has(citekey)).length,
        unresolved: collectionItems.filter((item) => !item.citekey).length
      })
    } catch (error) {
      if (isCurrentScope(generation, root, apiPort)) {
        setMessage(error instanceof Error ? error.message : String(error))
      }
    } finally {
      if (isCurrentScope(generation, root, apiPort)) setSyncPreviewBusy(false)
    }
  }, [
    config.zoteroCollection,
    isCurrentScope,
    loadAllCollectionItems,
    port,
    projectRoot,
    syncPreviewBusy,
    targetFile
  ])

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

  const syncCollection = useCallback(async () => {
    if (!config.zoteroCollection || !targetFile || operationInFlight.current) return
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
      setSyncPreview(null)
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
  }, [config.zoteroCollection, config.zoteroFile, isCurrentScope, port, projectRoot, targetFile])

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
        {onOpenProjectGroups && (
          <button
            type="button"
            onClick={onOpenProjectGroups}
            title="Project citation groups"
            aria-label="Project citation groups"
          >
            <BookMarked size={14} />
          </button>
        )}
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
          onClick={() => void prepareSyncPreview()}
          disabled={busy !== null || !configuredCollection || !projectRoot}
          title="Synchronize selected collection"
          aria-label="Synchronize selected collection"
        >
          {busy === 'sync' || syncPreviewBusy ? (
            <Loader className="spin" size={14} />
          ) : (
            <RefreshCw size={14} />
          )}
        </button>
      </div>
      <section className="reference-health" aria-label="Current paper reference health">
        <div className="reference-health-heading">
          <div>
            <strong>Current paper</strong>
            <span>
              {referenceHealth.citedCount} cited · {referenceHealth.bibliographyCount} bib ·{' '}
              {issueCount} issue{issueCount === 1 ? '' : 's'}
            </span>
          </div>
          <small>
            {zoteroAvailable === false
              ? 'Zotero unavailable'
              : libraryInventoryError
                ? 'Cross-check unavailable'
                : libraryInventoryLoaded
                  ? `${referenceHealth.linkedToZoteroCount} linked to Zotero`
                  : 'Cross-checking Zotero…'}
          </small>
        </div>
        {(referenceHealth.missingCitations.length > 0 ||
          referenceHealth.duplicateCount > 0 ||
          compileDiagnosticCount > 0 ||
          (zoteroAvailable &&
            libraryInventoryLoaded &&
            !libraryInventoryError &&
            referenceHealth.projectOnlyCount > 0)) && (
          <div className="reference-health-issues" role="status">
            {referenceHealth.missingCitations.length > 0 && (
              <span>⚠ {referenceHealth.missingCitations.length} missing bibliography</span>
            )}
            {referenceHealth.duplicateCount > 0 && (
              <span>⚠ {referenceHealth.duplicateCount} possible duplicate</span>
            )}
            {compileDiagnosticCount > 0 &&
              (onOpenProblems ? (
                <button type="button" onClick={onOpenProblems}>
                  ⚠ {compileDiagnosticCount} compile problem
                  {compileDiagnosticCount === 1 ? '' : 's'}
                </button>
              ) : (
                <span>
                  ⚠ {compileDiagnosticCount} compile problem
                  {compileDiagnosticCount === 1 ? '' : 's'}
                </span>
              ))}
            {zoteroAvailable &&
              libraryInventoryLoaded &&
              !libraryInventoryError &&
              referenceHealth.projectOnlyCount > 0 && (
                <span>○ {referenceHealth.projectOnlyCount} not linked to Zotero</span>
              )}
          </div>
        )}
        <div className="reference-health-filters" aria-label="Reference filters">
          {(
            [
              ['all', 'All', referenceHealth.bibliographyCount + selectedZoteroOnlyCount],
              ['cited', 'Cited', referenceHealth.citedCount],
              ['missing', 'Missing', issueCount],
              ['unused', 'Unused', referenceHealth.unusedCount],
              ['zotero', 'Zotero', inventory?.totalResults ?? 0]
            ] as const
          ).map(([value, label, count]) => (
            <button
              type="button"
              key={value}
              className={healthFilter === value ? 'active' : ''}
              aria-pressed={healthFilter === value}
              onClick={() => setHealthFilter(value)}
            >
              {label} <span>{value === 'zotero' && !inventory ? '…' : count}</span>
            </button>
          ))}
        </div>
        {onOpenSubmission && (
          <button type="button" className="reference-submission-action" onClick={onOpenSubmission}>
            <FileCheck2 size={12} aria-hidden="true" /> Submission check
          </button>
        )}
      </section>
      <div className="zotero-collection-tree" role="tree" aria-label="Zotero collections">
        {!library ? (
          <div className="research-muted">No Zotero collections found.</div>
        ) : (
          <>
            <button
              type="button"
              role="treeitem"
              aria-level={1}
              aria-expanded={libraryExpanded}
              className={
                selectedCollectionKey === library.key
                  ? 'zotero-library-root active'
                  : 'zotero-library-root'
              }
              tabIndex={activeCollectionKey === library.key ? 0 : -1}
              ref={(element) => {
                if (element) collectionRefs.current.set(library.key, element)
                else collectionRefs.current.delete(library.key)
              }}
              onFocus={() => setFocusedCollection(library.key)}
              onKeyDown={handleLibraryKeyDown}
              aria-selected={selectedCollectionKey === library.key}
              onClick={() => {
                setResults([])
                if (selectedCollectionKey === library.key) {
                  setLibraryExpanded((current) => !current)
                } else {
                  setSelectedCollectionKey(library.key)
                  setLibraryExpanded(true)
                }
              }}
            >
              <ChevronRight
                className={libraryExpanded ? 'collection-chevron expanded' : 'collection-chevron'}
                size={13}
                aria-hidden="true"
              />
              <FolderTree size={13} aria-hidden="true" />
              <span>{library.name}</span>
              <small>{library.itemCount ?? '…'}</small>
            </button>
            {renderedCollectionRows.map((row, index) => (
              <button
                type="button"
                draggable
                role="treeitem"
                aria-level={row.depth + 2}
                aria-expanded={
                  row.hasChildren ? expandedCollections.has(row.collection.key) : undefined
                }
                aria-selected={selectedCollectionKey === row.collection.key}
                className={selectedCollectionKey === row.collection.key ? 'active' : ''}
                style={{ paddingLeft: 24 + row.depth * 16 }}
                tabIndex={activeCollectionKey === row.collection.key ? 0 : -1}
                key={row.collection.key}
                ref={(element) => {
                  if (element) collectionRefs.current.set(row.collection.key, element)
                  else collectionRefs.current.delete(row.collection.key)
                }}
                onFocus={() => setFocusedCollection(row.collection.key)}
                onKeyDown={(event) => handleCollectionKeyDown(event, row, index)}
                onClick={() => {
                  setSelectedCollectionKey(row.collection.key)
                  setConfig((current) => ({ ...current, zoteroCollection: row.collection.key }))
                  setResults([])
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
                <small>{row.collection.itemCount ?? '…'}</small>
              </button>
            ))}
          </>
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
      {viewedCollection && (
        <div className="zotero-inventory-summary" aria-live="polite">
          <div>
            <strong>{viewedCollection.name}</strong>
            <span>{inventory?.totalResults ?? viewedCollection.itemCount ?? '…'} papers</span>
          </div>
          {inventoryBusy && !inventory ? (
            <span className="research-muted">
              <Loader className="spin" size={12} /> Loading papers…
            </span>
          ) : inventory ? (
            <span className="research-muted">
              {inventoryProjectCount} in project · {selectedZoteroOnlyCount} Zotero only
              {inventory.items.length < inventory.totalResults
                ? ` · ${inventory.items.length} shown`
                : ''}
            </span>
          ) : null}
        </div>
      )}
      {configuredCollection && (
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
      )}
      <form className="research-search" onSubmit={search}>
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setResults([])
            setLastLocalSearch('')
          }}
          maxLength={1_024}
          placeholder="Search project & Zotero"
          aria-label="Search project and Zotero"
        />
        <button type="submit" disabled={!query.trim() || busy !== null} aria-label="Search">
          {busy === 'search' ? <Loader className="spin" size={15} /> : <Search size={15} />}
        </button>
      </form>
      <div
        className="reference-card-list"
        role="region"
        aria-label={normalizedQuery ? 'Local reference search results' : 'Reference manager items'}
        tabIndex={
          normalizedQuery || visibleInventoryItems.length > 0 || visibleProjectReferences.length > 0
            ? 0
            : -1
        }
      >
        {normalizedQuery &&
          projectSearchResults.map((status) => (
            <ProjectReferenceCard
              key={`project:${status.entry.key}`}
              status={status}
              projectRoot={projectRoot}
              zoteroState={
                zoteroAvailable === false
                  ? 'unavailable'
                  : libraryInventoryError
                    ? 'error'
                    : libraryInventoryLoaded
                      ? 'ready'
                      : 'checking'
              }
              onCite={citeProjectReference}
              onOpenLocation={(location) => void openCitationLocation(location)}
              onAddToChat={onAddToChat}
            />
          ))}
        {!normalizedQuery &&
          healthFilter === 'missing' &&
          referenceHealth.missingCitations.map((usage) => (
            <article
              className="reference-card reference-health-card broken"
              key={usage.citekey}
              tabIndex={0}
            >
              <div>
                <span className="reference-warning" aria-hidden="true">
                  ⚠
                </span>
                <strong>@{usage.citekey}</strong>
                <span>Cited ×{usage.count}</span>
              </div>
              <span>Used in TeX but missing from every project bibliography.</span>
              <div className="reference-card-actions">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => {
                    setQuery(usage.citekey)
                    void runSearch(usage.citekey)
                  }}
                >
                  <Search size={13} /> Find source
                </button>
              </div>
            </article>
          ))}
        {!normalizedQuery &&
          visibleInventoryItems.map((item) => {
            const healthStatus = zoteroHealthByItemKey.get(item.itemKey)
            const inProject = healthStatus
              ? healthStatus.projectEntry !== null
              : item.citekey
                ? projectCitekeys.has(item.citekey)
                : false
            const citationCount = healthStatus?.citationCount ?? 0
            const searchableItem: ZoteroSearchResult | null = item.citekey
              ? {
                  citekey: item.citekey,
                  title: item.title,
                  author: item.author,
                  year: item.year,
                  type: item.type
                }
              : null
            return (
              <article
                className="reference-card zotero-inventory-card"
                key={item.itemKey}
                tabIndex={0}
                draggable={searchableItem !== null}
                onDragStart={(event) => {
                  if (searchableItem) {
                    setReferenceDragData(event, buildZoteroReferencePayload(searchableItem, port))
                  }
                }}
              >
                <div>
                  {inProject ? (
                    <Check
                      className="zotero-project-state in-project"
                      size={14}
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle className="zotero-project-state" size={12} aria-hidden="true" />
                  )}
                  <strong>{item.title}</strong>
                  <span>{item.citekey ? `@${item.citekey}` : 'Citekey unavailable'}</span>
                </div>
                <span>
                  {item.author || 'Unknown author'}
                  {item.year ? ` · ${item.year}` : ''}
                  {citationCount > 0
                    ? ` · CITED ×${citationCount}`
                    : inProject
                      ? ' · IN PROJECT, UNUSED'
                      : item.citekey
                        ? ' · ZOTERO ONLY'
                        : ''}
                </span>
                {searchableItem && (
                  <div className="reference-card-actions">
                    {onAddToChat && (
                      <button
                        type="button"
                        onClick={() =>
                          onAddToChat(buildZoteroReferencePayload(searchableItem, port))
                        }
                        aria-label={`Add ${item.title} to Chat`}
                      >
                        <MessageSquarePlus size={13} /> Add to Chat
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void add(searchableItem)}
                      disabled={busy !== null}
                    >
                      {busy === item.citekey ? (
                        <Loader className="spin" size={13} />
                      ) : inProject ? (
                        <Check size={13} />
                      ) : (
                        <Plus size={13} />
                      )}
                      {inProject ? 'Cite' : 'Add & cite'}
                    </button>
                  </div>
                )}
              </article>
            )
          })}
        {!normalizedQuery &&
          visibleProjectReferences.map((status) => (
            <ProjectReferenceCard
              key={`project:${status.entry.key}`}
              status={status}
              projectRoot={projectRoot}
              zoteroState={
                zoteroAvailable === false
                  ? 'unavailable'
                  : libraryInventoryError
                    ? 'error'
                    : libraryInventoryLoaded
                      ? 'ready'
                      : 'checking'
              }
              onCite={citeProjectReference}
              onOpenLocation={(location) => void openCitationLocation(location)}
              onAddToChat={onAddToChat}
            />
          ))}
        {normalizedQuery &&
          results.map((item) => (
            <article
              className="reference-card"
              key={item.citekey}
              tabIndex={0}
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
                  {busy === item.citekey ? (
                    <Loader className="spin" size={13} />
                  ) : (
                    <Plus size={13} />
                  )}
                  Add &amp; cite
                </button>
              </div>
            </article>
          ))}
        {!normalizedQuery && inventory && inventory.items.length < inventory.totalResults && (
          <button
            type="button"
            className="zotero-load-more-items"
            onClick={() => void loadMoreInventory()}
            disabled={inventoryBusy}
          >
            {inventoryBusy ? <Loader className="spin" size={13} /> : null}
            Load more papers ({inventory.totalResults - inventory.items.length})
          </button>
        )}
        {normalizedQuery && lastLocalSearch === normalizedQuery && localSearchResultCount === 0 && (
          <div className="reference-online-fallback">
            <span>No project or Zotero matches.</span>
            {onSearchOnline && (
              <button type="button" onClick={onSearchOnline}>
                Search Crossref / arXiv
              </button>
            )}
          </div>
        )}
      </div>
      {syncPreview && configuredCollection && (
        <div className="zotero-sync-preview" role="dialog" aria-label="Zotero sync preview">
          <strong>Sync preview</strong>
          <span>{configuredCollection.name}</span>
          <dl>
            <div>
              <dt>New</dt>
              <dd>+{syncPreview.added.length}</dd>
            </div>
            <div>
              <dt>Removed</dt>
              <dd>−{syncPreview.removed.length}</dd>
            </div>
            <div>
              <dt>Unchanged</dt>
              <dd>{syncPreview.unchanged}</dd>
            </div>
          </dl>
          {syncPreview.unresolved > 0 && (
            <span className="research-muted">
              {syncPreview.unresolved} item(s) are still waiting for a Better BibTeX citekey.
            </span>
          )}
          <span className="research-muted">Target: {config.zoteroFile}</span>
          <div className="zotero-sync-preview-actions">
            <button type="button" onClick={() => setSyncPreview(null)} disabled={busy === 'sync'}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void syncCollection()}
              disabled={busy === 'sync' || syncPreview.unresolved > 0}
            >
              {busy === 'sync' ? <Loader className="spin" size={13} /> : <RefreshCw size={13} />}
              Sync
            </button>
          </div>
        </div>
      )}
      {message && (
        <div className="research-status" aria-live="polite">
          {message}
        </div>
      )}
    </section>
  )
}
