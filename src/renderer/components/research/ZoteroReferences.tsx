import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ICON_SIZE } from '../ui/IconSystem'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { BookMarked, FileCheck2, Loader, Plus, RefreshCw, Search } from 'lucide-react'
import type {
  CitationLocation,
  CitationUsage,
  ReferenceSortOrder,
  ResearchConfig,
  ZoteroCollectionItem,
  ZoteroLibrary,
  ZoteroSearchResult
} from '../../../shared/types'
import { useProjectStore } from '../../store/useProjectStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useEditorStore } from '../../store/useEditorStore'
import { useCompileStore } from '../../store/useCompileStore'
import {
  cacheZoteroInventory,
  getCachedZoteroInventory,
  invalidateZoteroInventory
} from '../../services/zoteroInventoryCache'
import {
  watchZoteroCollection,
  ZOTERO_WATCH_INTERVAL_MS
} from '../../services/zoteroCollectionWatcher'
import { navigateToDiagnostic } from '../../services/diagnosticNavigation'
import { describeNativeError } from '../../services/nativeErrors'
import {
  addReferenceAndBuildCitation,
  addReferenceAtCursor,
  type ReferenceDragPayload
} from './referenceActions'
import { buildReferenceHealth } from '../../services/referenceHealth'
import {
  collectReferenceRows,
  countReferenceRows,
  filterAndSortReferenceRows,
  type ReferenceFilter,
  type ReferenceRow as ReferenceRowModel
} from '../../services/referenceListModel'
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
import { CollectionPicker } from './CollectionPicker'
import { ReferenceRow } from './ReferenceRow'

const DEFAULT_CONFIG: ResearchConfig = {
  version: 1,
  referencesFile: 'references.bib',
  zoteroFile: 'zotero.bib',
  zoteroCollection: null
}

const REFERENCE_SORT_ORDERS: ReferenceSortOrder[] = [
  'natural',
  'title',
  'author',
  'year',
  'citations'
]

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

