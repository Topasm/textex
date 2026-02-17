import React, { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { ZoteroSearchResult } from '../types/api'
// No need to import styles if they are global or handled by a CSS file.
// Assuming basic styles are needed or global styles are used.

interface ZoteroCiteModalProps {
    isOpen: boolean
    onClose: () => void
    onInsert: (citekeys: string[]) => void
}

export const ZoteroCiteModal: React.FC<ZoteroCiteModalProps> = ({ isOpen, onClose, onInsert }) => {
    const [searchTerm, setSearchTerm] = useState('')
    const [results, setResults] = useState<ZoteroSearchResult[]>([])
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [highlightedIndex, setHighlightedIndex] = useState(0)

    const inputRef = useRef<HTMLInputElement>(null)
    const settings = useAppStore((state) => state.settings)

    useEffect(() => {
        if (isOpen) {
            setSearchTerm('')
            setResults([])
            setSelectedKeys(new Set())
            setError(null)
            setHighlightedIndex(0)
            setTimeout(() => inputRef.current?.focus(), 100)
        }
    }, [isOpen])

    useEffect(() => {
        const delayDebounce = setTimeout(async () => {
            if (searchTerm.length > 2) {
                setLoading(true)
                setError(null)
                try {
                    const res = await window.api.zoteroSearch(searchTerm, settings.zoteroPort)
                    setResults(res)
                    setHighlightedIndex(0)
                    if (res.length === 0) {
                        setError('No results found')
                    }
                } catch {
                    setError('Failed to connect to Zotero (Better BibTeX)')
                    setResults([])
                } finally {
                    setLoading(false)
                }
            } else {
                setResults([])
            }
        }, 300)

        return () => clearTimeout(delayDebounce)
    }, [searchTerm, settings.zoteroPort])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose()
        } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlightedIndex((prev) => (prev + 1) % results.length)
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlightedIndex((prev) => (prev - 1 + results.length) % results.length)
        } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            confirmInsert()
        } else if (e.key === 'Enter') {
            e.preventDefault()
            if (results.length > 0) {
                toggleSelection(results[highlightedIndex].citekey)
            }
        } else if (e.key === ' ' && e.ctrlKey) { // Example: Ctrl+Space to confirm insertion, or just a button
            // Logic for inserting selected keys
            // But let's make it simpler: Enter selects/deselects. A separate button or Ctrl+Enter inserts.
        }
    }

    const toggleSelection = (key: string) => {
        const newSet = new Set(selectedKeys)
        if (newSet.has(key)) {
            newSet.delete(key)
        } else {
            newSet.add(key)
        }
        setSelectedKeys(newSet)
    }

    const confirmInsert = () => {
        // If nothing selected but we have a highlighted item, select it and insert
        if (selectedKeys.size === 0 && results.length > 0) {
            onInsert([results[highlightedIndex].citekey])
        } else if (selectedKeys.size > 0) {
            onInsert(Array.from(selectedKeys))
        }
        onClose()
    }

    if (!isOpen) return null

    return (
        <div className="modal-overlay" onMouseDown={onClose}>
            <div className="modal-content zotero-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Search Zotero</h3>
                    <button className="close-button" onClick={onClose}>&times;</button>
                </div>

                <div className="modal-body">
                    <input
                        ref={inputRef}
                        type="text"
                        className="zotero-search-input"
                        placeholder="Search title, author, year..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />

                    <div className="zotero-results-list">
                        {loading && <div className="zotero-loading">Searching...</div>}
                        {error && !loading && <div className="zotero-error">{error}</div>}
                        {!loading && !error && results.length === 0 && searchTerm.length <= 2 && (
                            <div className="zotero-hint">Type at least 3 characters to search your Zotero library</div>
                        )}

                        {!loading && results.map((item, index) => (
                            <div
                                key={item.citekey}
                                className={`zotero-result-item ${index === highlightedIndex ? 'highlighted' : ''} ${selectedKeys.has(item.citekey) ? 'selected' : ''}`}
                                onClick={() => toggleSelection(item.citekey)}
                                onDoubleClick={confirmInsert}
                            >
                                <div className="zotero-item-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={selectedKeys.has(item.citekey)}
                                        readOnly
                                    />
                                </div>
                                <div className="zotero-item-details">
                                    <div className="zotero-item-title">{item.title}</div>
                                    <div className="zotero-item-meta">
                                        {item.author} • {item.year} • <span className="zotero-item-type">{item.type}</span>
                                    </div>
                                    <div className="zotero-item-citekey">
                                        @{item.citekey}
                                        <button
                                            className="zotero-show-link"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                window.api.openExternal(`zotero://select/items/@${item.citekey}`)
                                            }}
                                            title="Show in Zotero"
                                        >
                                            Show in Zotero ↗
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="modal-footer">
                    <div className="zotero-status">
                        {selectedKeys.size === 0
                            ? 'Enter to select, Ctrl+Enter to insert'
                            : `${selectedKeys.size} selected — Ctrl+Enter to insert`}
                    </div>
                    <div className="modal-actions">
                        <button onClick={onClose}>Cancel</button>
                        <button
                            className="primary-button"
                            onClick={confirmInsert}
                            disabled={selectedKeys.size === 0 && results.length === 0}
                        >
                            Insert Citation
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
