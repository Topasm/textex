import { useAppStore } from '../store/useAppStore'

const DISMISSED_UPDATE_KEY = 'textex-dismissed-update-version'

function UpdateNotification() {
  const status = useAppStore((s) => s.updateStatus)
  const version = useAppStore((s) => s.updateVersion)
  const progress = useAppStore((s) => s.updateProgress)

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
    useAppStore.getState().setUpdateStatus('idle')
  }

  return (
    <div className="update-banner">
      <span className="update-banner-message">
        {status === 'available' && `Update ${version || ''} is available.`}
        {status === 'downloading' && `Downloading update...`}
        {status === 'ready' && `Update ready. Restart to apply.`}
        {status === 'error' && `Update check failed.`}
      </span>

      {status === 'downloading' && (
        <div className="update-progress">
          <div className="update-progress-bar" style={{ width: `${progress}%` }} />
        </div>
      )}

      {status === 'available' && (
        <button onClick={() => window.api.updateDownload()}>Download</button>
      )}

      {status === 'ready' && <button onClick={() => window.api.updateInstall()}>Restart</button>}

      <button className="update-dismiss" onClick={handleDismiss} title="Dismiss">
        {'\u00D7'}
      </button>
    </div>
  )
}

export default UpdateNotification
