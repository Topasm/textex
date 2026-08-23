import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotificationStore } from '../../renderer/store/useNotificationStore'

beforeEach(() => {
  useNotificationStore.getState().clearNotifications()
  vi.useRealTimers()
})

describe('useNotificationStore', () => {
  it('creates transient success notifications and persistent errors by default', () => {
    const successId = useNotificationStore.getState().pushNotification({
      message: 'Export complete',
      tone: 'success'
    })
    const errorId = useNotificationStore.getState().pushNotification({
      message: 'Export failed',
      tone: 'error'
    })

    const success = useNotificationStore
      .getState()
      .notifications.find((item) => item.id === successId)
    const error = useNotificationStore.getState().notifications.find((item) => item.id === errorId)

    expect(success).toMatchObject({ timeoutMs: 4_500, dismissible: true })
    expect(error).toMatchObject({ timeoutMs: null, dismissible: true })
  })

  it('upserts stable task ids and transitions progress into a transient result', () => {
    const id = useNotificationStore.getState().pushNotification({
      id: 'document-export',
      message: 'Exporting',
      tone: 'progress',
      progress: 140
    })
    useNotificationStore.getState().updateNotification(id, {
      message: 'Export complete',
      tone: 'success'
    })

    expect(useNotificationStore.getState().notifications).toHaveLength(1)
    expect(useNotificationStore.getState().notifications[0]).toMatchObject({
      id: 'document-export',
      message: 'Export complete',
      tone: 'success',
      progress: 100,
      dismissible: true,
      timeoutMs: 4_500
    })
  })

  it('dismisses one notification without disturbing the queue', () => {
    const first = useNotificationStore.getState().pushNotification({ message: 'First' })
    const second = useNotificationStore.getState().pushNotification({ message: 'Second' })

    useNotificationStore.getState().dismissNotification(first)

    expect(useNotificationStore.getState().notifications.map((item) => item.id)).toEqual([second])
  })

  it('replaces a notification when the caller reuses its id', () => {
    useNotificationStore.getState().pushNotification({
      id: 'sync',
      message: 'Syncing',
      tone: 'progress'
    })
    useNotificationStore.getState().pushNotification({
      id: 'sync',
      message: 'Sync failed',
      tone: 'error'
    })

    expect(useNotificationStore.getState().notifications).toEqual([
      expect.objectContaining({ id: 'sync', message: 'Sync failed', tone: 'error' })
    ])
  })
})
