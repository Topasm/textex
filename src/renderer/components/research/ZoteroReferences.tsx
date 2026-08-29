import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ICON_SIZE } from '../ui/IconSystem'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
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
import { describeNativeError } from '../../services/nativeErrors'
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
  const { t } = useTranslation()
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
          setMessage(describeNativeError(error))
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
              ? t('researchPanel.zotero.addedAndCited', { citekey: item.citekey })
              : t('researchPanel.zotero.addedWithoutCitation', { citekey: item.citekey })
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
      setMessage(t('researchPanel.zotero.settingsSaved'))
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
  }, [config, isCurrentScope, port, projectRoot, t])

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
      <div className="research-empty">
        <Loader className="spin" size={ICON_SIZE.feature} /> Loading Zotero…
      </div>
    )
  }

  return (
    <section className="research-reference-view" aria-label={t('researchPanel.zotero.label')}>
      <div className="research-config-row">
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
        <button
          type="button"
          onClick={() => void saveConfig()}
          disabled={busy !== null}
          title={t('researchPanel.zotero.saveSettings')}
          aria-label={t('researchPanel.zotero.saveSettings')}
        >
          <Save size={ICON_SIZE.compact} />
        </button>
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
      </div>
      <section className="reference-health" aria-label={t('researchPanel.zotero.healthLabel')}>
        <div className="reference-health-heading">
          <div>
            <strong>{t('researchPanel.zotero.currentPaper')}</strong>
            <span>
              {t('researchPanel.zotero.healthSummary', {
                cited: referenceHealth.citedCount,
                bibliography: referenceHealth.bibliographyCount,
                count: issueCount
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
        {(referenceHealth.missingCitations.length > 0 ||
          referenceHealth.duplicateCount > 0 ||
          compileDiagnosticCount > 0 ||
          (zoteroAvailable &&
            libraryInventoryLoaded &&
            !libraryInventoryError &&
            referenceHealth.projectOnlyCount > 0)) && (
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
            {zoteroAvailable &&
              libraryInventoryLoaded &&
              !libraryInventoryError &&
              referenceHealth.projectOnlyCount > 0 && (
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
              [
                'all',
                t('researchPanel.zotero.filterAll'),
                referenceHealth.bibliographyCount + selectedZoteroOnlyCount
              ],
              ['cited', t('researchPanel.zotero.filterCited'), referenceHealth.citedCount],
              ['missing', t('researchPanel.zotero.filterMissing'), issueCount],
              ['unused', t('researchPanel.zotero.filterUnused'), referenceHealth.unusedCount],
              ['zotero', t('researchPanel.zotero.filterZotero'), inventory?.totalResults ?? 0]
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
            <FileCheck2 size={ICON_SIZE.micro} aria-hidden="true" />{' '}
            {t('researchPanel.zotero.submissionCheck')}
          </button>
        )}
      </section>
      <div
        className="zotero-collection-tree"
        role="tree"
        aria-label={t('researchPanel.zotero.collectionsLabel')}
      >
        {!library ? (
          <div className="research-muted">{t('researchPanel.zotero.noCollections')}</div>
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
                size={ICON_SIZE.micro}
                aria-hidden="true"
              />
              <FolderTree size={ICON_SIZE.micro} aria-hidden="true" />
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
                  size={ICON_SIZE.micro}
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
              <Loader className="spin" size={ICON_SIZE.micro} /> Loading papers…
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
          {t('researchPanel.zotero.syncOnOpen')}
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
      <div
        className="reference-card-list"
        role="region"
        aria-label={
          normalizedQuery
            ? t('researchPanel.zotero.localResultsLabel')
            : t('researchPanel.zotero.managerItemsLabel')
        }
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
                <span>{t('researchPanel.referenceCard.cited', { count: usage.count })}</span>
              </div>
              <span>{t('researchPanel.zotero.missingFromBibliography')}</span>
              <div className="reference-card-actions">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => {
                    setQuery(usage.citekey)
                    void runSearch(usage.citekey)
                  }}
                >
                  <Search size={ICON_SIZE.micro} /> {t('researchPanel.zotero.findSource')}
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
                      size={ICON_SIZE.compact}
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle
                      className="zotero-project-state"
                      size={ICON_SIZE.micro}
                      aria-hidden="true"
                    />
                  )}
                  <strong>{item.title}</strong>
                  <span>
                    {item.citekey
                      ? `@${item.citekey}`
                      : t('researchPanel.zotero.citekeyUnavailable')}
                  </span>
                </div>
                <span>
                  {item.author || t('researchPanel.referenceCard.unknownAuthor')}
                  {item.year ? ` · ${item.year}` : ''}
                  {citationCount > 0
                    ? ` · ${t('researchPanel.referenceCard.cited', { count: citationCount })}`
                    : inProject
                      ? ` · ${t('researchPanel.zotero.inProjectUnused')}`
                      : item.citekey
                        ? ` · ${t('researchPanel.zotero.zoteroOnly')}`
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
                        aria-label={t('researchPanel.referenceCard.addNamedToChat', {
                          name: item.title
                        })}
                      >
                        <MessageSquarePlus size={ICON_SIZE.micro} />{' '}
                        {t('researchPanel.referenceCard.addToChat')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void add(searchableItem)}
                      disabled={busy !== null}
                    >
                      {busy === item.citekey ? (
                        <Loader className="spin" size={ICON_SIZE.micro} />
                      ) : inProject ? (
                        <Check size={ICON_SIZE.micro} />
                      ) : (
                        <Plus size={ICON_SIZE.micro} />
                      )}
                      {inProject
                        ? t('researchPanel.referenceCard.cite')
                        : t('researchPanel.online.addAndCite')}
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
                {item.author || t('researchPanel.referenceCard.unknownAuthor')}
                {item.year ? ` · ${item.year}` : ''}
              </span>
              <div className="reference-card-actions">
                {onAddToChat && (
                  <button
                    type="button"
                    onClick={() => onAddToChat(buildZoteroReferencePayload(item, port))}
                    aria-label={t('researchPanel.referenceCard.addNamedToChat', {
                      name: item.title || item.citekey
                    })}
                  >
                    <MessageSquarePlus size={ICON_SIZE.micro} />{' '}
                    {t('researchPanel.referenceCard.addToChat')}
                  </button>
                )}
                <button type="button" onClick={() => void add(item)} disabled={busy !== null}>
                  {busy === item.citekey ? (
                    <Loader className="spin" size={ICON_SIZE.micro} />
                  ) : (
                    <Plus size={ICON_SIZE.micro} />
                  )}
                  {t('researchPanel.online.addAndCite')}
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
            {inventoryBusy ? <Loader className="spin" size={ICON_SIZE.micro} /> : null}
            {t('researchPanel.zotero.loadMorePapers', {
              count: inventory.totalResults - inventory.items.length
            })}
          </button>
        )}
        {normalizedQuery && lastLocalSearch === normalizedQuery && localSearchResultCount === 0 && (
          <div className="reference-online-fallback">
            <span>{t('researchPanel.zotero.noLocalMatches')}</span>
            {onSearchOnline && (
              <button type="button" onClick={onSearchOnline}>
                {t('researchPanel.zotero.searchOnlineInstead')}
              </button>
            )}
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
