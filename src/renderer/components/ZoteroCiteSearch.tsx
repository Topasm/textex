import { useState, useCallback, useEffect, useRef } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { useUiStore } from '../store/useUiStore'
import { useClickOutside } from '../hooks/useClickOutside'
import type { ZoteroSearchResult } from '../types/api'

/**
 * Zotero citation search widget extracted from Toolbar.
 * Includes: debounced search, dropdown with keyboard navigation,
 * multi-select with Ctrl+Enter insert, badge showing selection count.
 */
export function ZoteroCiteSearch() {
  const zoteroPort = useSettingsStore((s) => s.settings.zoteroPort)
  const citeSearchFocusRequested = useUiStore((s) => s.citeSearchFocusRequested)

  const [searchTerm, setSearchTerm] = useState('')
  const [results, setResults] = useState<ZoteroSearchResult[]>([])
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const citeSearchRef = useRef<HTMLDivElement>(null)
  const citeInputRef = useRef<HTMLInputElement>(null)

  const closeCiteDropdown = useCallback(() => setIsDropdownOpen(false), [])
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
      useUiStore.getState().clearCiteSearchFocus()
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
    const keys =
      selectedKeys.size > 0
        ? Array.from(selectedKeys)
        : results.length > 0
          ? [results[highlightedIndex].citekey]
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
    setResults([])
    setSelectedKeys(new Set())
    setIsDropdownOpen(false)
  }, [selectedKeys, results, highlightedIndex])

  const handleCiteKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDropdownOpen(false)
        ;(e.target as HTMLInputElement).blur()
      } else if (e.key === 'ArrowDown') {
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
          toggleSelection(results[highlightedIndex].citekey)
        }
      }
    },
    [results, highlightedIndex, insertCitation, toggleSelection]
  )

  return (
    <div className="cite-search-wrapper" ref={citeSearchRef}>
      <input
        ref={citeInputRef}
        className="cite-search-input"
        placeholder="Search Zotero..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        onKeyDown={handleCiteKeyDown}
        onFocus={() => {
          if (results.length) setIsDropdownOpen(true)
        }}
      />
      {selectedKeys.size > 0 && <span className="cite-search-badge">{selectedKeys.size}</span>}
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
  )
}
