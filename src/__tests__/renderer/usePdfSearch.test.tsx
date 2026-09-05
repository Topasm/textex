import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { usePdfSearch } from '../../renderer/hooks/preview/usePdfSearch'
import { usePdfStore } from '../../renderer/store/usePdfStore'

let container: HTMLDivElement
function makeDocument(texts: string[]) {
  const getPage = vi.fn(async (page: number) => ({
    getTextContent: vi.fn(async () => ({ items: [{ str: texts[page - 1] }] }))
  }))
  return { numPages: texts.length, getPage } as unknown as PDFDocumentProxy
}
function setup(pdf = makeDocument(['Front', 'Match and match', 'Last match'])) {
  const ref = { current: container }
  return {
    pdf,
    ...renderHook(({ document, revision }) => usePdfSearch(ref, document, revision), {
      initialProps: { document: pdf, revision: 1 }
    })
  }
}
describe('PDF search across all pages', () => {
  beforeEach(() => {
    container = document.createElement('div')
    container.innerHTML =
      '<div role="status"></div><div data-pdf-generation="1"><div data-page-number="1"><div class="textLayer"></div></div></div>'
    document.body.appendChild(container)
    usePdfStore.setState({ pdfSearchVisible: true, pdfSearchQuery: 'match', scrollToPage: vi.fn() })
  })
  afterEach(() => {
    cleanup()
    container.remove()
    vi.restoreAllMocks()
  })
  it('finds unrendered pages and navigates each occurrence, including next and previous wrap', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.searchMatches).toHaveLength(3))
    expect(window.document.querySelector('[data-page-number="2"]')).toBeNull()
    expect(usePdfStore.getState().scrollToPage).toHaveBeenLastCalledWith(2)
    act(() => result.current.handleSearchNext())
    expect(result.current.currentMatchIndex).toBe(1)
    await act(async () => {
      container.querySelector('[role=status]')!.textContent = '2 / 3'
    })
    expect(result.current.currentMatchIndex).toBe(1)
    act(() => result.current.handleSearchNext())
    expect(usePdfStore.getState().scrollToPage).toHaveBeenLastCalledWith(3)
    act(() => result.current.handleSearchNext())
    expect(result.current.currentMatchIndex).toBe(0)
    act(() => result.current.handleSearchPrev())
    expect(result.current.currentMatchIndex).toBe(2)
  })
  it('reuses extracted text across queries and releases matches on close', async () => {
    const { result, pdf } = setup()
    await waitFor(() => expect(result.current.isSearching).toBe(false))
    act(() => result.current.setSearchQuery('last'))
    await waitFor(() => expect(result.current.searchMatches).toHaveLength(1))
    expect(pdf.getPage).toHaveBeenCalledTimes(3)
    act(() => result.current.handleSearchClose())
    expect(result.current.searchMatches).toHaveLength(0)
  })
  it.each(['generation', 'query', 'close', 'unmount'] as const)(
    'ignores delayed extraction after %s changes',
    async (change) => {
      let resolve!: (content: { items: { str: string }[] }) => void
      const getTextContent = vi.fn(
        () =>
          new Promise((done) => {
            resolve = done
          })
      )
      const pdf = {
        numPages: 1,
        getPage: vi.fn(async () => ({ getTextContent }))
      } as unknown as PDFDocumentProxy
      const { result, rerender, unmount } = setup(pdf)
      await waitFor(() => expect(getTextContent).toHaveBeenCalledOnce())
      if (change === 'generation')
        rerender({ document: makeDocument(['New content']), revision: 2 })
      if (change === 'query') act(() => result.current.setSearchQuery('absent'))
      if (change === 'close') act(() => result.current.handleSearchClose())
      if (change === 'unmount') unmount()
      await act(async () => resolve({ items: [{ str: 'Old match' }] }))
      expect(usePdfStore.getState().scrollToPage).not.toHaveBeenCalled()
      if (change !== 'unmount')
        await waitFor(() => expect(result.current.searchMatches).toHaveLength(0))
    }
  )
  it('reports extraction failure rather than a false zero-result success, and can retry', async () => {
    const pdf = makeDocument(['match'])
    vi.mocked(pdf.getPage).mockRejectedValueOnce(new Error('Extraction failed'))
    const { result } = setup(pdf)
    await waitFor(() => expect(result.current.searchFailed).toBe(true))
    act(() => result.current.handleSearchClose())
    act(() => {
      usePdfStore.getState().setPdfSearchVisible(true)
      result.current.setSearchQuery('match')
    })
    await waitFor(() => expect(result.current.searchMatches).toHaveLength(1))
    expect(result.current.searchFailed).toBe(false)
  })
})
