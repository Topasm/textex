import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen, FileText } from 'lucide-react'
import type { RecentProject } from '../../shared/types'
import { logError } from '../utils/errorMessage'
import { RecentProjectList } from './home/RecentProjectList'

interface HomeScreenProps {
  onOpenFolder: () => void
  onNewFromTemplate: () => void
}

function HomeScreen({
  onOpenFolder,
  onNewFromTemplate
}: HomeScreenProps) {
  const { t } = useTranslation()
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])

  useEffect(() => {
    window.api
      .loadSettings()
      .then((settings) => {
        setRecentProjects(settings.recentProjects ?? [])
      })
      .catch((err) => logError('loadSettings', err))
  }, [])

  return (
    <div className="home-screen">
      <div className="home-brand">
        <h1 className="home-title">TextEx</h1>
        <p className="home-subtitle">{t('homeScreen.subtitle')}</p>
      </div>

      <div className="home-actions">
        <button className="home-action-btn home-action-primary" onClick={onOpenFolder}>
          <FolderOpen size={18} />
          {t('homeScreen.openFolder')}
        </button>
        <button className="home-action-btn" onClick={onNewFromTemplate}>
          <FileText size={18} />
          {t('homeScreen.newFromTemplate')}
        </button>
      </div>

      <RecentProjectList recentProjects={recentProjects} setRecentProjects={setRecentProjects} />
    </div>
  )
}

export default HomeScreen
