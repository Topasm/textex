import { describe, expect, it } from 'vitest'
import {
  initialPdfGenerationState,
  reducePdfGeneration,
  type PdfGeneration
} from '../../renderer/components/previewGeneration'

function generation(revision: number, path = '/project/main.pdf'): PdfGeneration {
  return {
    revision,
    path,
    file: { data: new Uint8Array([revision]) },
    numPages: null
  }
}

describe('PDF preview generation state', () => {
  it('shows the first loaded generation without waiting for a swap', () => {
    const requested = reducePdfGeneration(initialPdfGenerationState, {
      type: 'request',
      revision: 1,
      path: '/project/main.pdf'
    })
    const loaded = reducePdfGeneration(requested, { type: 'loaded', generation: generation(1) })

    expect(loaded.displayed?.revision).toBe(1)
    expect(loaded.pending).toBeNull()
  })

  it('keeps the old PDF displayed until the pending document and page are ready', () => {
    const displayed = {
      requested: { revision: 1, path: '/project/main.pdf' },
      displayed: { ...generation(1), numPages: 20 },
      pending: null
    }
    const requested = reducePdfGeneration(displayed, {
      type: 'request',
      revision: 2,
      path: '/project/main.pdf'
    })
    const loaded = reducePdfGeneration(requested, { type: 'loaded', generation: generation(2) })

    expect(loaded.displayed?.revision).toBe(1)
    expect(reducePdfGeneration(loaded, { type: 'ready', revision: 2 })).toBe(loaded)

    const documentLoaded = reducePdfGeneration(loaded, {
      type: 'documentLoaded',
      revision: 2,
      numPages: 21
    })
    const ready = reducePdfGeneration(documentLoaded, { type: 'ready', revision: 2 })

    expect(ready.displayed).toMatchObject({ revision: 2, numPages: 21 })
    expect(ready.pending).toBeNull()
  })

  it('ignores bytes and render completion from superseded revisions', () => {
    const displayed = {
      requested: { revision: 1, path: '/project/main.pdf' },
      displayed: { ...generation(1), numPages: 20 },
      pending: null
    }
    const requestTwo = reducePdfGeneration(displayed, {
      type: 'request',
      revision: 2,
      path: '/project/main.pdf'
    })
    const requestThree = reducePdfGeneration(requestTwo, {
      type: 'request',
      revision: 3,
      path: '/project/main.pdf'
    })

    expect(reducePdfGeneration(requestThree, { type: 'loaded', generation: generation(2) })).toBe(
      requestThree
    )
    expect(reducePdfGeneration(requestThree, { type: 'ready', revision: 2 })).toBe(requestThree)
    expect(requestThree.displayed?.revision).toBe(1)
  })

  it('drops a failed pending generation without clearing the displayed PDF', () => {
    const state = {
      requested: { revision: 2, path: '/project/main.pdf' },
      displayed: { ...generation(1), numPages: 20 },
      pending: { ...generation(2), numPages: 21 }
    }

    const failed = reducePdfGeneration(state, { type: 'failed', revision: 2 })

    expect(failed.displayed?.revision).toBe(1)
    expect(failed.pending).toBeNull()
  })
})
