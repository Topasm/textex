import { beforeEach, describe, expect, it } from 'vitest'
import { DocumentRegistry, normalizeDocumentId } from '../../renderer/models/documentRegistry'

describe('DocumentRegistry', () => {
  let registry: DocumentRegistry

  beforeEach(() => {
    registry = new DocumentRegistry()
  })

  it('owns text outside UI state and keeps one model per normalized path', () => {
    const opened = registry.open('C:\\Paper\\Main.tex', 'one')
    const duplicate = registry.open('c:/paper/main.tex', 'ignored disk reread')

    expect(normalizeDocumentId('C:\\Paper\\Main.tex')).toBe('c:/paper/main.tex')
    expect(duplicate).toBe(opened)
    expect(registry.snapshot('C:/PAPER/MAIN.TEX')?.text).toBe('one')
  })

  it('returns revision-tagged dirty snapshots and marks only current saves clean', () => {
    registry.open('/paper/main.tex', 'disk')
    const saving = registry.update('/paper/main.tex', 'save me')!
    registry.update('/paper/main.tex', 'newer edit')

    expect(registry.markSaved('/paper/main.tex', saving.revision)).toBe(false)
    expect(registry.dirtySnapshots()).toEqual([
      {
        filePath: '/paper/main.tex',
        snapshot: expect.objectContaining({ revision: 2, text: 'newer edit' })
      }
    ])
  })

  it('can explicitly accept an external disk version and close the document', () => {
    registry.open('/paper/main.tex', 'disk')
    registry.update('/paper/main.tex', 'local')

    const reloaded = registry.replaceFromDisk('/paper/main.tex', 'external')
    expect(reloaded).toMatchObject({ revision: 2, text: 'external' })
    expect(registry.getModel('/paper/main.tex')?.isDirty).toBe(false)
    expect(registry.close('/paper/main.tex')).toBe(true)
    expect(registry.snapshot('/paper/main.tex')).toBeNull()
  })
})
