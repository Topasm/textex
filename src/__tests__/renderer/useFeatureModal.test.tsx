import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useFeatureModal } from '../../renderer/hooks/useFeatureModal'
import { useUiStore } from '../../renderer/store/useUiStore'

function openModals(): readonly string[] {
  return useUiStore.getState().openFeatureModals
}

describe('useFeatureModal', () => {
  beforeEach(() => {
    useUiStore.setState({ openFeatureModals: [] })
  })

  afterEach(cleanup)

  it('registers only while the modal is active', () => {
    const { rerender, unmount } = renderHook(
      ({ active }: { active: boolean }) => useFeatureModal('tableEditor', active),
      { initialProps: { active: false } }
    )
    expect(openModals()).toEqual([])

    rerender({ active: true })
    expect(openModals()).toEqual(['tableEditor'])

    rerender({ active: false })
    expect(openModals()).toEqual([])

    rerender({ active: true })
    unmount()
    expect(openModals()).toEqual([])
  })

  it('tracks concurrent feature dialogs independently', () => {
    const first = renderHook(() => useFeatureModal('crashRecovery', true))
    const second = renderHook(() => useFeatureModal('bibliographyRegistration', true))

    expect([...openModals()].sort()).toEqual(['bibliographyRegistration', 'crashRecovery'])

    first.unmount()
    expect(openModals()).toEqual(['bibliographyRegistration'])

    second.unmount()
    expect(openModals()).toEqual([])
  })

  it('does not duplicate an id that registers twice', () => {
    renderHook(() => useFeatureModal('tableEditor', true))
    renderHook(() => useFeatureModal('tableEditor', true))

    expect(openModals()).toEqual(['tableEditor'])
  })
})
