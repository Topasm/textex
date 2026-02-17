import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FolderOpen, Clock, Trash2, FileText, Search, X, Terminal, BookOpen, Settings } from 'lucide-react'
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

  useEffect(() => {
    window.api.loadSettings().then((settings) => {
      setRecentProjects(settings.recentProjects ?? [])
    }).catch(() => {})
  }, [])

  // Auto-focus search on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

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
        project.path.toLowerCase().includes(lower)
      ) {
        results.push({
          kind: 'project',
          label: project.name,
          detail: project.path,
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
    window.api.removeRecentProject(projectPath).then((settings) => {
      setRecentProjects(settings.recentProjects ?? [])
    }).catch(() => {})
  }, [])

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

      {recentProjects.length > 0 && (
        <div className="home-recent">
          <h2 className="home-recent-title">
            <Clock size={16} />
            Recent Projects
          </h2>
          <div className="home-recent-grid">
            {recentProjects.map((project) => (
              <div
                key={project.path}
                className="home-recent-tile"
                onClick={() => handleOpenRecent(project)}
              >
                <FolderOpen size={28} className="home-recent-tile-icon" />
                <span className="home-recent-tile-name">{project.name}</span>
                <span className="home-recent-tile-path">{project.path}</span>
                <span className="home-recent-tile-date">{formatRelativeDate(project.lastOpened)}</span>
                <button
                  className="home-recent-tile-remove"
                  onClick={(e) => handleRemoveRecent(e, project.path)}
                  title="Remove from recent projects"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default HomeScreen
