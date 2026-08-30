import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NotificationCenter from '../../renderer/components/NotificationCenter'
import { useNotificationStore } from '../../renderer/store/useNotificationStore'

beforeEach(() => {
  useNotificationStore.getState().clearNotifications()
  vi.useRealTimers()
})

describe('NotificationCenter', () => {
  it('renders progress with an accessible busy state', () => {
    useNotificationStore.getState().pushNotification({
      message: 'Exporting document',
      tone: 'progress',
      progress: 25
    })

    render(<NotificationCenter />)

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '25')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('keeps errors visible and exposes retry and dismiss actions', async () => {
    const retry = vi.fn()
    useNotificationStore.getState().pushNotification({
      message: 'Export failed',
      tone: 'error',
      action: { label: 'Try again', run: retry, dismissOnRun: false }
    })

    render(<NotificationCenter />)

    expect(screen.getByRole('alert')).toHaveTextContent('Export failed')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Try again' })))
    expect(retry).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('automatically dismisses transient notifications', () => {
    vi.useFakeTimers()
    useNotificationStore.getState().pushNotification({
      message: 'Export complete',
      tone: 'success',
      timeoutMs: 100
    })

    render(<NotificationCenter />)
    expect(screen.getByText('Export complete')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(100))
    expect(screen.queryByText('Export complete')).not.toBeInTheDocument()
  })

  it('keeps a notification when its action rejects', async () => {
    useNotificationStore.getState().pushNotification({
      message: 'Sync failed',
      tone: 'error',
      action: { label: 'Retry', run: vi.fn().mockRejectedValue(new Error('offline')) }
    })

    render(<NotificationCenter />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry' })))

    expect(screen.getByRole('alert')).toHaveTextContent('Sync failed')
  })

  it('keeps queued notifications out of an active modal surface', () => {
    useNotificationStore.getState().pushNotification({
      message: 'Export complete',
      tone: 'success'
    })

    const view = render(<NotificationCenter suppressed />)
    expect(screen.queryByText('Export complete')).not.toBeInTheDocument()

    view.rerender(<NotificationCenter suppressed={false} />)
    expect(screen.getByText('Export complete')).toBeInTheDocument()
  })

  it('runs dismissal ownership before removing a notification', () => {
    const onDismiss = vi.fn()
    useNotificationStore.getState().pushNotification({
      message: 'Learn this gesture',
      tone: 'info',
      timeoutMs: null,
      onDismiss
    })

    render(<NotificationCenter />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(onDismiss).toHaveBeenCalledOnce()
    expect(screen.queryByText('Learn this gesture')).not.toBeInTheDocument()
  })
})
