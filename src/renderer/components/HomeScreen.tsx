import { useEffect, useState } from 'react'
import { FolderOpen, FileText } from 'lucide-react'
import type { RecentProject } from '../../shared/types'
import { SearchBar } from './home/SearchBar'
import { RecentProjectList } from './home/RecentProjectList'

interface HomeScreenProps {
  onOpenFolder: () => void
  onNewFromTemplate: () => void
  onAiDraft: (prefill?: string) => void
  onOpenSettings: () => void
}

function HomeScreen({ onOpenFolder, onNewFromTemplate, onAiDraft, onOpenSettings }: HomeScreenProps) {
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])

  useEffect(() => {
    window.api.loadSettings().then((settings) => {
      setRecentProjects(settings.recentProjects ?? [])
    }).catch(() => {})
  }, [])

  return (
    <div className="home-screen">
      <div className="home-brand">
        <h1 className="home-title">TextEx</h1>
        <p className="home-subtitle">LaTeX Editor</p>
      </div>

      <SearchBar
        recentProjects={recentProjects}
        setRecentProjects={setRecentProjects}
        onOpenFolder={onOpenFolder}
        onNewFromTemplate={onNewFromTemplate}
        onAiDraft={onAiDraft}
        onOpenSettings={onOpenSettings}
      />

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

      <RecentProjectList
        recentProjects={recentProjects}
        setRecentProjects={setRecentProjects}
      />
    </div>
  )
}

export default HomeScreen
