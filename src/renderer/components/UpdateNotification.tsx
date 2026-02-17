import { useAppStore } from '../store/useAppStore'

function UpdateNotification(): JSX.Element | null {
  const status = useAppStore((s) => s.updateStatus)
  const version = useAppStore((s) => s.updateVersion)
  const progress = useAppStore((s) => s.updateProgress)

  if (status === 'idle') return null

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
        <button onClick={() => window.api.updateDownload()}>
          Download
        </button>
      )}

      {status === 'ready' && (
        <button onClick={() => window.api.updateInstall()}>
          Restart
        </button>
      )}

      <button
        className="update-dismiss"
        onClick={() => useAppStore.getState().setUpdateStatus('idle')}
        title="Dismiss"
      >
        {'\u00D7'}
      </button>
    </div>
  )
}

export default UpdateNotification
