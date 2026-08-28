import { useEffect, useState } from 'react'
import { ICON_SIZE } from './ui/IconSystem'
import { AlertCircle, AlertTriangle, CheckCircle2, Info, LoaderCircle, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  useNotificationStore,
  type AppNotification,
  type NotificationTone
} from '../store/useNotificationStore'
import '../styles/notifications.css'

function NotificationIcon({ tone }: { tone: NotificationTone }) {
  const props = { size: 17, 'aria-hidden': true as const }
  switch (tone) {
    case 'progress':
      return <LoaderCircle className="notification-spinner" {...props} />
    case 'success':
      return <CheckCircle2 {...props} />
    case 'warning':
      return <AlertTriangle {...props} />
    case 'error':
      return <AlertCircle {...props} />
    case 'info':
      return <Info {...props} />
  }
}

function NotificationItem({ notification }: { notification: AppNotification }) {
  const { t } = useTranslation()
  const dismissNotification = useNotificationStore((state) => state.dismissNotification)
  const [actionRunning, setActionRunning] = useState(false)

  useEffect(() => {
    if (notification.timeoutMs === null || notification.timeoutMs <= 0) return
    const timeout = window.setTimeout(
      () => dismissNotification(notification.id),
      notification.timeoutMs
    )
    return () => window.clearTimeout(timeout)
  }, [dismissNotification, notification.id, notification.timeoutMs, notification.updatedAt])

  const runAction = async (): Promise<void> => {
    if (!notification.action || actionRunning) return
    setActionRunning(true)
    try {
      await notification.action.run()
      if (notification.action.dismissOnRun !== false) dismissNotification(notification.id)
    } catch {
      // Keep the notification available. Action owners publish any richer
      // follow-up error state through the same stable notification id.
    } finally {
      setActionRunning(false)
    }
  }

  const isProgress = notification.tone === 'progress'

  return (
    <article
      className={`app-notification app-notification-${notification.tone}`}
      role={notification.tone === 'error' ? 'alert' : 'status'}
      aria-live={notification.tone === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
      aria-busy={isProgress}
    >
      <span className="app-notification-icon">
        <NotificationIcon tone={notification.tone} />
      </span>
      <span className="app-notification-message">{notification.message}</span>

      {isProgress && (
        <progress
          className="app-notification-progress"
          max={100}
          value={notification.progress ?? undefined}
          aria-label={t('notifications.progress')}
        />
      )}

      {notification.action && (
        <button
          type="button"
          className="app-notification-action"
          disabled={actionRunning}
          onClick={() => void runAction()}
        >
          {notification.action.label}
        </button>
      )}

      {notification.dismissible && (
        <button
          type="button"
          className="app-notification-dismiss"
          onClick={() => dismissNotification(notification.id)}
          aria-label={t('notifications.dismiss')}
          title={t('notifications.dismiss')}
        >
          <X size={ICON_SIZE.compact} aria-hidden="true" />
        </button>
      )}
    </article>
  )
}

export default function NotificationCenter({ suppressed = false }: { suppressed?: boolean }) {
  const { t } = useTranslation()
  const notifications = useNotificationStore((state) => state.notifications)

  if (suppressed || notifications.length === 0) return null

  return (
    <section className="notification-center" aria-label={t('notifications.regionLabel')}>
      {notifications.map((notification) => (
        <NotificationItem key={notification.id} notification={notification} />
      ))}
    </section>
  )
}
