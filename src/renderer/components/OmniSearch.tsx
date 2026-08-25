import { useState, useCallback, useEffect, useRef, useMemo, useDeferredValue, useId } from 'react'
import {
  BookOpen,
  Library,
  FileSearch,
  Code,
  ChevronDown,
  ChevronUp,
  X,
  Search,
  FolderOpen,
  Terminal,
  Files,
  Globe2
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../store/useEditorStore'
import { documentRegistry } from '../models/documentRegistry'
import { useProjectStore } from '../store/useProjectStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { usePdfStore } from '../store/usePdfStore'
import { useUiStore } from '../store/useUiStore'
import { useNotificationStore } from '../store/useNotificationStore'
import { useClickOutside } from '../hooks/useClickOutside'
import { isFeatureEnabled } from '../utils/featureFlags'
import { templates } from '../data/templates'
import { openProject } from '../utils/openProject'
import { errorMessage, logError } from '../utils/errorMessage'
import { focusCollectionItem, type CollectionFocusPosition } from '../utils/collectionFocus'
import {
  HomePanel,
  CitationSearchPanel,
  ZoteroSearchPanel,
  PdfSearchPanel,
  TexSearchPanel,
  ProjectFileSearchPanel,
  OnlineSearchPanel
} from './omnisearch-panels'
import type {
  SearchMode,
  ModeConfig,
  HomeSlashCommand,
  HomeResult,
  TexSearchResult,
  ProjectFileSearchResult
} from './omnisearch-panels'
import type {
  BibEntry,
  OnlineReference,
  RecentProject,
  ZoteroSearchResult
} from '../../shared/types'
import { searchProjectFiles } from '../services/projectIndex'
import { getDesktopCapabilities } from '../platform/capabilities'
import { addReferenceAtCursor } from './research/referenceActions'
import './OmniSearch.css'

const MODE_CONFIGS: Record<SearchMode, ModeConfig> = {
  file: {
    icon: Files,
    placeholder: 'omniSearch.searchProjectFiles',
    label: 'omniSearch.files',
    shortcut: '/f'
  },
  cite: {
    icon: BookOpen,
    placeholder: 'omniSearch.searchCitations',
    label: 'omniSearch.citations',
    shortcut: '/c'
  },
  zotero: {
    icon: Library,
    placeholder: 'omniSearch.searchZotero',
    label: 'omniSearch.zotero',
    shortcut: '/z'
  },
  online: {
    icon: Globe2,
    placeholder: 'omniSearch.searchOnline',
    label: 'omniSearch.online',
    shortcut: '/o'
  },
  pdf: {
    icon: FileSearch,
    placeholder: 'omniSearch.searchPdf',
    label: 'omniSearch.pdf',
    shortcut: '/p'
  },
  tex: {
    icon: Code,
    placeholder: 'omniSearch.findInEditor',
    label: 'omniSearch.tex',
    shortcut: '/t'
  }
}

const SLASH_PREFIXES: Record<string, SearchMode> = {
  '/f': 'file',
  '/file': 'file',
  '/files': 'file',
  '/c': 'cite',
  '/cite': 'cite',
  '/r': 'cite',
  '/ref': 'cite',
  '/references': 'cite',
  '/z': 'zotero',
  '/zotero': 'zotero',
  '/o': 'online',
  '/online': 'online',
  '/paper': 'online',
  '/p': 'pdf',
  '/pdf': 'pdf',
  '/t': 'tex',
  '/tex': 'tex'
}

const HOME_SLASH_COMMANDS: HomeSlashCommand[] = [
  {
    command: '/draft',
    label: '/draft',
    descriptionKey: 'searchBar.draftDesc',
    icon: <Code size={16} />
  },
  {
    command: '/template',
    label: '/template',
    descriptionKey: 'searchBar.templateDesc',
    icon: <BookOpen size={16} />
  },
  {
    command: '/open',
    label: '/open',
    descriptionKey: 'searchBar.openDesc',
    icon: <FolderOpen size={16} />
  },
  {
    command: '/help',
    label: '/help',
    descriptionKey: 'searchBar.helpDesc',
    icon: <Terminal size={16} />
  }
]

interface OmniSearchProps {
  onOpenFolder?: () => void
  onNewFromTemplate?: () => void
  onAiDraft?: (prefill?: string) => void
  onOpenSettings?: () => void
}

export function OmniSearch({
  onOpenFolder,
  onNewFromTemplate,
  onAiDraft,
  onOpenSettings
}: OmniSearchProps) {
  const { t } = useTranslation()
  const capabilities = getDesktopCapabilities()
  const settings = useSettingsStore((s) => s.settings)
  const zoteroEnabled = isFeatureEnabled(settings, 'zotero')
  const zoteroPort = settings.zoteroPort
  const bibEntries = useProjectStore((s) => s.bibEntries)
  const projectRoot = useProjectStore((s) => s.projectRoot)
  const projectIndexEntries = useProjectStore((s) => s.projectIndex?.entries)
  const omniSearchFocusRequested = useUiStore((s) => s.omniSearchFocusRequested)
  const omniSearchFocusMode = useUiStore((s) => s.omniSearchFocusMode)
  const pdfMatchCount = usePdfStore((s) => s.pdfMatchCount)
  const pdfCurrentMatch = usePdfStore((s) => s.pdfCurrentMatch)
  const availableHomeCommands = useMemo(
    () =>
      HOME_SLASH_COMMANDS.filter(
        (command) =>
          (command.command !== '/draft' || capabilities.ai) &&
          (command.command !== '/template' || capabilities.templates)
      ),
    [capabilities.ai, capabilities.templates]
  )

  const isHomeMode = !projectRoot

  const [mode, setMode] = useState<SearchMode>('cite')
  const [searchTerm, setSearchTerm] = useState('')
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  // Cite/Zotero state
  const [zoteroResults, setZoteroResults] = useState<ZoteroSearchResult[]>([])
  const [onlineResults, setOnlineResults] = useState<OnlineReference[]>([])
  const [onlineLoading, setOnlineLoading] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [loading, setLoading] = useState(false)

  // Tex search state
  const [texResults, setTexResults] = useState<TexSearchResult[]>([])

  // Home mode state
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [homeHighlightedIndex, setHomeHighlightedIndex] = useState(0)
  const deferredSearchTerm = useDeferredValue(searchTerm)
  const generatedId = useId().replace(/:/g, '')
  const inputId = `omni-search-${generatedId}`
  const resultsId = `${inputId}-results`
  const resultsStatusId = `${inputId}-status`
  const modeMenuId = `${inputId}-mode-menu`
  const getOptionId = useCallback((index: number) => `${resultsId}-option-${index}`, [resultsId])
  const projectFileResults = useMemo(
    () => searchProjectFiles(projectIndexEntries ?? [], deferredSearchTerm),
    [projectIndexEntries, deferredSearchTerm]
  )

  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const modeButtonRef = useRef<HTMLButtonElement>(null)
  const modeMenuRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const closeModeMenu = useCallback(() => setIsModeMenuOpen(false), [])
  const closeDropdown = useCallback(() => setIsDropdownOpen(false), [])
  useClickOutside(wrapperRef, closeDropdown, isDropdownOpen)
  useClickOutside(modeMenuRef, closeModeMenu, isModeMenuOpen)

  // ---- Home mode: load recent projects ----
  useEffect(() => {
    if (!isHomeMode) return
    window.api
      .loadSettings()
      .then((s) => setRecentProjects(s.recentProjects ?? []))
      .catch((err) => logError('OmniSearch:loadSettings', err))
  }, [isHomeMode])

  // ---- Home mode: auto-focus ----
  useEffect(() => {
    if (isHomeMode) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isHomeMode])

  // ---- Reset search state when transitioning between home/editor ----
  useEffect(() => {
    setSearchTerm('')
    setIsDropdownOpen(false)
    setHighlightedIndex(0)
    setHomeHighlightedIndex(0)
    setSelectedKeys(new Set())
    setZoteroResults([])
    setOnlineResults([])
    setTexResults([])
    setLoading(false)
  }, [projectRoot])

  // Focus input when requested via store (editor mode)
  useEffect(() => {
    if (omniSearchFocusRequested && omniSearchFocusMode) {
      setMode(omniSearchFocusMode)
      inputRef.current?.focus()
      useUiStore.getState().clearOmniSearchFocus()
    }
  }, [omniSearchFocusRequested, omniSearchFocusMode])

  // Auto-scroll highlighted result into view in dropdown
  useEffect(() => {
    const dropdown = dropdownRef.current
    if (!dropdown) return
    const highlighted = dropdown.querySelector(
      '.omni-search-result.highlighted'
    ) as HTMLElement | null
    highlighted?.scrollIntoView?.({ block: 'nearest' })
  }, [highlightedIndex, homeHighlightedIndex])

  // ---- Home mode: filter results ----
  const homeResults = useMemo<HomeResult[]>(() => {
    if (!isHomeMode) return []
    const q = deferredSearchTerm.trim()
    if (!q) return []

    if (q.startsWith('/')) {
      const cmdQuery = q.toLowerCase()
      const firstSpace = q.indexOf(' ')
      const cmdPart = firstSpace > 0 ? q.slice(0, firstSpace).toLowerCase() : cmdQuery
      return availableHomeCommands
        .filter((cmd) => cmd.command.startsWith(cmdPart))
        .map((cmd) => ({
          kind: 'command' as const,
          label: cmd.label,
          detail: t(cmd.descriptionKey),
          badgeKey: 'searchBar.command',
          data: cmd
        }))
    }

    const lower = q.toLowerCase()
    const results: HomeResult[] = []

    for (const project of recentProjects) {
      if (
        project.name.toLowerCase().includes(lower) ||
        project.path.toLowerCase().includes(lower) ||
        (project.title && project.title.toLowerCase().includes(lower)) ||
        (project.tag && project.tag.toLowerCase().includes(lower))
      ) {
        results.push({
          kind: 'project',
          label: project.title || project.name,
          detail: project.tag ? `${project.path} — ${project.tag}` : project.path,
          badgeKey: 'searchBar.recent',
          data: project
        })
      }
    }

    if (capabilities.templates) {
      for (const tmpl of templates) {
        if (
          tmpl.name.toLowerCase().includes(lower) ||
          tmpl.description.toLowerCase().includes(lower)
        ) {
          results.push({
            kind: 'template',
            label: tmpl.name,
            detail: tmpl.description,
            badgeKey: 'searchBar.template',
            data: tmpl
          })
        }
      }
    }

    return results
  }, [
    availableHomeCommands,
    capabilities.templates,
    deferredSearchTerm,
    isHomeMode,
    recentProjects,
    t
  ])

  // Update dropdown state when home results change
  useEffect(() => {
    if (!isHomeMode) return
    setIsDropdownOpen(homeResults.length > 0)
    setHomeHighlightedIndex(0)
  }, [deferredSearchTerm, homeResults.length, isHomeMode])

  // ---- Home mode: select result ----
  const openRecentProject = useCallback(
    async (project: RecentProject): Promise<void> => {
      try {
        await openProject(project.path)
      } catch (error) {
        useNotificationStore.getState().pushNotification({
          id: `recent-project-open:${project.path}`,
          message: t('projectSwitcher.openFailed', {
            name: project.title || project.name,
            reason: errorMessage(error)
          }),
          tone: 'error',
          action: {
            label: t('recentProjects.retry'),
            run: async () => {
              await openProject(project.path)
            }
          }
        })
      }
    },
    [t]
  )

  const handleHomeSelect = useCallback(
    (result: HomeResult) => {
      setSearchTerm('')
      setIsDropdownOpen(false)

      switch (result.kind) {
        case 'project': {
          const project = result.data as RecentProject
          void openRecentProject(project)
          break
        }
        case 'template':
          onNewFromTemplate?.()
          break
        case 'command': {
          const cmd = result.data as HomeSlashCommand
          if (cmd.command === '/draft') {
            const firstSpace = searchTerm.indexOf(' ')
            const prefill = firstSpace > 0 ? searchTerm.slice(firstSpace + 1).trim() : undefined
            onAiDraft?.(prefill || undefined)
          } else if (cmd.command === '/template') {
            onNewFromTemplate?.()
          } else if (cmd.command === '/open') {
            onOpenFolder?.()
          } else if (cmd.command === '/help') {
            onOpenSettings?.()
          }
          break
        }
      }
    },
    [searchTerm, onOpenFolder, onNewFromTemplate, onAiDraft, onOpenSettings, openRecentProject]
  )

  // Slash prefix detection (editor mode only)
  const handleInputChange = useCallback(
    (value: string) => {
      if (isHomeMode) {
        setSearchTerm(value)
        return
      }
      // Check for slash prefix
      const spaceIdx = value.indexOf(' ')
      if (spaceIdx > 0) {
        const prefix = value.slice(0, spaceIdx).toLowerCase()
        const newMode = SLASH_PREFIXES[prefix]
        if (newMode) {
          setMode(newMode)
          setSearchTerm(value.slice(spaceIdx + 1))
          return
        }
      }
      setSearchTerm(value)
    },
    [isHomeMode]
  )

  // Reset state on mode change (editor mode only)
  useEffect(() => {
    if (isHomeMode) return
    // When entering PDF mode, restore any existing query from the store
    // (e.g. from Ctrl+F sync that pre-populates pdfSearchQuery before switching mode)
    let initialTerm = ''
    if (mode === 'pdf') {
      initialTerm = usePdfStore.getState().pdfSearchQuery
    }
    setSearchTerm(initialTerm)
    setSelectedKeys(new Set())
    setHighlightedIndex(0)
    setIsDropdownOpen(mode === 'pdf' && initialTerm.length > 0)
    setZoteroResults([])
    setOnlineResults([])
    setOnlineLoading(false)
    setTexResults([])
    setLoading(false)
  }, [mode, isHomeMode])

  // ---- CITE MODE: Filter local bib entries ----
  const citeResults = useMemo(() => {
    if (isHomeMode || mode !== 'cite' || !searchTerm) return []
    const q = searchTerm.toLowerCase()
    return bibEntries.filter(
      (e: BibEntry) =>
        e.key.toLowerCase().includes(q) ||
        e.title.toLowerCase().includes(q) ||
        e.author.toLowerCase().includes(q)
    )
  }, [isHomeMode, mode, searchTerm, bibEntries])

  useEffect(() => {
    if (isHomeMode) return
    if (mode === 'cite') {
      setHighlightedIndex(0)
      setIsDropdownOpen(searchTerm.length > 0)
    }
  }, [isHomeMode, mode, searchTerm, citeResults.length])

  // ---- ZOTERO MODE: Debounced API search ----
  const searchGenRef = useRef(0)
  useEffect(() => {
    const generation = ++searchGenRef.current
    if (isHomeMode || mode !== 'zotero') {
      setLoading(false)
      return
    }
    if (searchTerm.length <= 2) {
      setZoteroResults([])
      setLoading(false)
      setIsDropdownOpen(searchTerm.length > 0 && !zoteroEnabled)
      return
    }
    if (!zoteroEnabled) {
      setIsDropdownOpen(true)
      return
    }
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const res = await window.api.zoteroSearch(searchTerm, zoteroPort)
        if (searchGenRef.current !== generation) return
        setZoteroResults(res)
        setHighlightedIndex(0)
        setIsDropdownOpen(true)
      } catch {
        if (searchGenRef.current !== generation) return
        setZoteroResults([])
      } finally {
        if (searchGenRef.current === generation) setLoading(false)
      }
    }, 300)
    return () => {
      clearTimeout(timer)
      if (searchGenRef.current === generation) searchGenRef.current += 1
    }
  }, [isHomeMode, mode, searchTerm, zoteroPort, zoteroEnabled])

  // ---- ONLINE MODE: Debounced Crossref + arXiv search ----
  const onlineSearchGenRef = useRef(0)
  useEffect(() => {
    const generation = ++onlineSearchGenRef.current
    if (isHomeMode || mode !== 'online') {
      setOnlineLoading(false)
      return
    }
    const normalized = searchTerm.trim()
    if (normalized.length < 2) {
      setOnlineResults([])
      setOnlineLoading(false)
      setIsDropdownOpen(false)
      return
    }
    setOnlineLoading(true)
    const timer = setTimeout(async () => {
      try {
        const results = await window.api.researchSearchOnline(normalized)
        if (onlineSearchGenRef.current !== generation) return
        setOnlineResults(results)
        setHighlightedIndex(0)
        setIsDropdownOpen(true)
      } catch (error) {
        if (onlineSearchGenRef.current !== generation) return
        setOnlineResults([])
        logError('OmniSearch:onlineReferences', error)
        setIsDropdownOpen(true)
      } finally {
        if (onlineSearchGenRef.current === generation) setOnlineLoading(false)
      }
    }, 350)
    return () => {
      clearTimeout(timer)
      if (onlineSearchGenRef.current === generation) onlineSearchGenRef.current += 1
    }
  }, [isHomeMode, mode, searchTerm])

  const addOnlineReference = useCallback(
    async (reference: OnlineReference) => {
      try {
        const inserted = await addReferenceAtCursor({ source: 'online', reference })
        if (!inserted) {
          useNotificationStore.getState().pushNotification({
            id: 'omni-search:reference-insert-skipped',
            message: t('notifications.referenceInsertSkipped'),
            tone: 'warning'
          })
          return
        }
        setSearchTerm('')
        setOnlineResults([])
        setIsDropdownOpen(false)
      } catch (error) {
        logError('OmniSearch:addOnlineReference', error)
      }
    },
    [t]
  )

  // ---- PDF MODE: Drive usePdfSearch via store ----
  useEffect(() => {
    if (isHomeMode || mode !== 'pdf') return
    const pdfState = usePdfStore.getState()
    pdfState.setPdfSearchVisible(true)
    pdfState.setPdfSearchQuery(searchTerm)
    // Open dropdown to show match count/navigation when there's a query
    if (searchTerm.length > 0) {
      setIsDropdownOpen(true)
    }
  }, [isHomeMode, mode, searchTerm])

  useEffect(() => {
    if (isHomeMode || mode !== 'file') return
    setHighlightedIndex(0)
    setIsDropdownOpen(searchTerm.length > 0)
  }, [isHomeMode, mode, searchTerm, projectFileResults])

  const handleProjectFileSelect = useCallback(async (result: ProjectFileSearchResult) => {
    try {
      const file = await window.api.readFile(result.path)
      useEditorStore.getState().openFileInTab(file.filePath, file.content)
      setSearchTerm('')
      setIsDropdownOpen(false)
    } catch (error) {
      logError('OmniSearch:openProjectFile', error)
    }
  }, [])

  // Cleanup: hide PDF search when leaving PDF mode
  useEffect(() => {
    return () => {
      if (mode === 'pdf') {
        usePdfStore.getState().setPdfSearchVisible(false)
      }
    }
  }, [mode])

  // ---- TEX MODE: Search editor content ----
  useEffect(() => {
    if (isHomeMode) return
    if (mode !== 'tex') {
      setTexResults([])
      return
    }
    if (!searchTerm) {
      setTexResults([])
      setIsDropdownOpen(false)
      return
    }
    const filePath = useEditorStore.getState().filePath
    const content = filePath ? (documentRegistry.snapshot(filePath)?.text ?? '') : ''
    const lines = content.split('\n')
    const q = searchTerm.toLowerCase()
    const matches: TexSearchResult[] = []
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(q)) {
        matches.push({ line: i + 1, text: lines[i] })
      }
      if (matches.length >= 50) break // cap results
    }
    setTexResults(matches)
    setHighlightedIndex(0)
    setIsDropdownOpen(true)
    // Auto-jump to first match (skipFocus to keep input focused)
    if (matches.length > 0) {
      useEditorStore.getState().requestJumpToLine(matches[0].line, 1, true)
    }
  }, [isHomeMode, mode, searchTerm])

  // ---- Shared: toggle selection for cite/zotero ----
  const toggleSelection = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const insertCitation = useCallback(() => {
    const currentResults = mode === 'cite' ? citeResults : zoteroResults
    const keys =
      selectedKeys.size > 0
        ? Array.from(selectedKeys)
        : currentResults.length > 0
          ? [
              mode === 'cite'
                ? (currentResults[highlightedIndex] as BibEntry).key
                : (currentResults[highlightedIndex] as ZoteroSearchResult).citekey
            ]
          : []
    if (!keys.length) return

    const citeCmd = `\\cite{${keys.join(',')}}`
    useEditorStore.getState().requestInsertAtCursor(citeCmd)

    setSearchTerm('')
    setSelectedKeys(new Set())
    setIsDropdownOpen(false)
  }, [mode, selectedKeys, citeResults, zoteroResults, highlightedIndex])

  // ---- Tex: jump to line (keep dropdown open, don't steal focus from input) ----
  const jumpToLine = useCallback((line: number) => {
    useEditorStore.getState().requestJumpToLine(line, 1, true)
  }, [])

  const handleTexNext = useCallback(() => {
    if (texResults.length === 0) return
    const next = (highlightedIndex + 1) % texResults.length
    setHighlightedIndex(next)
    jumpToLine(texResults[next].line)
  }, [texResults, highlightedIndex, jumpToLine])

  const handleTexPrev = useCallback(() => {
    if (texResults.length === 0) return
    const prev = (highlightedIndex - 1 + texResults.length) % texResults.length
    setHighlightedIndex(prev)
    jumpToLine(texResults[prev].line)
  }, [texResults, highlightedIndex, jumpToLine])

  // ---- PDF: next/prev ----
  const handlePdfNext = useCallback(() => {
    usePdfStore.getState().requestPdfSearchNext()
  }, [])

  const handlePdfPrev = useCallback(() => {
    usePdfStore.getState().requestPdfSearchPrev()
  }, [])

  // ---- Keyboard handling ----
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDropdownOpen(false)
        ;(e.target as HTMLInputElement).blur()
        return
      }

      // Home mode keyboard
      if (isHomeMode) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          if (homeResults.length)
            setHomeHighlightedIndex((prev) => Math.min(prev + 1, homeResults.length - 1))
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          if (homeResults.length) setHomeHighlightedIndex((prev) => Math.max(prev - 1, 0))
        } else if (e.key === 'Home' && homeResults.length) {
          e.preventDefault()
          setHomeHighlightedIndex(0)
        } else if (e.key === 'End' && homeResults.length) {
          e.preventDefault()
          setHomeHighlightedIndex(homeResults.length - 1)
        } else if (e.key === 'Enter') {
          e.preventDefault()
          if (homeResults[homeHighlightedIndex]) {
            handleHomeSelect(homeResults[homeHighlightedIndex])
          }
        }
        return
      }

      if (mode === 'file') {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          if (projectFileResults.length) {
            setHighlightedIndex((previous) => (previous + 1) % projectFileResults.length)
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          if (projectFileResults.length) {
            setHighlightedIndex(
              (previous) => (previous - 1 + projectFileResults.length) % projectFileResults.length
            )
          }
        } else if (e.key === 'Home' && projectFileResults.length) {
          e.preventDefault()
          setHighlightedIndex(0)
        } else if (e.key === 'End' && projectFileResults.length) {
          e.preventDefault()
          setHighlightedIndex(projectFileResults.length - 1)
        } else if (e.key === 'Enter' && projectFileResults[highlightedIndex]) {
          e.preventDefault()
          void handleProjectFileSelect(projectFileResults[highlightedIndex])
        }
      } else if (mode === 'cite' || mode === 'zotero') {
        const results = mode === 'cite' ? citeResults : zoteroResults
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          if (results.length) setHighlightedIndex((prev) => (prev + 1) % results.length)
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          if (results.length)
            setHighlightedIndex((prev) => (prev - 1 + results.length) % results.length)
        } else if (e.key === 'Home' && results.length) {
          e.preventDefault()
          setHighlightedIndex(0)
        } else if (e.key === 'End' && results.length) {
          e.preventDefault()
          setHighlightedIndex(results.length - 1)
        } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          insertCitation()
        } else if (e.key === 'Enter') {
          e.preventDefault()
          if (results.length > 0) {
            const key =
              mode === 'cite'
                ? (results[highlightedIndex] as BibEntry).key
                : (results[highlightedIndex] as ZoteroSearchResult).citekey
            toggleSelection(key)
          }
        }
      } else if (mode === 'pdf') {
        if (e.key === 'Enter' && e.shiftKey) {
          e.preventDefault()
          handlePdfPrev()
        } else if (e.key === 'Enter') {
          e.preventDefault()
          handlePdfNext()
        }
      } else if (mode === 'online') {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          if (onlineResults.length) {
            setHighlightedIndex((previous) => (previous + 1) % onlineResults.length)
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          if (onlineResults.length) {
            setHighlightedIndex(
              (previous) => (previous - 1 + onlineResults.length) % onlineResults.length
            )
          }
        } else if (e.key === 'Home' && onlineResults.length) {
          e.preventDefault()
          setHighlightedIndex(0)
        } else if (e.key === 'End' && onlineResults.length) {
          e.preventDefault()
          setHighlightedIndex(onlineResults.length - 1)
        } else if (e.key === 'Enter' && onlineResults[highlightedIndex]) {
          e.preventDefault()
          void addOnlineReference(onlineResults[highlightedIndex])
        }
      } else if (mode === 'tex') {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          if (texResults.length) {
            const next = (highlightedIndex + 1) % texResults.length
            setHighlightedIndex(next)
            jumpToLine(texResults[next].line)
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          if (texResults.length) {
            const prev = (highlightedIndex - 1 + texResults.length) % texResults.length
            setHighlightedIndex(prev)
            jumpToLine(texResults[prev].line)
          }
        } else if (e.key === 'Home' && texResults.length) {
          e.preventDefault()
          setHighlightedIndex(0)
          jumpToLine(texResults[0].line)
        } else if (e.key === 'End' && texResults.length) {
          e.preventDefault()
          const last = texResults.length - 1
          setHighlightedIndex(last)
          jumpToLine(texResults[last].line)
        } else if (e.key === 'Enter' && e.shiftKey) {
          e.preventDefault()
          handleTexPrev()
        } else if (e.key === 'Enter') {
          e.preventDefault()
          handleTexNext()
        }
      }
    },
    [
      isHomeMode,
      homeResults,
      homeHighlightedIndex,
      handleHomeSelect,
      mode,
      projectFileResults,
      citeResults,
      zoteroResults,
      onlineResults,
      texResults,
      highlightedIndex,
      insertCitation,
      toggleSelection,
      jumpToLine,
      handlePdfNext,
      handlePdfPrev,
      handleTexNext,
      handleTexPrev,
      handleProjectFileSelect,
      addOnlineReference
    ]
  )

  // Clear
  const handleClear = useCallback(() => {
    setSearchTerm('')
    setSelectedKeys(new Set())
    setIsDropdownOpen(false)
    if (!isHomeMode && mode === 'pdf') {
      usePdfStore.getState().setPdfSearchQuery('')
      usePdfStore.getState().setPdfSearchVisible(false)
    }
    inputRef.current?.focus()
  }, [isHomeMode, mode])

  // Mode picker
  const handleModeSelect = useCallback((newMode: SearchMode) => {
    setMode(newMode)
    setIsModeMenuOpen(false)
    inputRef.current?.focus()
  }, [])

  const focusModeMenuItem = useCallback((position: CollectionFocusPosition): void => {
    focusCollectionItem<HTMLButtonElement>(modeMenuRef.current, '[role="menuitemradio"]', position)
  }, [])

  const openModeMenuFromKeyboard = (position: 'first' | 'last'): void => {
    setIsModeMenuOpen(true)
    requestAnimationFrame(() => focusModeMenuItem(position))
  }

  const handleModeMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusModeMenuItem('next')
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusModeMenuItem('previous')
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusModeMenuItem('first')
    } else if (event.key === 'End') {
      event.preventDefault()
      focusModeMenuItem('last')
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setIsModeMenuOpen(false)
      modeButtonRef.current?.focus()
    } else if (event.key === 'Tab') {
      setIsModeMenuOpen(false)
    }
  }

  const modeConfig = MODE_CONFIGS[mode]
  const ModeIcon = modeConfig.icon

  // Determine what to render in dropdown
  const renderDropdown = () => {
    if (isHomeMode) {
      return (
        <HomePanel
          homeResults={homeResults}
          homeHighlightedIndex={homeHighlightedIndex}
          setHomeHighlightedIndex={setHomeHighlightedIndex}
          handleHomeSelect={handleHomeSelect}
          getOptionId={getOptionId}
        />
      )
    }

    if (mode === 'cite') {
      return (
        <CitationSearchPanel
          citeResults={citeResults}
          searchTerm={searchTerm}
          highlightedIndex={highlightedIndex}
          setHighlightedIndex={setHighlightedIndex}
          selectedKeys={selectedKeys}
          toggleSelection={toggleSelection}
          getOptionId={getOptionId}
        />
      )
    }

    if (mode === 'file') {
      return (
        <ProjectFileSearchPanel
          results={projectFileResults}
          searchTerm={searchTerm}
          highlightedIndex={highlightedIndex}
          setHighlightedIndex={setHighlightedIndex}
          openFile={(result) => void handleProjectFileSelect(result)}
          getOptionId={getOptionId}
        />
      )
    }

    if (mode === 'zotero') {
      return (
        <ZoteroSearchPanel
          zoteroEnabled={zoteroEnabled}
          loading={loading}
          zoteroResults={zoteroResults}
          searchTerm={searchTerm}
          highlightedIndex={highlightedIndex}
          setHighlightedIndex={setHighlightedIndex}
          selectedKeys={selectedKeys}
          toggleSelection={toggleSelection}
          getOptionId={getOptionId}
        />
      )
    }

    if (mode === 'online') {
      return (
        <OnlineSearchPanel
          loading={onlineLoading}
          results={onlineResults}
          searchTerm={searchTerm}
          highlightedIndex={highlightedIndex}
          setHighlightedIndex={setHighlightedIndex}
          addReference={(reference) => void addOnlineReference(reference)}
          getOptionId={getOptionId}
        />
      )
    }

    if (mode === 'pdf') {
      return (
        <PdfSearchPanel
          pdfMatchCount={pdfMatchCount}
          pdfCurrentMatch={pdfCurrentMatch}
          searchTerm={searchTerm}
          handlePdfPrev={handlePdfPrev}
          handlePdfNext={handlePdfNext}
        />
      )
    }

    if (mode === 'tex') {
      return (
        <TexSearchPanel
          texResults={texResults}
          searchTerm={searchTerm}
          highlightedIndex={highlightedIndex}
          setHighlightedIndex={setHighlightedIndex}
          jumpToLine={jumpToLine}
          getOptionId={getOptionId}
        />
      )
    }

    return null
  }

  const showDropdown = isHomeMode
    ? isDropdownOpen && homeResults.length > 0
    : isDropdownOpen &&
      (mode === 'pdf'
        ? searchTerm.length > 0
        : mode === 'file'
          ? projectFileResults.length > 0 || searchTerm.length > 0
          : mode === 'cite'
            ? citeResults.length > 0 || searchTerm.length > 0
            : mode === 'zotero'
              ? (!zoteroEnabled && searchTerm.length > 0) ||
                zoteroResults.length > 0 ||
                loading ||
                searchTerm.length > 2
              : mode === 'online'
                ? onlineResults.length > 0 || onlineLoading || searchTerm.length > 1
                : texResults.length > 0 || searchTerm.length > 0)

  const selectableResultCount = isHomeMode
    ? homeResults.length
    : mode === 'file'
      ? projectFileResults.length
      : mode === 'cite'
        ? citeResults.length
        : mode === 'zotero'
          ? zoteroResults.length
          : mode === 'online'
            ? onlineResults.length
            : mode === 'tex'
              ? texResults.length
              : 0
  const activeIndex = isHomeMode ? homeHighlightedIndex : highlightedIndex
  const activeDescendant =
    showDropdown && selectableResultCount > 0
      ? getOptionId(Math.min(activeIndex, selectableResultCount - 1))
      : undefined
  const searchBusy = loading || onlineLoading
  const resultStatus = searchBusy
    ? t('omniSearch.searching')
    : selectableResultCount > 0
      ? t('omniSearch.resultCount', { count: selectableResultCount })
      : searchTerm
        ? mode === 'pdf' && !isHomeMode
          ? pdfMatchCount > 0
            ? t('omniSearch.matches', { current: pdfCurrentMatch + 1, total: pdfMatchCount })
            : t('omniSearch.noMatches')
          : t('omniSearch.noResults')
        : ''
  const translatedMode = isHomeMode ? t('omniSearch.home') : t(modeConfig.label)
  const popupRole = !isHomeMode && mode === 'pdf' ? 'dialog' : 'listbox'

  return (
    <div
      className={`omni-search-wrapper${isHomeMode ? ' omni-search-home-mode' : ''}`}
      ref={wrapperRef}
    >
      {isHomeMode ? (
        <div className="omni-search-home-icon" aria-hidden="true">
          <Search size={14} />
        </div>
      ) : (
        <div className="omni-search-mode-btn-wrapper" ref={modeMenuRef}>
          <button
            ref={modeButtonRef}
            type="button"
            className="omni-search-mode-btn"
            onClick={() => setIsModeMenuOpen(!isModeMenuOpen)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                openModeMenuFromKeyboard('first')
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                openModeMenuFromKeyboard('last')
              } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                openModeMenuFromKeyboard('first')
              } else if (event.key === 'Escape' && isModeMenuOpen) {
                event.preventDefault()
                setIsModeMenuOpen(false)
              }
            }}
            title={t('omniSearch.modeSelector', { mode: translatedMode })}
            aria-label={t('omniSearch.modeSelector', { mode: translatedMode })}
            aria-haspopup="menu"
            aria-expanded={isModeMenuOpen}
            aria-controls={isModeMenuOpen ? modeMenuId : undefined}
          >
            <ModeIcon size={14} aria-hidden="true" />
            <ChevronDown size={10} aria-hidden="true" />
          </button>
          {isModeMenuOpen && (
            <div
              id={modeMenuId}
              className="omni-search-mode-menu"
              role="menu"
              aria-label={t('omniSearch.modeMenuLabel')}
              onKeyDown={handleModeMenuKeyDown}
            >
              {(Object.keys(MODE_CONFIGS) as SearchMode[]).map((m) => {
                const cfg = MODE_CONFIGS[m]
                const Icon = cfg.icon
                return (
                  <button
                    key={m}
                    type="button"
                    className={`omni-search-mode-item${m === mode ? ' active' : ''}`}
                    onClick={() => handleModeSelect(m)}
                    role="menuitemradio"
                    aria-checked={m === mode}
                  >
                    <Icon size={14} aria-hidden="true" />
                    <span>{t(cfg.label)}</span>
                    <kbd>{cfg.shortcut}</kbd>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      <input
        id={inputId}
        ref={inputRef}
        className="omni-search-input"
        role="combobox"
        aria-label={t('omniSearch.searchLabel', { mode: translatedMode })}
        aria-autocomplete={popupRole === 'listbox' ? 'list' : undefined}
        aria-haspopup={popupRole}
        aria-expanded={showDropdown}
        aria-controls={showDropdown ? resultsId : undefined}
        aria-activedescendant={activeDescendant}
        aria-describedby={resultsStatusId}
        aria-busy={searchBusy}
        placeholder={isHomeMode ? t('searchBar.placeholder') : t(modeConfig.placeholder)}
        value={searchTerm}
        onChange={(e) => handleInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (isHomeMode) {
            if (homeResults.length > 0) setIsDropdownOpen(true)
          } else if (mode === 'file' && searchTerm.length > 0) setIsDropdownOpen(true)
          else if (mode === 'cite' && searchTerm.length > 0) setIsDropdownOpen(true)
          else if (
            mode === 'zotero' &&
            (zoteroResults.length > 0 || (!zoteroEnabled && searchTerm.length > 0))
          )
            setIsDropdownOpen(true)
          else if (mode === 'online' && searchTerm.length > 1) setIsDropdownOpen(true)
          else if (mode === 'tex' && searchTerm.length > 0) setIsDropdownOpen(true)
          else if (mode === 'pdf' && searchTerm.length > 0) setIsDropdownOpen(true)
        }}
      />

      {!isHomeMode && selectedKeys.size > 0 && (
        <span
          className="omni-search-badge"
          aria-label={t('omniSearch.selectedInsert', { count: selectedKeys.size })}
        >
          {selectedKeys.size}
        </span>
      )}

      {searchTerm && (
        <button
          type="button"
          className="omni-search-clear"
          onClick={handleClear}
          title={t('omniSearch.clearSearch')}
          aria-label={t('omniSearch.clearSearch')}
        >
          <X size={12} aria-hidden="true" />
        </button>
      )}

      <span
        id={resultsStatusId}
        className="omni-search-live-region"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {resultStatus}
      </span>

      {showDropdown && (
        <div className="omni-search-dropdown" ref={dropdownRef}>
          {!isHomeMode && mode === 'tex' && texResults.length > 0 && (
            <div className="omni-search-tex-nav">
              <span className="omni-search-tex-count">
                {t('omniSearch.matches', {
                  current: highlightedIndex + 1,
                  total: texResults.length
                })}
              </span>
              <button
                type="button"
                onClick={handleTexPrev}
                title={t('omniSearch.prevMatch')}
                aria-label={t('omniSearch.prevMatch')}
              >
                <ChevronUp size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleTexNext}
                title={t('omniSearch.nextMatch')}
                aria-label={t('omniSearch.nextMatch')}
              >
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            </div>
          )}
          <div
            id={resultsId}
            role={popupRole}
            aria-label={t('omniSearch.resultsLabel', { mode: translatedMode })}
            aria-busy={searchBusy}
            aria-multiselectable={
              popupRole === 'listbox' && !isHomeMode && (mode === 'cite' || mode === 'zotero')
                ? true
                : undefined
            }
          >
            {renderDropdown()}
          </div>
        </div>
      )}
    </div>
  )
}
