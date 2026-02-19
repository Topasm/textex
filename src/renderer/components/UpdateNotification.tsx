import { useTranslation } from 'react-i18next'
import { useUiStore } from '../store/useUiStore'

const DISMISSED_UPDATE_KEY = 'textex-dismissed-update-version'

function UpdateNotification() {
  const { t } = useTranslation()
  const status = useUiStore((s) => s.updateStatus)
  const version = useUiStore((s) => s.updateVersion)
  const progress = useUiStore((s) => s.updateProgress)

  if (status === 'idle') return null

  // If the user previously dismissed this exact version, hide the notification
  if (status === 'available' && version) {
    try {
      if (localStorage.getItem(DISMISSED_UPDATE_KEY) === version) return null
    } catch {
      // localStorage may be unavailable
    }
  }

  const handleDismiss = () => {
    if (version) {
      try {
        localStorage.setItem(DISMISSED_UPDATE_KEY, version)
      } catch {
        // localStorage may be unavailable
      }
    }
    useUiStore.getState().setUpdateStatus('idle')
  }

  return (
    <div className="update-banner">
      <span className="update-banner-message">
        {status === 'available' && t('updateNotification.available', { version: version || '' })}
        {status === 'downloading' && t('updateNotification.downloading')}
        {status === 'ready' && t('updateNotification.ready')}
        {status === 'error' && t('updateNotification.error')}
      </span>

      {status === 'downloading' && (
        <div className="update-progress">
          <div className="update-progress-bar" style={{ width: `${progress}%` }} />
        </div>
      )}

      {status === 'available' && (
        <button onClick={() => window.api.updateDownload()}>{t('updateNotification.download')}</button>
      )}

      {status === 'ready' && <button onClick={() => window.api.updateInstall()}>{t('updateNotification.restart')}</button>}

      <button className="update-dismiss" onClick={handleDismiss} title={t('updateNotification.dismiss')}>
        {'\u00D7'}
      </button>
    </div>
  )
}

export default UpdateNotification
