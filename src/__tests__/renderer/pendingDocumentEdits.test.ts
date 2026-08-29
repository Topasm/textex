import { describe, expect, it, vi } from 'vitest'
import {
  flushAllPendingDocumentEdits,
  flushPendingDocumentEdits,
  registerPendingDocumentEditFlusher
} from '../../renderer/services/pendingDocumentEdits'

describe('pending document edits', () => {
  it('uses normalized document identity and unregisters cleanly', () => {
    const first = vi.fn()
    const second = vi.fn()
    const unregisterFirst = registerPendingDocumentEditFlusher('C:\\Paper\\Main.tex', first)
    const unregisterSecond = registerPendingDocumentEditFlusher('/paper/second.tex', second)

    flushPendingDocumentEdits('c:/paper/main.tex')
    expect(first).toHaveBeenCalledOnce()
    expect(second).not.toHaveBeenCalled()

    flushAllPendingDocumentEdits()
    expect(first).toHaveBeenCalledTimes(2)
    expect(second).toHaveBeenCalledOnce()

    unregisterFirst()
    unregisterSecond()
    flushAllPendingDocumentEdits()
    expect(first).toHaveBeenCalledTimes(2)
    expect(second).toHaveBeenCalledOnce()
  })
})
