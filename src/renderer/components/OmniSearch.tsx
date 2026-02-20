import { useState, useCallback, useEffect, useRef, useMemo, useDeferredValue } from 'react'
import {
  BookOpen,
  Library,
  FileSearch,
  Code,
  ChevronDown,
  X,
  Search,
  FolderOpen,
  Terminal
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../store/useEditorStore'
import { useProjectStore } from '../store/useProjectStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { usePdfStore } from '../store/usePdfStore'
import { useUiStore } from '../store/useUiStore'
import { useClickOutside } from '../hooks/useClickOutside'
import { isFeatureEnabled } from '../utils/featureFlags'
import { templates } from '../data/templates'
import { openProject } from '../utils/openProject'
import { logError } from '../utils/errorMessage'
import {
  HomePanel,
  CitationSearchPanel,
  ZoteroSearchPanel,
  PdfSearchPanel,
  TexSearchPanel
} from './omnisearch-panels'
import type {
  SearchMode,
  ModeConfig,
  HomeSlashCommand,
  HomeResult,
  TexSearchResult
} from './omnisearch-panels'
import type { ZoteroSearchResult } from '../types/api'
import type { BibEntry, RecentProject } from '../../shared/types'

const MODE_CONFIGS: Record<SearchMode, ModeConfig> = {
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
  '/c': 'cite',
  '/cite': 'cite',
  '/z': 'zotero',
  '/zotero': 'zotero',
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
  const settings = useSettingsStore((s) => s.settings)
  const zoteroEnabled = isFeatureEnabled(settings, 'zotero')
  const zoteroPort = settings.zoteroPort
  const bibEntries = useProjectStore((s) => s.bibEntries)
  const projectRoot = useProjectStore((s) => s.projectRoot)
  const omniSearchFocusRequested = useUiStore((s) => s.omniSearchFocusRequested)
  const omniSearchFocusMode = useUiStore((s) => s.omniSearchFocusMode)
  const pdfMatchCount = usePdfStore((s) => s.pdfMatchCount)
  const pdfCurrentMatch = usePdfStore((s) => s.pdfCurrentMatch)

  const isHomeMode = !projectRoot

  const [mode, setMode] = useState<SearchMode>('cite')
  const [searchTerm, setSearchTerm] = useState('')
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  // Cite/Zotero state
  const [zoteroResults, setZoteroResults] = useState<ZoteroSearchResult[]>([])
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [loading, setLoading] = useState(false)

  // Tex search state
  const [texResults, setTexResults] = useState<TexSearchResult[]>([])

  // Home mode state
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [homeHighlightedIndex, setHomeHighlightedIndex] = useState(0)
  const deferredSearchTerm = useDeferredValue(searchTerm)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
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
    if (highlighted) {
      highlighted.scrollIntoView({ block: 'nearest' })
    }
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
      return HOME_SLASH_COMMANDS.filter((cmd) => cmd.command.startsWith(cmdPart)).map((cmd) => ({
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

    return results
  }, [isHomeMode, deferredSearchTerm, recentProjects, t])

  // Update dropdown state when home results change
  useEffect(() => {
    if (!isHomeMode) return
    setIsDropdownOpen(homeResults.length > 0)
    setHomeHighlightedIndex(0)
  }, [isHomeMode, homeResults])

  // ---- Home mode: select result ----
  const handleHomeSelect = useCallback(
    (result: HomeResult) => {
      setSearchTerm('')
      setIsDropdownOpen(false)

      switch (result.kind) {
        case 'project': {
          const project = result.data as RecentProject
          window.api
            .readDirectory(project.path)
            .then(() => openProject(project.path))
            .catch(() => {
              window.api
                .removeRecentProject(project.path)
                .then((s) => setRecentProjects(s.recentProjects ?? []))
                .catch((err) => logError('OmniSearch:removeRecent', err))
            })
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
    [searchTerm, onOpenFolder, onNewFromTemplate, onAiDraft, onOpenSettings]
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
      if (searchTerm && citeResults.length > 0) {
        setIsDropdownOpen(true)
      } else if (!searchTerm) {
        setIsDropdownOpen(false)
      }
    }
  }, [isHomeMode, mode, searchTerm, citeResults.length])

  // ---- ZOTERO MODE: Debounced API search ----
  const searchGenRef = useRef(0)
  useEffect(() => {
    if (isHomeMode || mode !== 'zotero') return
    if (searchTerm.length <= 2) {
      setZoteroResults([])
      setIsDropdownOpen(searchTerm.length > 0 && !zoteroEnabled)
      return
    }
    if (!zoteroEnabled) {
      setIsDropdownOpen(true)
      return
    }
    setLoading(true)
    const generation = ++searchGenRef.current
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
    return () => clearTimeout(timer)
  }, [isHomeMode, mode, searchTerm, zoteroPort, zoteroEnabled])

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
    const content = useEditorStore.getState().content
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
    setIsDropdownOpen(matches.length > 0)
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
    const state = useEditorStore.getState()
    const lines = state.content.split('\n')
    const lineIdx = state.cursorLine - 1
    const colIdx = state.cursorColumn - 1

    if (lineIdx >= 0 && lineIdx < lines.length) {
      const line = lines[lineIdx]
      lines[lineIdx] = line.slice(0, colIdx) + citeCmd + line.slice(colIdx)
      state.setContent(lines.join('\n'))
    } else {
      state.setContent(state.content + '\n' + citeCmd)
    }

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
        } else if (e.key === 'Enter') {
          e.preventDefault()
          if (homeResults[homeHighlightedIndex]) {
            handleHomeSelect(homeResults[homeHighlightedIndex])
          }
        }
        return
      }

      if (mode === 'cite' || mode === 'zotero') {
        const results = mode === 'cite' ? citeResults : zoteroResults
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          if (results.length) setHighlightedIndex((prev) => (prev + 1) % results.length)
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          if (results.length)
            setHighlightedIndex((prev) => (prev - 1 + results.length) % results.length)
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
      citeResults,
      zoteroResults,
      texResults,
      highlightedIndex,
      insertCitation,
      toggleSelection,
      jumpToLine,
      handlePdfNext,
      handlePdfPrev,
      handleTexNext,
      handleTexPrev
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
          handleTexPrev={handleTexPrev}
          handleTexNext={handleTexNext}
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
        : mode === 'cite'
          ? citeResults.length > 0 || searchTerm.length > 0
          : mode === 'zotero'
            ? (!zoteroEnabled && searchTerm.length > 0) ||
              zoteroResults.length > 0 ||
              loading ||
              searchTerm.length > 2
            : texResults.length > 0 || searchTerm.length > 0)

  return (
    <div
      className={`omni-search-wrapper${isHomeMode ? ' omni-search-home-mode' : ''}`}
      ref={wrapperRef}
    >
      {isHomeMode ? (
        <div className="omni-search-home-icon">
          <Search size={14} />
        </div>
      ) : (
        <div className="omni-search-mode-btn-wrapper" ref={modeMenuRef}>
          <button
            className="omni-search-mode-btn"
            onClick={() => setIsModeMenuOpen(!isModeMenuOpen)}
            title="Search mode"
          >
            <ModeIcon size={14} />
            <ChevronDown size={10} />
          </button>
          {isModeMenuOpen && (
            <div className="omni-search-mode-menu">
              {(Object.keys(MODE_CONFIGS) as SearchMode[]).map((m) => {
                const cfg = MODE_CONFIGS[m]
                const Icon = cfg.icon
                return (
                  <button
                    key={m}
                    className={`omni-search-mode-item${m === mode ? ' active' : ''}`}
                    onClick={() => handleModeSelect(m)}
                  >
                    <Icon size={14} />
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
        ref={inputRef}
        className="omni-search-input"
        placeholder={isHomeMode ? t('searchBar.placeholder') : t(modeConfig.placeholder)}
        value={searchTerm}
        onChange={(e) => handleInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (isHomeMode) {
            if (homeResults.length > 0) setIsDropdownOpen(true)
          } else if (mode === 'cite' && citeResults.length > 0) setIsDropdownOpen(true)
          else if (
            mode === 'zotero' &&
            (zoteroResults.length > 0 || (!zoteroEnabled && searchTerm.length > 0))
          )
            setIsDropdownOpen(true)
          else if (mode === 'tex' && texResults.length > 0) setIsDropdownOpen(true)
          else if (mode === 'pdf' && searchTerm.length > 0) setIsDropdownOpen(true)
        }}
      />

      {!isHomeMode && selectedKeys.size > 0 && (
        <span className="omni-search-badge">{selectedKeys.size}</span>
      )}

      {searchTerm && (
        <button className="omni-search-clear" onClick={handleClear} title="Clear">
          <X size={12} />
        </button>
      )}

      {showDropdown && (
        <div className="omni-search-dropdown" ref={dropdownRef}>
          {renderDropdown()}
        </div>
      )}
    </div>
  )
}
