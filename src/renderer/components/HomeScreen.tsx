import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FolderOpen, Clock, FileText, Search, X, Terminal, BookOpen, Settings, MoreVertical, Pin, Tag, Trash2 } from 'lucide-react'
import type { RecentProject } from '../../shared/types'
import { templates } from '../data/templates'
import { openProject } from '../utils/openProject'

interface HomeScreenProps {
  onOpenFolder: () => void
  onNewFromTemplate: () => void
  onAiDraft: (prefill?: string) => void
  onOpenSettings: () => void
}

interface SlashCommand {
  command: string
  label: string
  description: string
  icon: React.ReactNode
}

const SLASH_COMMANDS: SlashCommand[] = [
  { command: '/draft', label: '/draft', description: 'AI-generate a LaTeX document', icon: <FileText size={16} /> },
  { command: '/template', label: '/template', description: 'Create from a template', icon: <BookOpen size={16} /> },
  { command: '/open', label: '/open', description: 'Open a project folder', icon: <FolderOpen size={16} /> },
  { command: '/help', label: '/help', description: 'Open settings & help', icon: <Settings size={16} /> }
]

type SearchResultKind = 'project' | 'template' | 'command'

interface SearchResult {
  kind: SearchResultKind
  label: string
  detail: string
  badge: string
  data: RecentProject | { name: string; description: string } | SlashCommand
}

function formatRelativeDate(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7)
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30)
    return months === 1 ? '1 month ago' : `${months} months ago`
  }
  return date.toLocaleDateString()
}

