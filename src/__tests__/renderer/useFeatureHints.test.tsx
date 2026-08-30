import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  resetFeatureHintSessionForTests,
  useFeatureHints
} from '../../renderer/hooks/useFeatureHints'
import i18n from '../../renderer/i18n'
import { useLearningStore } from '../../renderer/store/useLearningStore'
import { useNotificationStore } from '../../renderer/store/useNotificationStore'
import { useUiStore } from '../../renderer/store/useUiStore'

const PROJECT_CONTEXT = {
  filePath: '/paper/main.tex',
  pdfPath: null,
  projectRoot: '/paper',
  pdfViewMode: 'continuous' as const,
  isSidebarOpen: true,
  isResearchPanelOpen: false,
  suppressed: false
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  vi.useFakeTimers()
  resetFeatureHintSessionForTests()
  useLearningStore.setState({ dismissedHintIds: [], completedTourItemIds: [] })
  useNotificationStore.getState().clearNotifications()
  useUiStore.setState({ helpRequestedSection: null })
})

describe('useFeatureHints', () => {
  it('shows one relevant persistent hint and remembers dismissal', () => {
    renderHook(() => useFeatureHints(PROJECT_CONTEXT))

    act(() => vi.advanceTimersByTime(6_500))

    const [notification] = useNotificationStore.getState().notifications
    expect(notification.id).toBe('learning-hint-workspace-pair-swipe')
    expect(notification.timeoutMs).toBeNull()

    act(() => notification.onDismiss?.())
    expect(useLearningStore.getState().dismissedHintIds).toContain('workspace-pair-swipe')
  })

  it('opens the matching guide section from the hint action', async () => {
    renderHook(() => useFeatureHints(PROJECT_CONTEXT))
    act(() => vi.advanceTimersByTime(6_500))

    const [notification] = useNotificationStore.getState().notifications
    await act(async () => notification.action?.run())

    expect(useUiStore.getState().helpRequestedSection).toBe('gestures')
  })

  it('does not queue hints behind an exclusive surface', () => {
    renderHook(() => useFeatureHints({ ...PROJECT_CONTEXT, suppressed: true }))
    act(() => vi.advanceTimersByTime(20_000))
    expect(useNotificationStore.getState().notifications).toEqual([])
  })
})
