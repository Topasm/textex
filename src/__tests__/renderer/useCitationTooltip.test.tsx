import { act, cleanup, fireEvent, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCitationTooltip } from '../../renderer/hooks/preview/useCitationTooltip'
import { useProjectStore } from '../../renderer/store/useProjectStore'

const entry = {
  key: 'paper',
  title: 'A useful paper',
  author: 'Kim',
  year: '2026',
  type: 'article'
}
let container: HTMLDivElement
let anchor: HTMLAnchorElement
let navigate = vi.fn<() => void>()

function setup() {
  const ref = { current: container }
  const hook = renderHook(({ revision }) => useCitationTooltip(ref, revision), {
    initialProps: { revision: 1 }
  })
  hook.result.current.registerPageAnnotations(1, 1, [{ id: 'link', dest: 'cite.paper' }])
  return hook
}

describe('PDF citation popup interaction', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useProjectStore.setState({ projectRoot: '/project', bibEntries: [entry], auxCitationMap: null })
    container = document.createElement('div')
    container.innerHTML =
      '<div data-pdf-generation="1"><div data-page-number="1"><div class="annotationLayer"><section data-annotation-id="link"><a href="#">[1]</a></section></div></div></div>'
    document.body.append(container)
    anchor = container.querySelector('a')!
    navigate = vi.fn<() => void>()
    anchor.onclick = navigate
  })

  afterEach(() => {
    cleanup()
    container.remove()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('intercepts citation clicks before the PDF link handler and pins the details', () => {
    const hook = setup()
    expect(fireEvent.click(anchor)).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
    expect(hook.result.current.tooltipData).toMatchObject({ entries: [entry], pinned: true })
    fireEvent.mouseOut(anchor)
    expect(hook.result.current.tooltipData?.pinned).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(hook.result.current.tooltipData).toBeNull()
    expect(anchor).toHaveFocus()
  })

  it('leaves ordinary links and modifier clicks to their existing handlers', () => {
    const hook = setup()
    fireEvent.click(anchor, { metaKey: true })
    fireEvent.click(anchor, { ctrlKey: true })
    hook.result.current.registerPageAnnotations(1, 1, [{ id: 'link', dest: 'section.2' }])
    fireEvent.click(anchor)
    expect(navigate).toHaveBeenCalledTimes(3)
    expect(hook.result.current.tooltipData).toBeNull()
  })

  it('does not turn a text drag into a popup click', () => {
    const hook = setup()
    fireEvent.mouseDown(anchor, { clientX: 10, clientY: 10 })
    fireEvent.click(anchor, { clientX: 40, clientY: 10, detail: 1 })
    expect(hook.result.current.tooltipData).toBeNull()
  })

  it.each(['generation', 'project'] as const)(
    'rejects old annotation and hover results after a %s change',
    (change) => {
      const hook = setup()
      const registerOld = hook.result.current.registerPageAnnotations
      fireEvent.mouseOver(anchor)
      if (change === 'generation') {
        hook.rerender({ revision: 2 })
        container.querySelector('[data-pdf-generation]')!.setAttribute('data-pdf-generation', '2')
      } else {
        act(() => useProjectStore.setState({ projectRoot: '/other' }))
      }
      registerOld(1, 1, [{ id: 'link', dest: 'cite.paper' }])
      act(() => vi.advanceTimersByTime(200))
      expect(hook.result.current.tooltipData).toBeNull()
      fireEvent.click(anchor)
      expect(navigate).toHaveBeenCalledOnce()
      expect(hook.result.current.tooltipData).toBeNull()
    }
  )

  it('updates details when bibliography data changes without discarding annotation destinations', () => {
    const hook = setup()
    act(() => useProjectStore.setState({ bibEntries: [{ ...entry, title: 'Revised metadata' }] }))
    fireEvent.click(anchor)
    expect(hook.result.current.tooltipData?.entries[0].title).toBe('Revised metadata')
  })
})