function HomeScreen({ onOpenFolder, onNewFromTemplate, onAiDraft, onOpenSettings }: HomeScreenProps) {
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Kebab menu & tag editor state
  const [menuOpenPath, setMenuOpenPath] = useState<string | null>(null)
  const [editingTagPath, setEditingTagPath] = useState<string | null>(null)
  const [tagInputValue, setTagInputValue] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const tagEditorRef = useRef<HTMLDivElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.api.loadSettings().then((settings) => {
      setRecentProjects(settings.recentProjects ?? [])
    }).catch(() => {})
  }, [])

  // Auto-focus search on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  // Click-outside handler for kebab menu and tag editor
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuOpenPath && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenPath(null)
      }
      if (editingTagPath && tagEditorRef.current && !tagEditorRef.current.contains(e.target as Node)) {
        setEditingTagPath(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpenPath, editingTagPath])

  // Focus tag input when editor opens
  useEffect(() => {
    if (editingTagPath) {
      setTimeout(() => tagInputRef.current?.focus(), 50)
    }
  }, [editingTagPath])

  // Sort projects: pinned first, then original order
  const sortedProjects = useMemo(() => {
    const pinned = recentProjects.filter((p) => p.pinned)
    const unpinned = recentProjects.filter((p) => !p.pinned)
    return [...pinned, ...unpinned]
  }, [recentProjects])

  const filteredResults = useMemo<SearchResult[]>(() => {
    const q = query.trim()
    if (!q) return []

    if (q.startsWith('/')) {
      const cmdQuery = q.toLowerCase()
      // Extract the first word (the command) and the rest (arguments)
      const firstSpace = q.indexOf(' ')
      const cmdPart = firstSpace > 0 ? q.slice(0, firstSpace).toLowerCase() : cmdQuery

      return SLASH_COMMANDS
        .filter((cmd) => cmd.command.startsWith(cmdPart))
        .map((cmd) => ({
          kind: 'command' as const,
          label: cmd.label,
          detail: cmd.description,
          badge: 'Command',
          data: cmd
        }))
    }

    const lower = q.toLowerCase()
    const results: SearchResult[] = []

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
          badge: 'Recent',
          data: project
        })
      }
    }

    for (const t of templates) {
      if (
        t.name.toLowerCase().includes(lower) ||
        t.description.toLowerCase().includes(lower)
      ) {
        results.push({
          kind: 'template',
          label: t.name,
          detail: t.description,
          badge: 'Template',
          data: t
        })
      }
    }

    return results
  }, [query, recentProjects])

  // Open/close dropdown based on results
  useEffect(() => {
    setIsDropdownOpen(filteredResults.length > 0)
    setSelectedIndex(0)
  }, [filteredResults])

  const handleSelectResult = useCallback((result: SearchResult) => {
    setQuery('')
    setIsDropdownOpen(false)

    switch (result.kind) {
      case 'project': {
        const project = result.data as RecentProject
        window.api.readDirectory(project.path)
          .then(() => openProject(project.path))
          .catch(() => {
            window.api.removeRecentProject(project.path).then((settings) => {
              setRecentProjects(settings.recentProjects ?? [])
            }).catch(() => {})
          })
        break
      }
      case 'template':
        onNewFromTemplate()
        break
      case 'command': {
        const cmd = result.data as SlashCommand
        if (cmd.command === '/draft') {
          // Extract everything after "/draft "
          const firstSpace = query.indexOf(' ')
          const prefill = firstSpace > 0 ? query.slice(firstSpace + 1).trim() : undefined
          onAiDraft(prefill || undefined)
        } else if (cmd.command === '/template') {
          onNewFromTemplate()
        } else if (cmd.command === '/open') {
          onOpenFolder()
        } else if (cmd.command === '/help') {
          onOpenSettings()
        }
        break
      }
    }
  }, [query, onOpenFolder, onNewFromTemplate, onAiDraft, onOpenSettings])

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isDropdownOpen) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, filteredResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredResults[selectedIndex]) {
        handleSelectResult(filteredResults[selectedIndex])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setIsDropdownOpen(false)
    }
  }, [isDropdownOpen, filteredResults, selectedIndex, handleSelectResult])

  const handleOpenRecent = useCallback(async (project: RecentProject) => {
    try {
      await window.api.readDirectory(project.path)
      await openProject(project.path)
    } catch {
      window.api.removeRecentProject(project.path).then((settings) => {
        setRecentProjects(settings.recentProjects ?? [])
      }).catch(() => {})
    }
  }, [])

  const handleRemoveRecent = useCallback((e: React.MouseEvent, projectPath: string) => {
    e.stopPropagation()
    setMenuOpenPath(null)
    window.api.removeRecentProject(projectPath).then((settings) => {
      setRecentProjects(settings.recentProjects ?? [])
    }).catch(() => {})
  }, [])

  const handleToggleMenu = useCallback((e: React.MouseEvent, projectPath: string) => {
    e.stopPropagation()
    setMenuOpenPath((prev) => (prev === projectPath ? null : projectPath))
    setEditingTagPath(null)
  }, [])

  const handleTogglePin = useCallback((e: React.MouseEvent, project: RecentProject) => {
    e.stopPropagation()
    setMenuOpenPath(null)
    window.api.updateRecentProject(project.path, { pinned: !project.pinned }).then((settings) => {
      setRecentProjects(settings.recentProjects ?? [])
    }).catch(() => {})
  }, [])

  const handleEditTag = useCallback((e: React.MouseEvent, project: RecentProject) => {
    e.stopPropagation()
    setMenuOpenPath(null)
    setTagInputValue(project.tag ?? '')
    setEditingTagPath(project.path)
  }, [])

  const handleSaveTag = useCallback((projectPath: string) => {
    const trimmed = tagInputValue.trim()
    window.api.updateRecentProject(projectPath, { tag: trimmed || undefined }).then((settings) => {
      setRecentProjects(settings.recentProjects ?? [])
    }).catch(() => {})
    setEditingTagPath(null)
  }, [tagInputValue])

  const resultIcon = (result: SearchResult): React.ReactNode => {
    switch (result.kind) {
      case 'project':
        return <FolderOpen size={16} />
      case 'template':
        return <BookOpen size={16} />
      case 'command':
        return <Terminal size={16} />
    }
  }

  return (
    <div className="home-screen">
      <div className="home-brand">
        <h1 className="home-title">TextEx</h1>
        <p className="home-subtitle">LaTeX Editor</p>
      </div>

      <div className="home-search-wrapper">
        <div className="home-search-bar">
          <Search size={16} className="search-icon" />
          <input
            ref={inputRef}
            className="home-search-input"
            type="text"
            placeholder="Search projects, templates, or type / for commands..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => { if (filteredResults.length > 0) setIsDropdownOpen(true) }}
          />
          {query && (
            <button className="home-search-clear" onClick={() => { setQuery(''); inputRef.current?.focus() }}>
              <X size={14} />
            </button>
          )}
        </div>

        {isDropdownOpen && filteredResults.length > 0 && (
          <div className="home-search-dropdown">
            {filteredResults.map((result, i) => (
              <div
                key={`${result.kind}-${result.label}-${i}`}
                className={`home-search-result${i === selectedIndex ? ' selected' : ''}`}
                onMouseEnter={() => setSelectedIndex(i)}
                onClick={() => handleSelectResult(result)}
              >
                <span className="home-search-result-icon">{resultIcon(result)}</span>
                <div className="home-search-result-text">
                  <span className="home-search-result-label">{result.label}</span>
                  <span className="home-search-result-detail">{result.detail}</span>
                </div>
                <span className="home-search-result-badge">{result.badge}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="home-actions">
        <button className="home-action-btn home-action-primary" onClick={onOpenFolder}>
          <FolderOpen size={18} />
          Open Folder
        </button>
        <button className="home-action-btn" onClick={onNewFromTemplate}>
          <FileText size={18} />
          New from Template
        </button>
      </div>

      {sortedProjects.length > 0 && (
        <div className="home-recent">
          <h2 className="home-recent-title">
            <Clock size={16} />
            Recent Projects
          </h2>
          <div className="home-recent-list">
            {sortedProjects.map((project) => (
              <div
                key={project.path}
                className={`home-recent-item${project.pinned ? ' pinned' : ''}`}
                onClick={() => handleOpenRecent(project)}
              >
                {project.pinned && (
                  <span className="home-recent-item-pin-indicator">
                    <Pin size={12} />
                  </span>
                )}
                <FolderOpen size={20} className="home-recent-item-icon" />
                <div className="home-recent-item-info">
                  <span className="home-recent-item-title">{project.title || project.name}</span>
                  <span className="home-recent-item-folder">{project.name}</span>
                </div>
                <div className="home-recent-item-meta">
                  <span className="home-recent-item-date">{formatRelativeDate(project.lastOpened)}</span>
                  {project.tag && (
                    <span className="home-recent-item-tag">{project.tag}</span>
                  )}
                </div>

                {/* Kebab menu */}
                <div className="home-recent-item-menu-wrapper" ref={menuOpenPath === project.path ? menuRef : undefined}>
                  <button
                    className="home-recent-item-menu-btn"
                    onClick={(e) => handleToggleMenu(e, project.path)}
                    title="More actions"
                  >
                    <MoreVertical size={14} />
                  </button>

                  {menuOpenPath === project.path && (
                    <div className="home-recent-item-dropdown">
                      <button onClick={(e) => handleTogglePin(e, project)}>
                        <Pin size={14} />
                        {project.pinned ? 'Unpin' : 'Pin'}
                      </button>
                      <button onClick={(e) => handleEditTag(e, project)}>
                        <Tag size={14} />
                        Edit Tag
                      </button>
                      <button className="danger" onClick={(e) => handleRemoveRecent(e, project.path)}>
                        <Trash2 size={14} />
                        Remove
                      </button>
                    </div>
                  )}

                  {editingTagPath === project.path && (
                    <div className="home-recent-item-tag-editor" ref={tagEditorRef} onClick={(e) => e.stopPropagation()}>
                      <input
                        ref={tagInputRef}
                        className="home-recent-item-tag-input"
                        type="text"
                        placeholder="e.g. NeurIPS 2025"
                        value={tagInputValue}
                        onChange={(e) => setTagInputValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleSaveTag(project.path)
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            setEditingTagPath(null)
                          }
                        }}
                      />
                      <button
                        className="home-recent-item-tag-save"
                        onClick={() => handleSaveTag(project.path)}
                      >
                        Save
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default HomeScreen
