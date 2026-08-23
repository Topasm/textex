import { create } from 'zustand'

export type NotificationTone = 'progress' | 'info' | 'success' | 'warning' | 'error'

export interface NotificationAction {
  label: string
  run: () => void | Promise<void>
  dismissOnRun?: boolean
}

export interface AppNotification {
  id: string
  message: string
  tone: NotificationTone
  progress?: number | null
  action?: NotificationAction
  dismissible: boolean
  timeoutMs: number | null
  updatedAt: number
}

export interface NotificationInput {
  id?: string
  message: string
  tone?: NotificationTone
  progress?: number | null
  action?: NotificationAction
  dismissible?: boolean
  timeoutMs?: number | null
}

export type NotificationPatch = Partial<
  Pick<AppNotification, 'message' | 'tone' | 'progress' | 'action' | 'dismissible' | 'timeoutMs'>
>

interface NotificationState {
  notifications: AppNotification[]
  pushNotification: (input: NotificationInput) => string
  updateNotification: (id: string, patch: NotificationPatch) => void
  dismissNotification: (id: string) => void
  clearNotifications: () => void
}

const MAX_NOTIFICATIONS = 20
let notificationSequence = 0
let notificationRevision = 0

function defaultTimeout(tone: NotificationTone): number | null {
  switch (tone) {
    case 'success':
      return 4_500
    case 'info':
      return 5_000
    case 'warning':
      return 8_000
    case 'progress':
    case 'error':
      return null
  }
}

function defaultDismissible(tone: NotificationTone): boolean {
  return tone !== 'progress'
}

function clampProgress(progress: number | null | undefined): number | null | undefined {
  if (progress === null || progress === undefined) return progress
  if (!Number.isFinite(progress)) return null
  return Math.min(100, Math.max(0, progress))
}

function nextNotificationId(): string {
  notificationSequence += 1
  return `notification-${Date.now()}-${notificationSequence}`
}

function nextNotificationRevision(): number {
  notificationRevision += 1
  return notificationRevision
}

function retainWithinLimit(notifications: AppNotification[]): AppNotification[] {
  if (notifications.length <= MAX_NOTIFICATIONS) return notifications

  const removableIndex = notifications.findIndex(
    (notification) => notification.tone !== 'error' && notification.tone !== 'progress'
  )
  if (removableIndex >= 0) {
    return notifications.filter((_, index) => index !== removableIndex)
  }
  return notifications.slice(-MAX_NOTIFICATIONS)
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],

  pushNotification: (input) => {
    const id = input.id ?? nextNotificationId()
    const tone = input.tone ?? 'info'
    const notification: AppNotification = {
      id,
      message: input.message,
      tone,
      progress: clampProgress(input.progress),
      action: input.action,
      dismissible: input.dismissible ?? defaultDismissible(tone),
      timeoutMs: input.timeoutMs === undefined ? defaultTimeout(tone) : input.timeoutMs,
      updatedAt: nextNotificationRevision()
    }

    set((state) => {
      const existingIndex = state.notifications.findIndex((item) => item.id === id)
      if (existingIndex >= 0) {
        const notifications = [...state.notifications]
        notifications[existingIndex] = notification
        return { notifications }
      }
      return { notifications: retainWithinLimit([...state.notifications, notification]) }
    })
    return id
  },

  updateNotification: (id, patch) =>
    set((state) => ({
      notifications: state.notifications.map((notification) => {
        if (notification.id !== id) return notification
        const tone = patch.tone ?? notification.tone
        const toneChanged = patch.tone !== undefined && patch.tone !== notification.tone
        return {
          ...notification,
          ...patch,
          tone,
          progress:
            patch.progress === undefined ? notification.progress : clampProgress(patch.progress),
          dismissible:
            patch.dismissible ??
            (toneChanged ? defaultDismissible(tone) : notification.dismissible),
          timeoutMs:
            patch.timeoutMs === undefined
              ? toneChanged
                ? defaultTimeout(tone)
                : notification.timeoutMs
              : patch.timeoutMs,
          updatedAt: nextNotificationRevision()
        }
      })
    })),

  dismissNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((notification) => notification.id !== id)
    })),

  clearNotifications: () => set({ notifications: [] })
}))
