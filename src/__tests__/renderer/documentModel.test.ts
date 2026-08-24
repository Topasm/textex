import { describe, expect, it, vi } from 'vitest'
import { DocumentModel } from '../../renderer/models/documentModel'

function createModel(initialText: string) {
  let text = initialText
  const materialize = vi.fn(() => text)
  const model = new DocumentModel('/project/main.tex', materialize)
  return {
    model,
    materialize,
    edit(nextText: string) {
      text = nextText
      return model.recordChange('editor')
    }
  }
}

describe('DocumentModel', () => {
  it('opens at a clean revision and reuses an explicitly materialized snapshot', () => {
    const { model, materialize } = createModel('original')

    const first = model.snapshot()
    expect(first).toEqual({
      documentId: '/project/main.tex',
      revision: 0,
      text: 'original'
    })
    expect(Object.isFrozen(first)).toBe(true)
    expect(model.snapshot()).toBe(first)
    expect(materialize).toHaveBeenCalledTimes(1)
    expect(model.isDirty).toBe(false)
  })

  it('advances revision from an editor delta without materializing text', () => {
    const { model, materialize, edit } = createModel('one')
    const originalRevision = model.revisionSnapshot()

    const edited = edit('two')

    expect(edited).toEqual({ documentId: '/project/main.tex', revision: 1 })
    expect(originalRevision.revision).toBe(0)
    expect(materialize).not.toHaveBeenCalled()
    expect(model.isDirty).toBe(true)
  })

  it('keeps a materialized old snapshot stable after later edits', () => {
    const { model, edit } = createModel('one')
    const original = model.snapshot()

    edit('two')

    expect(model.snapshot().text).toBe('two')
    expect(original).toEqual({ documentId: '/project/main.tex', revision: 0, text: 'one' })
  })

  it('keeps edits made during a save dirty when the older save completes', () => {
    const { model, edit } = createModel('disk')
    const saving = edit('save me')

    edit('typed while saving')
    expect(model.markSaved(saving.revision)).toBe(false)
    expect(model.revision).toBe(2)
    expect(model.isDirty).toBe(true)
  })

  it('marks only the latest revision clean', () => {
    const { model, edit } = createModel('disk')
    const saved = edit('save point')

    expect(model.markSaved(saved.revision)).toBe(true)
    expect(model.isDirty).toBe(false)
  })

  it('holds a history restore behind an explicit-save barrier until an editor change', () => {
    const { model } = createModel('disk')

    model.recordChange('history-restore')
    expect(model.requiresExplicitSave).toBe(true)
    model.recordChange('programmatic')
    expect(model.requiresExplicitSave).toBe(true)

    model.recordChange('editor')
    expect(model.requiresExplicitSave).toBe(false)
  })

  it('clears the history restore barrier only after the current revision is saved', () => {
    const { model } = createModel('disk')
    const restored = model.recordChange('history-restore')
    model.recordChange('programmatic')

    expect(model.markSaved(restored.revision)).toBe(false)
    expect(model.requiresExplicitSave).toBe(true)
    expect(model.markSaved()).toBe(true)
    expect(model.requiresExplicitSave).toBe(false)
  })

  it('rejects stale asynchronous results after another edit', () => {
    const { model, edit } = createModel('one')
    const analysisInput = model.revisionSnapshot()
    const commit = vi.fn()

    edit('two')

    expect(model.commitIfCurrent(analysisInput, commit)).toBeNull()
    expect(commit).not.toHaveBeenCalled()
  })

  it('rejects snapshots from a reopened model with the same document id', () => {
    const closedModel = new DocumentModel('/project/main.tex', () => 'old')
    const stale = closedModel.revisionSnapshot()
    const reopenedModel = new DocumentModel('/project/main.tex', () => 'new')

    expect(reopenedModel.isCurrent(stale)).toBe(false)
  })

  it('switches materialization to a newly bound canonical buffer', () => {
    const { model } = createModel('bootstrap')
    const editorMaterializer = vi.fn(() => 'monaco')

    model.bindMaterializer(editorMaterializer)

    expect(model.snapshot().text).toBe('monaco')
    expect(editorMaterializer).toHaveBeenCalledTimes(1)
  })
})
