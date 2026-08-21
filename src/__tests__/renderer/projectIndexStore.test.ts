import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore } from '../../renderer/store/useProjectStore'

describe('project index store', () => {
  beforeEach(() => {
    useProjectStore.getState().setProjectRoot('/project')
    useProjectStore.getState().setProjectIndex({
      root: '/project',
      generation: 1,
      entries: [
        {
          path: '/project/main.tex',
          relativePath: 'main.tex',
          parentRelativePath: '',
          name: 'main.tex',
          type: 'file'
        }
      ]
    })
  })

  it('publishes ordered deltas and leaves the snapshot unchanged across a gap', () => {
    expect(
      useProjectStore.getState().applyProjectIndexDelta({
        generation: 2,
        removedPaths: [],
        upserted: [
          {
            path: '/project/chapter.tex',
            relativePath: 'chapter.tex',
            parentRelativePath: '',
            name: 'chapter.tex',
            type: 'file'
          }
        ]
      })
    ).toBe(true)
    expect(useProjectStore.getState().projectIndex?.generation).toBe(2)
    expect(useProjectStore.getState().projectIndex?.entries).toHaveLength(2)

    expect(
      useProjectStore.getState().applyProjectIndexDelta({
        generation: 4,
        removedPaths: [],
        upserted: []
      })
    ).toBe(false)
    expect(useProjectStore.getState().projectIndex?.generation).toBe(2)
  })

  it('clears indexed metadata when the active project changes', () => {
    useProjectStore.getState().setProjectRoot('/another-project')
    expect(useProjectStore.getState().projectIndex).toBeNull()
  })
})
