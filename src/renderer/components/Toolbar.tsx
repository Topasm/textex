import { useState, useCallback, useEffect, useRef } from 'react'
import { Settings, Home, ChevronDown } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { useClickOutside } from '../hooks/useClickOutside'
import type { ZoteroSearchResult } from '../types/api'

interface ToolbarProps {
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  onCompile: () => void
  onToggleLog: () => void
  onOpenFolder: () => void
  onReturnHome: () => void
  onNewFromTemplate: () => void
  onAiDraft: () => void
  onExport: (format: string) => void
  onOpenSettings: () => void
}

const exportFormats = [
  { name: 'HTML', ext: 'html' },
  { name: 'Word (DOCX)', ext: 'docx' },
  { name: 'OpenDocument (ODT)', ext: 'odt' },
  { name: 'EPUB', ext: 'epub' }
]

function Toolbar({
  onOpen,
  onSave,
  onSaveAs,
  onCompile,
  onToggleLog,
  onOpenFolder,
  onReturnHome,
  onNewFromTemplate,
  onAiDraft,
  onExport,
  onOpenSettings
}: ToolbarProps) {
  const filePath = useAppStore((s) => s.filePath)
  const isDirty = useAppStore((s) => s.isDirty)
  const compileStatus = useAppStore((s) => s.compileStatus)
  const zoteroEnabled = useAppStore((s) => s.settings.zoteroEnabled)
  const zoteroPort = useAppStore((s) => s.settings.zoteroPort)
  const citeSearchFocusRequested = useAppStore((s) => s.citeSearchFocusRequested)

  // PDF State
  const zoomLevel = useAppStore((s) => s.zoomLevel)


  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false)
  const fileMenuRef = useRef<HTMLDivElement>(null)

  // Cite search state
  const [searchTerm, setSearchTerm] = useState('')
  const [results, setResults] = useState<ZoteroSearchResult[]>([])
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const citeSearchRef = useRef<HTMLDivElement>(null)
  const citeInputRef = useRef<HTMLInputElement>(null)

  const fileName = filePath ? filePath.split(/[\\/]/).pop() : 'Untitled'

  // Close menus when clicking outside
  const closeFileMenu = useCallback(() => setIsFileMenuOpen(false), [])
  const closeCiteDropdown = useCallback(() => setIsDropdownOpen(false), [])
  useClickOutside(fileMenuRef, closeFileMenu, isFileMenuOpen)
  useClickOutside(citeSearchRef, closeCiteDropdown, isDropdownOpen)

  // Debounced Zotero search with stale result protection
  const searchGenRef = useRef(0)
  useEffect(() => {
    if (searchTerm.length <= 2) {
      setResults([])
      setIsDropdownOpen(false)
      return
    }
    setLoading(true)
    const generation = ++searchGenRef.current
    const timer = setTimeout(async () => {
      try {
        const res = await window.api.zoteroSearch(searchTerm, zoteroPort)
        // Only update if this is still the latest search
        if (searchGenRef.current !== generation) return
        setResults(res)
        setHighlightedIndex(0)
        setIsDropdownOpen(true)
      } catch {
        if (searchGenRef.current !== generation) return
        setResults([])
      } finally {
        if (searchGenRef.current === generation) {
          setLoading(false)
        }
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchTerm, zoteroPort])

  // Focus cite search input when requested via store
  useEffect(() => {
    if (citeSearchFocusRequested) {
      citeInputRef.current?.focus()
      useAppStore.getState().clearCiteSearchFocus()
    }
  }, [citeSearchFocusRequested])

  const toggleSelection = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  const insertCitation = useCallback(() => {
    const keys = selectedKeys.size > 0
      ? Array.from(selectedKeys)
      : results.length > 0 ? [results[highlightedIndex].citekey] : []
    if (!keys.length) return

    const citeCmd = `\\cite{${keys.join(',')}}`
    const state = useAppStore.getState()
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
    setResults([])
    setSelectedKeys(new Set())
    setIsDropdownOpen(false)
  }, [selectedKeys, results, highlightedIndex])

  const handleCiteKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsDropdownOpen(false)
      ;(e.target as HTMLInputElement).blur()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (results.length) setHighlightedIndex((prev) => (prev + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (results.length) setHighlightedIndex((prev) => (prev - 1 + results.length) % results.length)
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      insertCitation()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results.length > 0) {
        toggleSelection(results[highlightedIndex].citekey)
      }
    }
  }, [results, highlightedIndex, insertCitation, toggleSelection])

  const projectRoot = useAppStore((s) => s.projectRoot)

  // Sync Handlers
  const handleSyncToCode = useCallback(() => {
    useAppStore.getState().triggerSyncToCode()
  }, [])

  const handleSyncToPdf = useCallback(() => {
    const state = useAppStore.getState()
    if (!state.filePath) return
    window.api.synctexForward(state.filePath, state.cursorLine).then((result) => {
      if (result) {
        useAppStore.getState().setSynctexHighlight(result)
      }
    })
  }, [])

  return (
    <div className="toolbar">
      {projectRoot && (
        <button onClick={onReturnHome} title="Return to home screen">
          <Home size={16} />
        </button>
      )}

      {/* File Menu */}
      <div className="menu-dropdown" ref={fileMenuRef}>
        <button onClick={() => setIsFileMenuOpen(!isFileMenuOpen)} title="File operations">
          File <ChevronDown size={12} />
        </button>
        {isFileMenuOpen && (
          <div className="menu-dropdown-content">
            <button onClick={() => { onOpen(); setIsFileMenuOpen(false) }}>
              Open <kbd>Ctrl+O</kbd>
            </button>
            <button onClick={() => { onOpenFolder(); setIsFileMenuOpen(false) }}>
              Open Folder
            </button>
            <button onClick={() => { onSave(); setIsFileMenuOpen(false) }}>
              Save <kbd>Ctrl+S</kbd>
            </button>
            <button onClick={() => { onSaveAs(); setIsFileMenuOpen(false) }}>
              Save As <kbd>Ctrl+Shift+S</kbd>
            </button>
            <div className="toolbar-separator" style={{ height: '1px', width: '100%', margin: '4px 0' }} />
            <button onClick={() => { onNewFromTemplate(); setIsFileMenuOpen(false) }}>
              New from Template
            </button>
            <div className="toolbar-separator" style={{ height: '1px', width: '100%', margin: '4px 0' }} />
            <div style={{ padding: '4px 12px', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Export</div>
            {exportFormats.map(fmt => (
              <button key={fmt.ext} onClick={() => { onExport(fmt.ext); setIsFileMenuOpen(false) }} style={{ paddingLeft: '24px' }}>
                {fmt.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        className={isDirty ? 'save-btn-dirty' : undefined}
        onClick={onSave}
        title="Quick Save (Ctrl+S)"
      >
        Save
      </button>

      <span className="toolbar-separator" />

      <button
        className="compile-btn"
        onClick={onCompile}
        disabled={compileStatus === 'compiling'}
        title="Compile LaTeX (Ctrl+Enter)"
      >
        {compileStatus === 'compiling' ? 'Compiling...' : 'Compile'}
        <kbd>Ctrl+Enter</kbd>
      </button>

      <button onClick={onToggleLog} title="Toggle log panel (Ctrl+L)">
        Log
      </button>

      {useAppStore((s) => !!s.settings.aiProvider) && (
        <button onClick={onAiDraft} title="AI Draft (Ctrl+Shift+D)">
          AI Draft
        </button>
      )}

      <button onClick={onOpenSettings} title="Settings">
        <Settings size={16} />
      </button>

      {zoteroEnabled && (
        <>
          <span className="toolbar-separator" />
          <div className="cite-search-wrapper" ref={citeSearchRef}>
            <input
              ref={citeInputRef}
              className="cite-search-input"
              placeholder="Search Zotero..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleCiteKeyDown}
              onFocus={() => { if (results.length) setIsDropdownOpen(true) }}
            />
            {selectedKeys.size > 0 && (
              <span className="cite-search-badge">{selectedKeys.size}</span>
            )}
            {isDropdownOpen && (results.length > 0 || loading) && (
              <div className="cite-search-dropdown">
                {loading && <div className="cite-search-loading">Searching...</div>}
                {results.map((item, i) => (
                  <div
                    key={item.citekey}
                    className={`cite-search-result${i === highlightedIndex ? ' highlighted' : ''}${selectedKeys.has(item.citekey) ? ' selected' : ''}`}
                    onClick={() => toggleSelection(item.citekey)}
                    onMouseEnter={() => setHighlightedIndex(i)}
                  >
                    <input type="checkbox" checked={selectedKeys.has(item.citekey)} readOnly />
                    <div className="cite-search-result-text">
                      <span className="cite-search-result-title">{item.title}</span>
                      <span className="cite-search-result-meta">
                        {item.author} · {item.year} · @{item.citekey}
                      </span>
                    </div>
                  </div>
                ))}
                <div className="cite-search-footer">
                  {selectedKeys.size === 0
                    ? 'Enter to select · Ctrl+Enter to insert'
                    : `${selectedKeys.size} selected · Ctrl+Enter to insert`}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Right side: PDF Controls & File Info */}
      <div className="toolbar-group-right">
        {/* PDF Controls */}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button onClick={handleSyncToCode} title="Sync PDF to Code (Ctrl+Click in PDF)" style={{ padding: '4px 8px' }}>
            {'\u2190'}
          </button>
          <button onClick={handleSyncToPdf} title="Sync Code to PDF" style={{ padding: '4px 8px' }}>
            {'\u2192'}
          </button>
          <div className="toolbar-separator" />
          <button onClick={() => useAppStore.getState().zoomOut()} disabled={zoomLevel <= 25} title="Zoom Out" style={{ padding: '4px 8px' }}>
            -
          </button>
          <span style={{ fontSize: '12px', minWidth: '36px', textAlign: 'center' }}>{zoomLevel}%</span>
          <button onClick={() => useAppStore.getState().zoomIn()} disabled={zoomLevel >= 400} title="Zoom In" style={{ padding: '4px 8px' }}>
            +
          </button>
          <button onClick={() => useAppStore.getState().resetZoom()} title="Fit Width" style={{ padding: '4px 8px' }}>
            Fit Width
          </button>
        </div>

        <span className="file-name">
          {isDirty && <span className="dirty-dot" />}
          {fileName}
        </span>
      </div>
    </div>
  )
}

export default Toolbar
