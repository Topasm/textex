import { useEffect, useState } from 'react'
import { ICON_SIZE } from './ui/IconSystem'
import { useTranslation } from 'react-i18next'
import { Compass, FolderOpen, FileText, FilePlus } from 'lucide-react'
import type { RecentProject } from '../../shared/types'
import { logError } from '../utils/errorMessage'
import { RecentProjectList } from './home/RecentProjectList'

interface HomeScreenProps {
  onOpenFolder: () => void
  onOpenGuidedDemo: () => void
  onNewBlankProject: () => void
  onNewFromTemplate: () => void
}

function HomeScreen({
  onOpenFolder,
  onOpenGuidedDemo,
  onNewBlankProject,
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
          <FolderOpen size={ICON_SIZE.feature} />
          {t('homeScreen.openFolder')}
        </button>
        <>
          <button
            className="home-action-btn home-action-guided"
            onClick={onOpenGuidedDemo}
            data-testid="guided-demo-action"
          >
            <Compass size={ICON_SIZE.feature} />
            {t('homeScreen.guidedDemo')}
          </button>
          <button className="home-action-btn" onClick={onNewBlankProject}>
            <FilePlus size={ICON_SIZE.feature} />
            {t('homeScreen.newBlankProject')}
          </button>
          <button className="home-action-btn" onClick={onNewFromTemplate}>
            <FileText size={ICON_SIZE.feature} />
            {t('homeScreen.newFromTemplate')}
          </button>
        </>
      </div>

      <RecentProjectList recentProjects={recentProjects} setRecentProjects={setRecentProjects} />
    </div>
  )
}

export default HomeScreen
