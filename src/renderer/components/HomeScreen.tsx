import { useCallback, useEffect, useState } from 'react'
import { FolderOpen, Clock, Trash2, FileText } from 'lucide-react'
import type { RecentProject } from '../../shared/types'
import { openProject } from '../utils/openProject'

interface HomeScreenProps {
  onOpenFolder: () => void
  onNewFromTemplate: () => void
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

function HomeScreen({ onOpenFolder, onNewFromTemplate }: HomeScreenProps) {
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])

  useEffect(() => {
    window.api.loadSettings().then((settings) => {
      setRecentProjects(settings.recentProjects ?? [])
    }).catch(() => {})
  }, [])

  const handleOpenRecent = useCallback(async (project: RecentProject) => {
    try {
      // Verify directory exists by trying to read it
      await window.api.readDirectory(project.path)
      await openProject(project.path)
    } catch {
      // Directory no longer exists — remove from list
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

  return (
    <div className="home-screen">
      <div className="home-brand">
        <h1 className="home-title">TextEx</h1>
        <p className="home-subtitle">LaTeX Editor</p>
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
          <div className="home-recent-list">
            {recentProjects.map((project) => (
              <div
                key={project.path}
                className="home-recent-card"
                onClick={() => handleOpenRecent(project)}
              >
                <div className="home-recent-info">
                  <span className="home-recent-name">{project.name}</span>
                  <span className="home-recent-path">{project.path}</span>
                </div>
                <span className="home-recent-date">{formatRelativeDate(project.lastOpened)}</span>
                <button
                  className="home-recent-remove"
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