export function ZoteroReferences({
  onAddToChat,
  onOpenProjectGroups,
  onSearchOnline,
  onOpenProblems,
  onOpenSubmission
}: ZoteroReferencesProps = {}) {
  const { t } = useTranslation()
  const projectRoot = useProjectStore((state) => state.projectRoot)
  const query = useProjectStore((state) => state.researchSearchQuery)
  const setQuery = useProjectStore((state) => state.setResearchSearchQuery)
  const bibEntries = useProjectStore((state) => state.bibEntries)
  const port = useSettingsStore((state) => state.settings.zoteroPort)
  const sortOrder = useSettingsStore((state) => state.settings.referenceSortOrder ?? 'natural')
  const syncMode = useSettingsStore((state) => state.settings.zoteroSyncMode ?? 'continuous')
  const updateSetting = useSettingsStore((state) => state.updateSetting)
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
  const [configuredCollectionUnavailable, setConfiguredCollectionUnavailable] = useState(false)
  const [inventoryRefreshToken, setInventoryRefreshToken] = useState(0)
  const [healthFilter, setHealthFilter] = useState<ReferenceFilter>('all')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
  const [issuesExpanded, setIssuesExpanded] = useState(false)
  const [lastLocalSearch, setLastLocalSearch] = useState('')
  const [busy, setBusy] = useState<'load' | 'search' | 'save' | 'sync' | string | null>('load')
  const [message, setMessage] = useState('')
  const scopeGeneration = useRef(0)
  const operationInFlight = useRef(false)
  const collectionRefs = useRef(new Map<string, HTMLButtonElement>())
  const requestedCounts = useRef(new Set<string>())
  const persistSequence = useRef(0)
  const autoSyncInFlight = useRef(false)

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
    setConfiguredCollectionUnavailable(false)
    setInventoryRefreshToken(0)
    setPickerOpen(false)
    setExpandedRowId(null)
    setIssuesExpanded(false)
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
        // A reachable library that lists collections is authoritative: the
        // saved collection really is gone. An unreachable or still-empty Zotero
        // is not, so the saved selection must survive until Zotero can confirm
        // it — otherwise a slow Zotero start silently drops the project setting.
        const collectionDeleted =
          !zoteroResult.zoteroError &&
          loadedCollections.length > 0 &&
          loadedConfig.zoteroCollection !== null &&
          !configuredCollectionExists
        const effectiveConfig = collectionDeleted
          ? { ...loadedConfig, zoteroCollection: null }
          : loadedConfig
        setConfig(effectiveConfig)
        setConfiguredCollectionUnavailable(
          effectiveConfig.zoteroCollection !== null && !configuredCollectionExists
        )
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
          setMessage(describeNativeError(error))
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
  const configuredCollectionItemCount = configuredCollection?.itemCount ?? null
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
  const referenceHealth = useMemo(
    () => buildReferenceHealth(bibEntries, citationUsages, libraryInventory),
    [bibEntries, citationUsages, libraryInventory]
  )
  const zoteroReady = zoteroAvailable === true && libraryInventoryLoaded && !libraryInventoryError
  const normalizedQuery = query.trim().toLocaleLowerCase('en-US')
  /** One merged row list feeds the chip counts and the list itself. */
  const allRows = useMemo(
    () =>
      collectReferenceRows({
        health: referenceHealth,
        inventory: inventory?.items ?? [],
        searchResults: results,
        query,
        filter: healthFilter,
        sort: sortOrder,
        zoteroReady
      }),
    [healthFilter, inventory, query, referenceHealth, results, sortOrder, zoteroReady]
  )
  const visibleRows = useMemo(
    () => filterAndSortReferenceRows(allRows, healthFilter, sortOrder, zoteroReady),
    [allRows, healthFilter, sortOrder, zoteroReady]
  )
  const filterCounts = useMemo(
    () => countReferenceRows(allRows, zoteroReady),
    [allRows, zoteroReady]
  )
  const inventoryProjectCount = useMemo(
    () => (inventory ? allRows.filter((row) => row.itemKey && row.entry !== null).length : 0),
    [allRows, inventory]
  )
  const localSearchResultCount = normalizedQuery ? visibleRows.length : 0
  const issueCount =
    referenceHealth.missingCitations.length +
    referenceHealth.duplicateCount +
    (zoteroReady ? referenceHealth.projectOnlyCount : 0)

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
          setMessage(describeNativeError(error))
        }
      })
      .finally(() => {
        if (!cancelled && isCurrentScope(generation, root, apiPort)) setInventoryBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    inventoryRefreshToken,
    isCurrentScope,
    loaded,
    port,
    projectRoot,
    selectedCollectionKey,
    updateCollectionCount
  ])

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
  }, [inventoryRefreshToken, isCurrentScope, libraryKey, loaded, port, projectRoot])

  /**
   * Keeps the panel current with Zotero while a project is open. Zotero has no
   * change feed, so the configured collection is polled for its item count and
   * every observed change refreshes the cross-check inventories — and rewrites
   * the managed bibliography when the project opted into automatic sync.
   */
  useEffect(() => {
    const collectionKey = config.zoteroCollection
    if (!loaded || !collectionKey || zoteroAvailable === false) return
    const generation = scopeGeneration.current
    const root = projectRoot
    const apiPort = port
    const continuous = syncMode === 'continuous'
    const zoteroFile = config.zoteroFile
    return watchZoteroCollection({
      collectionKey,
      port: apiPort,
      // Seeding with the count already on screen lets the very first poll
      // report a change instead of spending one interval on a baseline.
      initialTotalResults: configuredCollectionItemCount,
      onChange: async () => {
        if (!isCurrentScope(generation, root, apiPort)) return
        invalidateZoteroInventory(apiPort)
        setInventoryRefreshToken((current) => current + 1)
        if (!continuous || !root || !targetFile) return
        // A manual sync, save, or an earlier automatic sync owns the managed
        // file until it finishes; the next poll picks the change up again.
        if (autoSyncInFlight.current || operationInFlight.current) return
        autoSyncInFlight.current = true
        try {
          const result = await window.api.zoteroSyncCollection(collectionKey, targetFile, apiPort)
          if (!isCurrentScope(generation, root, apiPort)) return
          const entries = await window.api.findBibInProject(root)
          if (!isCurrentScope(generation, root, apiPort)) return
          useProjectStore.getState().setBibEntries(entries)
          useProjectStore.getState().invalidateDirectory(root)
          setMessage(
            t('researchPanel.zotero.synchronized', {
              count: result.entryCount,
              file: zoteroFile
            })
          )
        } catch (error) {
          if (isCurrentScope(generation, root, apiPort)) setMessage(describeNativeError(error))
        } finally {
          autoSyncInFlight.current = false
        }
      },
      // A transient Zotero outage must not replace an actionable panel message.
      onError: () => undefined
    })
  }, [
    config.zoteroCollection,
    config.zoteroFile,
    configuredCollectionItemCount,
    isCurrentScope,
    loaded,
    port,
    projectRoot,
    syncMode,
    t,
    targetFile,
    zoteroAvailable
  ])

  /**
   * Recovers the panel when Zotero starts after the project. Opening a project
   * before Zotero is ready used to leave the saved collection permanently
   * unresolved, which looked exactly like a lost setting.
   */
  useEffect(() => {
    if (!loaded) return
    if (zoteroAvailable !== false && !configuredCollectionUnavailable) return
    const generation = scopeGeneration.current
    const root = projectRoot
    const apiPort = port
    const collectionKey = config.zoteroCollection
    let cancelled = false
    const timer = setInterval(() => {
      void window.api.zoteroLibraryTree(apiPort).then(
        (loadedLibraries) => {
          if (cancelled || !isCurrentScope(generation, root, apiPort)) return
          if (loadedLibraries.length === 0) return
          setLibraries(loadedLibraries)
          setZoteroAvailable(true)
          const loadedCollections = loadedLibraries.flatMap((library) => library.collections)
          if (!collectionKey) return
          if (!loadedCollections.some((collection) => collection.key === collectionKey)) return
          setConfiguredCollectionUnavailable(false)
          setSelectedCollectionKey(collectionKey)
          setExpandedCollections(
            expandedZoteroAncestors(orderZoteroCollections(loadedCollections), collectionKey)
          )
        },
        () => undefined
      )
    }, ZOTERO_WATCH_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [
    config.zoteroCollection,
    configuredCollectionUnavailable,
    isCurrentScope,
    loaded,
    port,
    projectRoot,
    zoteroAvailable
  ])

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
          setMessage(t('researchPanel.zotero.noReferenceMatches'))
        }
      } catch (error) {
        if (isCurrentScope(generation, root, apiPort)) {
          setMessage(describeNativeError(error))
        }
      } finally {
        if (isCurrentScope(generation, root, apiPort)) {
          operationInFlight.current = false
          setBusy(null)
        }
      }
    },
    [bibEntries, isCurrentScope, port, projectRoot, t, zoteroAvailable]
  )

  const search = useCallback(
    (event: FormEvent) => {
      event.preventDefault()
      void runSearch(query)
    },
    [query, runSearch]
  )

  /**
   * Writes to the bibliography, and optionally to the document. Both paths are
   * explicit actions now — nothing in the collapsed row can trigger them.
   */
  const addReference = useCallback(
    async (row: ReferenceRowModel, cite: boolean) => {
      const citekey = row.citekey
      if (!citekey || operationInFlight.current) return
      const generation = scopeGeneration.current
      const root = projectRoot
      const apiPort = port
      operationInFlight.current = true
      setBusy(citekey)
      setMessage('')
      try {
        const payload = { source: 'zotero' as const, citekey, port }
        if (!cite) {
          await addReferenceAndBuildCitation(payload)
          if (isCurrentScope(generation, root, apiPort)) {
            setMessage(t('researchPanel.zotero.addedToBibliography', { citekey }))
          }
          return
        }
        const inserted = await addReferenceAtCursor(payload)
        if (isCurrentScope(generation, root, apiPort)) {
          setMessage(
            inserted
              ? t('researchPanel.zotero.addedAndCited', { citekey })
              : t('researchPanel.zotero.addedWithoutCitation', { citekey })
          )
        }
      } catch (error) {
        if (isCurrentScope(generation, root, apiPort)) {
          setMessage(describeNativeError(error))
        }
      } finally {
        if (isCurrentScope(generation, root, apiPort)) {
          operationInFlight.current = false
          setBusy(null)
        }
      }
    },
    [isCurrentScope, port, projectRoot, t]
  )

  const addToBibliography = useCallback(
    (row: ReferenceRowModel) => addReference(row, false),
    [addReference]
  )

  const addAndCite = useCallback(
    (row: ReferenceRowModel) => addReference(row, true),
    [addReference]
  )

  const openInZotero = useCallback(
    async (row: ReferenceRowModel) => {
      if (!row.itemKey) return
      const generation = scopeGeneration.current
      const root = projectRoot
      const apiPort = port
      try {
        await window.api.zoteroOpenItem(row.itemKey, apiPort)
      } catch (error) {
        if (isCurrentScope(generation, root, apiPort)) setMessage(describeNativeError(error))
      }
    },
    [isCurrentScope, port, projectRoot]
  )

  const citeProjectReference = useCallback((citekey: string) => {
    useEditorStore.getState().requestInsertAtCursor(`\\cite{${citekey}}`)
  }, [])

  const openCitationLocation = useCallback(
    (location: CitationLocation) => {
      void navigateToDiagnostic({
        file: location.file,
        line: location.line,
        column: 1,
        severity: 'info',
        message: t('researchPanel.referenceCard.citationLocations')
      })
    },
    [t]
  )

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
        setMessage(describeNativeError(error))
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
        setMessage(describeNativeError(error))
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

  /**
   * Writes one settings change straight to `.textex/research.json`. The panel
   * used to keep the collection and its sync switches in component state until
   * the explicit save button ran, so reopening the project restored whatever
   * was last written rather than what the user picked.
   */
  const persistConfig = useCallback(
    (next: ResearchConfig) => {
      setConfig(next)
      const generation = scopeGeneration.current
      const root = projectRoot
      const apiPort = port
      const requested = ++persistSequence.current
      void window.api.researchSaveConfig(next).then(
        (saved) => {
          if (isCurrentScope(generation, root, apiPort) && requested === persistSequence.current) {
            setConfig(saved)
          }
        },
        (error: unknown) => {
          if (isCurrentScope(generation, root, apiPort)) setMessage(describeNativeError(error))
        }
      )
    },
    [isCurrentScope, port, projectRoot]
  )

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
      setMessage(
        t('researchPanel.zotero.synchronized', {
          count: result.entryCount,
          file: config.zoteroFile
        })
      )
      setSyncPreview(null)
    } catch (error) {
      if (isCurrentScope(generation, root, apiPort)) {
        setMessage(describeNativeError(error))
      }
    } finally {
      if (isCurrentScope(generation, root, apiPort)) {
        operationInFlight.current = false
        setBusy(null)
      }
    }
  }, [config.zoteroCollection, config.zoteroFile, isCurrentScope, port, projectRoot, t, targetFile])

  if (busy === 'load') {
    return (
      <div className="panel-empty">
        <Loader className="spin" size={ICON_SIZE.feature} /> {t('researchPanel.zotero.loading')}
      </div>
    )
  }

  return (
    <section className="research-reference-view" aria-label={t('researchPanel.zotero.label')}>
      <div className="research-config-row">
        <CollectionPicker
          library={library}
          rows={renderedCollectionRows}
          totalRowCount={visibleCollectionRows.length}
          selectedKey={selectedCollectionKey}
          activeKey={activeCollectionKey}
          expandedCollections={expandedCollections}
          libraryExpanded={libraryExpanded}
          selectedName={viewedCollection?.name ?? null}
          selectedCount={inventory?.totalResults ?? viewedCollection?.itemCount ?? null}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onSelectLibrary={() => {
            setResults([])
            setSelectedCollectionKey(library?.key ?? null)
            setLibraryExpanded(true)
          }}
          onToggleLibrary={() => setLibraryExpanded((current) => !current)}
          onSelectCollection={(collection, row, index) => {
            setSelectedCollectionKey(collection.key)
            setConfiguredCollectionUnavailable(false)
            persistConfig({ ...config, zoteroCollection: collection.key })
            setResults([])
            if (row.hasChildren) {
              if (
                !expandedCollections.has(collection.key) &&
                index === renderedCollectionRows.length - 1 &&
                renderedCollectionRows.length === collectionLimit
              ) {
                setCollectionLimit((current) => current + COLLECTION_PAGE_SIZE)
              }
              toggleCollection(collection.key)
            }
          }}
          onShowMore={() => setCollectionLimit((current) => current + COLLECTION_PAGE_SIZE)}
          onFocusCollection={setFocusedCollection}
          onLibraryKeyDown={handleLibraryKeyDown}
          onCollectionKeyDown={handleCollectionKeyDown}
          registerRef={(key, element) => {
            if (element) collectionRefs.current.set(key, element)
            else collectionRefs.current.delete(key)
          }}
          emptyState={
            <div className="research-muted">{t('researchPanel.zotero.noCollections')}</div>
          }
        />
        <select
          className="reference-sort-select"
          value={sortOrder}
          aria-label={t('researchPanel.zotero.sortLabel')}
          title={t('researchPanel.zotero.sortLabel')}
          onChange={(event) =>
            updateSetting('referenceSortOrder', event.target.value as ReferenceSortOrder)
          }
        >
          {REFERENCE_SORT_ORDERS.map((order) => (
            <option key={order} value={order}>
              {t(`researchPanel.zotero.sort.${order}`)}
            </option>
          ))}
        </select>
        {onOpenProjectGroups && (
          <button
            type="button"
            onClick={onOpenProjectGroups}
            title={t('researchPanel.references.projectCitationGroups')}
            aria-label={t('researchPanel.references.projectCitationGroups')}
          >
            <BookMarked size={ICON_SIZE.compact} />
          </button>
        )}
        {onOpenSubmission && (
          <button
            type="button"
            onClick={onOpenSubmission}
            title={t('researchPanel.zotero.submissionCheck')}
            aria-label={t('researchPanel.zotero.submissionCheck')}
          >
            <FileCheck2 size={ICON_SIZE.compact} />
          </button>
        )}
        {syncMode !== 'continuous' && (
          <button
            type="button"
            onClick={() => void prepareSyncPreview()}
            disabled={busy !== null || !configuredCollection || !projectRoot}
            title={t('researchPanel.zotero.syncCollection')}
            aria-label={t('researchPanel.zotero.syncCollection')}
          >
            {busy === 'sync' || syncPreviewBusy ? (
              <Loader className="spin" size={ICON_SIZE.compact} />
            ) : (
              <RefreshCw size={ICON_SIZE.compact} />
            )}
          </button>
        )}
      </div>
      {config.zoteroCollection && configuredCollectionUnavailable && (
        <p className="research-muted zotero-collection-notice" role="status">
          {t('researchPanel.zotero.collectionUnavailable', {
            collection: config.zoteroCollection
          })}
        </p>
      )}
      <section className="reference-health" aria-label={t('researchPanel.zotero.healthLabel')}>
        <div className="reference-health-heading">
          <div>
            <strong>{t('researchPanel.zotero.currentPaper')}</strong>
            <span>
              {t('researchPanel.zotero.healthSummary', {
                cited: referenceHealth.citedCount,
                bibliography: referenceHealth.bibliographyCount
              })}
            </span>
          </div>
          <small>
            {zoteroAvailable === false
              ? t('researchPanel.referenceCard.zoteroUnavailable')
              : libraryInventoryError
                ? t('researchPanel.zotero.crossCheckUnavailable')
                : libraryInventoryLoaded
                  ? t('researchPanel.zotero.linkedToZotero', {
                      count: referenceHealth.linkedToZoteroCount
                    })
                  : t('researchPanel.referenceCard.zoteroChecking')}
          </small>
        </div>
        {(issueCount > 0 || compileDiagnosticCount > 0) && (
          <button
            type="button"
            className="reference-health-issues-toggle"
            aria-expanded={issuesExpanded}
            onClick={() => setIssuesExpanded((current) => !current)}
          >
            {t('researchPanel.zotero.issuesToggle', {
              count: issueCount + compileDiagnosticCount
            })}
          </button>
        )}
        {issuesExpanded && (issueCount > 0 || compileDiagnosticCount > 0) && (
          <div className="reference-health-issues" role="status">
            {referenceHealth.missingCitations.length > 0 && (
              <span>
                {t('researchPanel.zotero.issueMissingBibliography', {
                  count: referenceHealth.missingCitations.length
                })}
              </span>
            )}
            {referenceHealth.duplicateCount > 0 && (
              <span>
                {t('researchPanel.zotero.issuePossibleDuplicate', {
                  count: referenceHealth.duplicateCount
                })}
              </span>
            )}
            {compileDiagnosticCount > 0 &&
              (onOpenProblems ? (
                <button type="button" onClick={onOpenProblems}>
                  {t('researchPanel.zotero.issueCompileProblem', { count: compileDiagnosticCount })}
                </button>
              ) : (
                <span>
                  {t('researchPanel.zotero.issueCompileProblem', { count: compileDiagnosticCount })}
                </span>
              ))}
            {zoteroReady && referenceHealth.projectOnlyCount > 0 && (
              <span>
                {t('researchPanel.zotero.issueNotLinked', {
                  count: referenceHealth.projectOnlyCount
                })}
              </span>
            )}
          </div>
        )}
        <div
          className="reference-health-filters"
          aria-label={t('researchPanel.zotero.filtersLabel')}
        >
          {(
            [
              ['all', t('researchPanel.zotero.filterAll'), filterCounts.all],
              ['cited', t('researchPanel.zotero.filterCited'), filterCounts.cited],
              ['missing', t('researchPanel.zotero.filterMissing'), filterCounts.missing],
              ['unused', t('researchPanel.zotero.filterUnused'), filterCounts.unused],
              ['zotero', t('researchPanel.zotero.filterZotero'), filterCounts.zotero]
            ] as const
          ).map(([value, label, count]) => (
            <button
              type="button"
              key={value}
              className={healthFilter === value ? 'active' : ''}
              aria-pressed={healthFilter === value}
              onClick={() => setHealthFilter(value)}
            >
              {label} <span>{count}</span>
            </button>
          ))}
        </div>
      </section>
      <form className="research-search" onSubmit={search}>
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setResults([])
            setLastLocalSearch('')
          }}
          maxLength={1_024}
          placeholder={t('researchPanel.zotero.searchPlaceholder')}
          aria-label={t('researchPanel.zotero.searchLabel')}
        />
        <button
          type="submit"
          disabled={!query.trim() || busy !== null}
          aria-label={t('researchPanel.online.search')}
        >
          {busy === 'search' ? (
            <Loader className="spin" size={ICON_SIZE.compact} />
          ) : (
            <Search size={ICON_SIZE.compact} />
          )}
        </button>
      </form>
      {viewedCollection && (
        <div className="zotero-inventory-summary" aria-live="polite">
          <span className="research-muted">
            {inventoryBusy && !inventory
              ? t('researchPanel.zotero.loadingPapers')
              : t('researchPanel.zotero.inventorySummary', {
                  total: inventory?.totalResults ?? viewedCollection.itemCount ?? 0,
                  inProject: inventoryProjectCount
                })}
          </span>
        </div>
      )}
      <div
        className="reference-card-list"
        role="region"
        aria-label={t('researchPanel.zotero.referencesLabel')}
        tabIndex={visibleRows.length > 0 ? 0 : -1}
      >
        {visibleRows.map((row) => (
          <ReferenceRow
            key={row.id}
            row={row}
            projectRoot={projectRoot}
            port={port}
            expanded={expandedRowId === row.id}
            busy={busy !== null}
            zoteroState={
              zoteroAvailable === false
                ? 'unavailable'
                : libraryInventoryError
                  ? 'error'
                  : libraryInventoryLoaded
                    ? 'ready'
                    : 'checking'
            }
            onToggleExpanded={(id) => setExpandedRowId((current) => (current === id ? null : id))}
            onCite={(target) => target.citekey && citeProjectReference(target.citekey)}
            onAddToBibliography={(target) => void addToBibliography(target)}
            onAddAndCite={(target) => void addAndCite(target)}
            onOpenInZotero={(target) => void openInZotero(target)}
            onOpenLocation={(location) => void openCitationLocation(location)}
            onFindSource={(citekey) => {
              setQuery(citekey)
              void runSearch(citekey)
            }}
            onAddToChat={onAddToChat}
          />
        ))}
        {!normalizedQuery && inventory && inventory.items.length < inventory.totalResults && (
          <button
            type="button"
            className="zotero-load-more-items"
            onClick={() => void loadMoreInventory()}
            disabled={inventoryBusy}
          >
            {inventoryBusy ? (
              <Loader className="spin" size={ICON_SIZE.micro} />
            ) : (
              <Plus size={ICON_SIZE.micro} />
            )}
            {t('researchPanel.zotero.loadMorePapers', {
              count: inventory.totalResults - inventory.items.length
            })}
          </button>
        )}
        {normalizedQuery &&
          lastLocalSearch === normalizedQuery &&
          localSearchResultCount === 0 &&
          onSearchOnline && (
            <div className="reference-online-fallback">
              <span>{t('researchPanel.zotero.noLocalMatches')}</span>
              <button type="button" onClick={onSearchOnline}>
                <Search size={ICON_SIZE.micro} /> {t('researchPanel.zotero.searchOnlineInstead')}
              </button>
            </div>
          )}
      </div>
      {syncPreview && configuredCollection && (
        <div
          className="zotero-sync-preview"
          role="dialog"
          aria-label={t('researchPanel.zotero.syncPreviewLabel')}
        >
          <strong>{t('researchPanel.zotero.syncPreview')}</strong>
          <span>{configuredCollection.name}</span>
          <dl>
            <div>
              <dt>{t('researchPanel.zotero.syncNew')}</dt>
              <dd>+{syncPreview.added.length}</dd>
            </div>
            <div>
              <dt>{t('researchPanel.zotero.syncRemoved')}</dt>
              <dd>−{syncPreview.removed.length}</dd>
            </div>
            <div>
              <dt>{t('researchPanel.zotero.syncUnchanged')}</dt>
              <dd>{syncPreview.unchanged}</dd>
            </div>
          </dl>
          {syncPreview.unresolved > 0 && (
            <span className="research-muted">
              {t('researchPanel.zotero.syncUnresolved', { count: syncPreview.unresolved })}
            </span>
          )}
          <span className="research-muted">
            {t('researchPanel.zotero.syncTarget', { file: config.zoteroFile })}
          </span>
          <div className="zotero-sync-preview-actions">
            <button type="button" onClick={() => setSyncPreview(null)} disabled={busy === 'sync'}>
              {t('researchPanel.zotero.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void syncCollection()}
              disabled={busy === 'sync' || syncPreview.unresolved > 0}
            >
              {busy === 'sync' ? (
                <Loader className="spin" size={ICON_SIZE.micro} />
              ) : (
                <RefreshCw size={ICON_SIZE.micro} />
              )}
              {t('researchPanel.zotero.sync')}
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
