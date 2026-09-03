import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  COMPILE_FAILURE_NOTIFICATION_ID,
  clearCompileFailure,
  reportCompileFailure
} from '../../renderer/services/compileFeedback'
import { useCompileStore } from '../../renderer/store/useCompileStore'
import { useNotificationStore } from '../../renderer/store/useNotificationStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useUiStore } from '../../renderer/store/useUiStore'
import { normalizeNativeError } from '../../shared/appError'
import {
  clearResearchProfileDraft,
  setResearchProfileDraftDirty
} from '../../renderer/services/researchProfileDraft'

function failureNotification() {
  return useNotificationStore
    .getState()
    .notifications.find((item) => item.id === COMPILE_FAILURE_NOTIFICATION_ID)
}

describe('compile failure feedback', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    clearResearchProfileDraft()
    useNotificationStore.setState({ notifications: [] })
    useCompileStore.setState({ diagnostics: [], compileStatus: 'error' })
    useProjectStore.setState({ isResearchPanelOpen: false, researchPanelTab: 'chat' })
    useUiStore.setState({ settingsRequested: false })
  })

  it('opens Problems for a manual failure and still reports it', () => {
    reportCompileFailure(new Error('tectonic exited with code 1'), 'manual')

    expect(useProjectStore.getState().isResearchPanelOpen).toBe(true)
    expect(useProjectStore.getState().researchPanelTab).toBe('problems')
    // Problems is already in front, so the notification needs no jump action.
    expect(failureNotification()?.action).toBeUndefined()
    expect(failureNotification()?.tone).toBe('error')
  })

  it('leaves the layout alone for a background failure and offers a way in', () => {
    reportCompileFailure(new Error('tectonic exited with code 1'), 'automatic')

    expect(useProjectStore.getState().isResearchPanelOpen).toBe(false)
    const action = failureNotification()?.action
    expect(action?.label).toBe('View problems')

    action?.run()
    expect(useProjectStore.getState().researchPanelTab).toBe('problems')
  })

  it('quotes the first error diagnostic rather than the engine exit status', () => {
    useCompileStore.setState({
      diagnostics: [
        { file: '/p/main.tex', line: 3, severity: 'warning', message: 'Overfull hbox' },
        { file: '/p/main.tex', line: 12, severity: 'error', message: 'Undefined control sequence' }
      ]
    })

    reportCompileFailure(
      normalizeNativeError({
        code: 'compilerFailed',
        message: 'LaTeX compiler exited unsuccessfully (exit status: 1)',
        data: { status: 'exit status: 1' }
      }),
      'automatic'
    )

    expect(failureNotification()?.message).toContain('Undefined control sequence')
    expect(failureNotification()?.message).toContain('12')
  })

  it('points a missing engine at Settings instead of the Problems view', () => {
    reportCompileFailure(
      normalizeNativeError({
        code: 'compilerNotFound',
        message: 'LaTeX compiler executable was not found. Checked: /usr/bin',
        data: { checkedPaths: '/usr/bin' }
      }),
      'manual'
    )

    expect(useProjectStore.getState().isResearchPanelOpen).toBe(false)
    expect(failureNotification()?.message).toContain('No LaTeX engine was found')

    const action = failureNotification()?.action
    expect(action?.label).toBe('Open settings')
    action?.run()
    expect(useUiStore.getState().settingsRequested).toBe(true)
  })

  it('replaces rather than stacks notifications while a document keeps failing', () => {
    reportCompileFailure(new Error('first'), 'automatic')
    reportCompileFailure(new Error('second'), 'automatic')

    expect(useNotificationStore.getState().notifications).toHaveLength(1)
    expect(failureNotification()?.message).toContain('second')
  })

  it('clears the failure once a build succeeds', () => {
    reportCompileFailure(new Error('boom'), 'automatic')
    clearCompileFailure()

    expect(failureNotification()).toBeUndefined()
  })

  it('keeps an unsaved profile draft when the author declines the switch', () => {
    useProjectStore.setState({ isResearchPanelOpen: true, researchPanelTab: 'profile' })
    setResearchProfileDraftDirty(true)
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    reportCompileFailure(new Error('tectonic exited with code 1'), 'manual')

    expect(useProjectStore.getState().researchPanelTab).toBe('profile')
    // The switch was refused, so the notification must still offer the way in.
    expect(failureNotification()?.action?.label).toBe('View problems')
  })
})
