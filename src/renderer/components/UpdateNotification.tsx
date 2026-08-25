import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  X
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  appUpdateReleaseUrl,
  dismissAppUpdate,
  downloadAppUpdate,
  restartAppUpdate,
  retryAppUpdate
} from '../services/updateLifecycle'
import { useUiStore, type UpdateStatus } from '../store/useUiStore'

function statusMessage(
  status: UpdateStatus,
  version: string,
  progress: number | null,
  t: ReturnType<typeof useTranslation>['t']
): string {
  switch (status) {
    case 'checking':
      return t('updateNotification.checking')
    case 'up-to-date':
      return t('updateNotification.upToDate')
    case 'available':
      return t('updateNotification.available', { version })
    case 'downloading':
      return progress === null
        ? t('updateNotification.downloading', { version })
        : t('updateNotification.downloadingProgress', {
            version,
            progress: Math.round(progress)
          })
    case 'ready':
      return t('updateNotification.ready', { version })
    case 'restarting':
      return t('updateNotification.restarting')
    case 'error':
      return t('updateNotification.error')
    default:
      return ''
  }
}

function UpdateNotification() {
  const { t, i18n } = useTranslation()
  const status = useUiStore((state) => state.updateStatus)
  const metadata = useUiStore((state) => state.updateMetadata)
  const progress = useUiStore((state) => state.updateProgress)
  const updateError = useUiStore((state) => state.updateError)

  if (status === 'idle') return null

  const version = metadata?.version ?? ''
  const message = statusMessage(status, version, progress, t)
  const isActive = status === 'checking' || status === 'downloading' || status === 'restarting'
  const canDismiss = !isActive
  const releaseDate = metadata?.date ? new Date(metadata.date) : null
  const formattedReleaseDate =
    releaseDate && !Number.isNaN(releaseDate.getTime())
      ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(releaseDate)
      : null

  const statusIcon = (() => {
    if (isActive) return <RefreshCw className="update-spinner" size={16} aria-hidden="true" />
    if (status === 'error') return <AlertCircle size={16} aria-hidden="true" />
    if (status === 'available') return <Download size={16} aria-hidden="true" />
    return <CheckCircle2 size={16} aria-hidden="true" />
  })()

  return (
    <section
      className={`update-banner app-update-notification update-banner-${status}`}
      role={status === 'error' ? 'alert' : 'status'}
      aria-live={status === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
      aria-busy={isActive}
      aria-label={t('updateNotification.regionLabel')}
    >
      <span className="update-status-icon">{statusIcon}</span>
      <span className="update-banner-message">
        {message}
        {status === 'error' && updateError && (
          <span className="update-error-detail"> {updateError}</span>
        )}
      </span>

      {status === 'downloading' && (
        <progress
          className="update-progress"
          max={100}
          value={progress ?? undefined}
          aria-label={t('updateNotification.downloadProgressLabel')}
        />
      )}

      {status === 'available' && (
        <button type="button" onClick={() => void downloadAppUpdate()}>
          <Download size={14} aria-hidden="true" />
          {t('updateNotification.download')}
        </button>
      )}

      {status === 'ready' && (
        <button type="button" onClick={() => void restartAppUpdate()}>
          <RotateCcw size={14} aria-hidden="true" />
          {t('updateNotification.restart')}
        </button>
      )}

      {status === 'error' && (
        <button type="button" onClick={() => void retryAppUpdate()}>
          <RefreshCw size={14} aria-hidden="true" />
          {t('updateNotification.retry')}
        </button>
      )}

      {version && (status === 'available' || status === 'ready') && (
        <button
          className="update-release-link"
          type="button"
          onClick={() => void window.api.openExternal(appUpdateReleaseUrl(version)).catch(() => {})}
        >
          {t('updateNotification.viewRelease')}
          <ExternalLink size={12} aria-hidden="true" />
        </button>
      )}

      {canDismiss && (
        <button
          type="button"
          className="update-dismiss"
          onClick={dismissAppUpdate}
          title={t('updateNotification.dismiss')}
          aria-label={t('updateNotification.dismiss')}
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}

      {status === 'available' && (metadata?.body || formattedReleaseDate) && (
        <details className="update-release-details">
          <summary>{t('updateNotification.releaseNotes')}</summary>
          {formattedReleaseDate && (
            <div className="update-release-date">
              {t('updateNotification.releaseDate', { date: formattedReleaseDate })}
            </div>
          )}
          {metadata?.body && <div className="update-release-notes">{metadata.body}</div>}
        </details>
      )}
    </section>
  )
}

export default UpdateNotification
