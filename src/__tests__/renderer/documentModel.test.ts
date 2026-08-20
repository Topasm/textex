import { describe, expect, it, vi } from 'vitest'
import { DocumentModel } from '../../renderer/models/documentModel'

describe('DocumentModel', () => {
  it('opens at a clean revision and reuses the immutable current snapshot', () => {
    const model = new DocumentModel('/project/main.tex', 'original')

    const first = model.snapshot()
    expect(first).toEqual({
      documentId: '/project/main.tex',
      revision: 0,
      text: 'original'
    })
    expect(Object.isFrozen(first)).toBe(true)
    expect(model.snapshot()).toBe(first)
    expect(model.isDirty).toBe(false)
  })

  it('advances revision only when text changes and keeps old snapshots stable', () => {
    const model = new DocumentModel('/project/main.tex', 'one')
    const original = model.snapshot()

    expect(model.updateText('one')).toBe(original)
    const edited = model.updateText('two')

    expect(edited.revision).toBe(1)
    expect(edited.text).toBe('two')
    expect(model.isDirty).toBe(true)
    expect(original.text).toBe('one')
    expect(original.revision).toBe(0)
  })

  it('keeps edits made during a save dirty when the older save completes', () => {
    const model = new DocumentModel('/project/main.tex', 'disk')
    const saving = model.updateText('save me')

    model.updateText('typed while saving')
    expect(model.markSaved(saving.revision)).toBe(false)

    const current = model.snapshot()
    expect(model.revision).toBe(2)
    expect(current.text).toBe('typed while saving')
    expect(model.isDirty).toBe(true)
  })

  it('marks only the latest revision clean', () => {
    const model = new DocumentModel('/project/main.tex', 'disk')
    const saved = model.updateText('save point')

    expect(model.markSaved(saved.revision)).toBe(true)
    expect(model.snapshot()).toBe(saved)
    expect(model.isDirty).toBe(false)
  })

  it('rejects stale asynchronous results after another edit', () => {
    const model = new DocumentModel('/project/main.tex', 'one')
    const analysisInput = model.snapshot()
    const commit = vi.fn()

    model.updateText('two')

    expect(model.commitIfCurrent(analysisInput, commit)).toBeNull()
    expect(commit).not.toHaveBeenCalled()
  })

  it('rejects snapshots from a reopened model with the same document id', () => {
    const closedModel = new DocumentModel('/project/main.tex', 'old')
    const stale = closedModel.snapshot()
    const reopenedModel = new DocumentModel('/project/main.tex', 'new')

    expect(reopenedModel.isCurrent(stale)).toBe(false)
  })

  it('does not overwrite an edit made while a watcher read is pending', () => {
    const model = new DocumentModel('/project/main.tex', 'disk version 1')
    const observed = model.snapshot()

    model.updateText('local edit')
    const result = model.reloadFromDisk('disk version 2', observed)

    expect(result.status).toBe('stale')
    expect(model.snapshot().text).toBe('local edit')
    expect(model.isDirty).toBe(true)
  })

  it('atomically publishes a clean revision when a watcher reload is valid', () => {
    const model = new DocumentModel('/project/main.tex', 'disk version 1')
    const listener = vi.fn()
    model.subscribe(listener)

    const result = model.reloadFromDisk('disk version 2', model.snapshot())

    expect(result.status).toBe('applied')
    expect(result.snapshot).toMatchObject({
      revision: 1,
      text: 'disk version 2'
    })
    expect(model.isDirty).toBe(false)
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'reload', after: result.snapshot })
    )
  })
})
