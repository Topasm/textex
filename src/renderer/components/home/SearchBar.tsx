import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen, FileText, Search, X, Terminal, BookOpen, Settings } from 'lucide-react'
import type { RecentProject } from '../../../shared/types'
import { templates } from '../../data/templates'
import { openProject } from '../../utils/openProject'
import { logError } from '../../utils/errorMessage'

interface SlashCommand {
  command: string
  label: string
  descriptionKey: string
  icon: React.ReactNode
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    command: '/draft',
    label: '/draft',
    descriptionKey: 'searchBar.draftDesc',
    icon: <FileText size={16} />
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
    icon: <Settings size={16} />
  }
]

type SearchResultKind = 'project' | 'template' | 'command'

interface SearchResult {
  kind: SearchResultKind
  label: string
  detail: string
  badgeKey: string
  data: RecentProject | { name: string; description: string } | SlashCommand
}

interface SearchBarProps {
  recentProjects: RecentProject[]
  setRecentProjects: (projects: RecentProject[]) => void
  onOpenFolder: () => void
  onNewFromTemplate: () => void
  onAiDraft: (prefill?: string) => void
  onOpenSettings: () => void
}

export function SearchBar({
  recentProjects,
  setRecentProjects,
  onOpenFolder,
  onNewFromTemplate,
  onAiDraft,
  onOpenSettings
}: SearchBarProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  // Use deferred value so filtering doesn't block typing responsiveness
  const deferredQuery = useDeferredValue(query)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  const filteredResults = useMemo<SearchResult[]>(() => {
    const q = deferredQuery.trim()
    if (!q) return []

    if (q.startsWith('/')) {
      const cmdQuery = q.toLowerCase()
      const firstSpace = q.indexOf(' ')
      const cmdPart = firstSpace > 0 ? q.slice(0, firstSpace).toLowerCase() : cmdQuery

      return SLASH_COMMANDS.filter((cmd) => cmd.command.startsWith(cmdPart)).map((cmd) => ({
        kind: 'command' as const,
        label: cmd.label,
        detail: t(cmd.descriptionKey),
        badgeKey: 'searchBar.command',
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
          badgeKey: 'searchBar.recent',
          data: project
        })
      }
    }

    for (const tmpl of templates) {
      if (tmpl.name.toLowerCase().includes(lower) || tmpl.description.toLowerCase().includes(lower)) {
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
  }, [deferredQuery, recentProjects, t])

  useEffect(() => {
    setIsDropdownOpen(filteredResults.length > 0)
    setSelectedIndex(0)
  }, [filteredResults])

  const handleSelectResult = useCallback(
    (result: SearchResult) => {
      setQuery('')
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
                .then((settings) => {
                  setRecentProjects(settings.recentProjects ?? [])
                })
                .catch((err) => logError('searchBar', err))
            })
          break
        }
        case 'template':
          onNewFromTemplate()
          break
        case 'command': {
          const cmd = result.data as SlashCommand
          if (cmd.command === '/draft') {
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
    },
    [query, onOpenFolder, onNewFromTemplate, onAiDraft, onOpenSettings, setRecentProjects]
  )

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
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
    },
    [isDropdownOpen, filteredResults, selectedIndex, handleSelectResult]
  )

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
    <div className="home-search-wrapper">
      <div className="home-search-bar">
        <Search size={16} className="search-icon" />
        <input
          ref={inputRef}
          className="home-search-input"
          type="text"
          placeholder={t('searchBar.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          onFocus={() => {
            if (filteredResults.length > 0) setIsDropdownOpen(true)
          }}
        />
        {query && (
          <button
            className="home-search-clear"
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
          >
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
              <span className="home-search-result-badge">{t(result.badgeKey)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
