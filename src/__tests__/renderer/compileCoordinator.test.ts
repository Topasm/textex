import { beforeEach, describe, expect, it } from 'vitest'
import { documentRegistry } from '../../renderer/models/documentRegistry'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import {
  beginCompileTicket,
  canPublishCompileTicket,
  isCurrentCompileIdentity,
  isLatestCompileTicket,
  resetCompileTicketsForTests
} from '../../renderer/services/compileCoordinator'

describe('compileCoordinator', () => {
  beforeEach(() => {
    documentRegistry.clear()
    useEditorStore.getState().resetEditor()
    resetCompileTicketsForTests()
  })

  it('publishes only the latest request for its exact source revision', () => {
    useEditorStore.getState().openFileInTab('/project/main.tex', 'first')
    const firstSnapshot = documentRegistry.snapshot('/project/main.tex')!
    const first = beginCompileTicket('/project/main.tex', firstSnapshot)
    const second = beginCompileTicket('/project/main.tex', firstSnapshot)

    expect(isLatestCompileTicket(first)).toBe(false)
    expect(canPublishCompileTicket(first)).toBe(false)
    expect(canPublishCompileTicket(second)).toBe(true)

    documentRegistry.update('/project/main.tex', 'second')
    expect(canPublishCompileTicket(second)).toBe(false)
  })

  it('rejects a result after the source document is closed and reopened', () => {
    useEditorStore.getState().openFileInTab('/project/main.tex', 'first')
    const snapshot = documentRegistry.snapshot('/project/main.tex')!
    const ticket = beginCompileTicket('/project/main.tex', snapshot)
    documentRegistry.close('/project/main.tex')
    documentRegistry.open('/project/main.tex', 'first')

    expect(canPublishCompileTicket(ticket)).toBe(false)
  })

  it('keeps a detached PDF workspace root compile current while another tab is active', () => {
    useEditorStore.getState().openFileInTab('/project/main.tex', 'root')
    const snapshot = documentRegistry.snapshot('/project/main.tex')!
    useEditorStore.getState().openFileInTab('/project/chapter.tex', 'chapter')
    const attached = beginCompileTicket('/project/main.tex', snapshot)
    expect(canPublishCompileTicket(attached)).toBe(false)

    const detached = beginCompileTicket('/project/main.tex', snapshot, {
      detachedFromActiveTab: true
    })
    expect(canPublishCompileTicket(detached)).toBe(true)
    expect(
      isCurrentCompileIdentity({
        requestId: detached.requestId,
        documentId: snapshot.documentId,
        documentRevision: snapshot.revision
      })
    ).toBe(true)
  })
})
