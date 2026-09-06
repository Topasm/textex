import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { documentRegistry } from '../../renderer/models/documentRegistry'
beforeEach(() => {
  useEditorStore.getState().resetEditor()
  localStorage.removeItem('textex-editor-session')
})

describe('useEditorStore', () => {
  describe('updateActiveDocument', () => {
    it('updates the document model and publishes metadata only', () => {
      useEditorStore.getState().openFileInTab('/path/main.tex', '')
      useEditorStore.getState().updateActiveDocument('\\documentclass{article}')
      const state = useEditorStore.getState()
      expect(documentRegistry.snapshot('/path/main.tex')?.text).toBe('\\documentclass{article}')
      expect(state.isDirty).toBe(true)
      expect(state.revision).toBe(1)
      expect(state.openFiles['/path/main.tex']).not.toHaveProperty('content')
      expect(state).not.toHaveProperty('content')
    })

    it('does not clone tab metadata for every keystroke', () => {
      useEditorStore.getState().openFileInTab('/path/main.tex', '')
      useEditorStore.getState().updateActiveDocument('a')
      const dirtyTabs = useEditorStore.getState().openFiles

      useEditorStore.getState().updateActiveDocument('ab')

      expect(useEditorStore.getState().openFiles).toBe(dirtyTabs)
      expect(documentRegistry.snapshot('/path/main.tex')?.text).toBe('ab')
    })

    it('records incremental editor changes as metadata without a content field', () => {
      useEditorStore.getState().openFileInTab('/path/main.tex', '')
      useEditorStore.getState().recordEditorChange('/path/main.tex')

      expect(useEditorStore.getState().revision).toBe(1)
      expect(useEditorStore.getState()).not.toHaveProperty('content')
    })
  })

  describe('openFileInTab', () => {
    it('opens a new file and sets it as active', () => {
      useEditorStore.getState().openFileInTab('/path/a.tex', 'content A')
      const state = useEditorStore.getState()
      expect(state.activeFilePath).toBe('/path/a.tex')
      expect(state.filePath).toBe('/path/a.tex')
      expect(documentRegistry.snapshot('/path/a.tex')?.text).toBe('content A')
      expect(state.isDirty).toBe(false)
      expect(state.openFiles['/path/a.tex']).toBeDefined()
      expect(state.openFiles['/path/a.tex']).not.toHaveProperty('content')
    })

    it('refreshes content when reopening an already-open file', () => {
      // Open file with original content
      useEditorStore.getState().openFileInTab('/path/a.tex', 'original content')
      // Edit it
      useEditorStore.getState().updateActiveDocument('edited content')
      expect(documentRegistry.snapshot('/path/a.tex')?.text).toBe('edited content')

      // Reopen with fresh content from disk
      useEditorStore.getState().openFileInTab('/path/a.tex', 'fresh from disk')
      const state = useEditorStore.getState()
      expect(documentRegistry.snapshot('/path/a.tex')?.text).toBe('fresh from disk')
      expect(state.isDirty).toBe(false)
    })

    it('preserves cursor position when reopening an already-open file', () => {
      useEditorStore.getState().openFileInTab('/path/a.tex', 'content')
      useEditorStore.getState().setCursorPosition(10, 5)
      // Simulate cursor being saved in openFiles via setActiveTab flow
      useEditorStore.setState({
        openFiles: {
          '/path/a.tex': { isDirty: false, cursorLine: 10, cursorColumn: 5 }
        }
      })

      useEditorStore.getState().openFileInTab('/path/a.tex', 'refreshed')
      const state = useEditorStore.getState()
      expect(documentRegistry.snapshot('/path/a.tex')?.text).toBe('refreshed')
      expect(state.cursorLine).toBe(10)
      expect(state.cursorColumn).toBe(5)
    })

    it('does not corrupt other open files when opening a new file', () => {
      // Open file A
      useEditorStore.getState().openFileInTab('/path/a.tex', 'content A')

      // Open file B — this should NOT overwrite A's content
      useEditorStore.getState().openFileInTab('/path/b.tex', 'content B')
      const state = useEditorStore.getState()
      expect(state.activeFilePath).toBe('/path/b.tex')
      expect(documentRegistry.snapshot('/path/a.tex')?.text).toBe('content A')
      expect(documentRegistry.snapshot('/path/b.tex')?.text).toBe('content B')
    })
  })

  describe('restoreFilesInTabs', () => {
    it('restores saved order and cursors without activating background tabs', () => {
      const epoch = useEditorStore.getState().tabMutationEpoch

      expect(
        useEditorStore.getState().restoreFilesInTabs(
          [
            {
              filePath: '/path/c.tex',
              content: 'content C',
              cursorLine: 30,
              cursorColumn: 4
            }
          ],
          {
            orderedFilePaths: ['/path/c.tex'],
            activeFilePath: '/path/c.tex',
            expectedTabMutationEpoch: epoch
          }
        )
      ).toBe(true)

      expect(
        useEditorStore.getState().restoreFilesInTabs(
          [
            {
              filePath: '/path/a.tex',
              content: 'content A',
              cursorLine: 10,
              cursorColumn: 2
            },
            {
              filePath: '/path/b.tex',
              content: 'content B',
              cursorLine: 20,
              cursorColumn: 3
            }
          ],
          {
            orderedFilePaths: ['/path/a.tex', '/path/b.tex', '/path/c.tex'],
            expectedTabMutationEpoch: epoch
          }
        )
      ).toBe(true)

      const state = useEditorStore.getState()
      expect(Object.keys(state.openFiles)).toEqual(['/path/a.tex', '/path/b.tex', '/path/c.tex'])
      expect(state.activeFilePath).toBe('/path/c.tex')
      expect(state.cursorLine).toBe(30)
      expect(state.cursorColumn).toBe(4)
      expect(state.openFiles['/path/a.tex']).toMatchObject({ cursorLine: 10, cursorColumn: 2 })
    })

    it('rejects a restore commit after a normal tab mutation', () => {
      const staleEpoch = useEditorStore.getState().tabMutationEpoch
      useEditorStore.getState().openFileInTab('/path/user.tex', 'user content')

      expect(
        useEditorStore.getState().restoreFilesInTabs(
          [
            {
              filePath: '/path/stale.tex',
              content: 'stale content',
              cursorLine: 1,
              cursorColumn: 1
            }
          ],
          {
            orderedFilePaths: ['/path/stale.tex'],
            activeFilePath: '/path/stale.tex',
            expectedTabMutationEpoch: staleEpoch
          }
        )
      ).toBe(false)
      expect(Object.keys(useEditorStore.getState().openFiles)).toEqual(['/path/user.tex'])
      expect(documentRegistry.has('/path/stale.tex')).toBe(false)
    })

    it('persists the live cursor of the active tab for the next session', () => {
      localStorage.removeItem('textex-editor-session')
      useEditorStore.getState().openFileInTab('/path/active.tex', 'content')
      useEditorStore.getState().setCursorPosition(42, 7)

      const persisted = JSON.parse(localStorage.getItem('textex-editor-session') ?? '{}') as {
        state?: {
          _sessionCursors?: Record<string, { cursorLine: number; cursorColumn: number }>
        }
      }
      expect(persisted.state?._sessionCursors?.['/path/active.tex']).toEqual({
        cursorLine: 42,
        cursorColumn: 7
      })
    })
  })

  describe('setActiveTab', () => {
    it('persists current content when switching tabs', () => {
      // Open file A and edit it
      useEditorStore.getState().openFileInTab('/path/a.tex', 'original A')
      useEditorStore.getState().updateActiveDocument('edited A')

      // Open file B
      useEditorStore.getState().openFileInTab('/path/b.tex', 'content B')

      // Switch back to A — the edited content should be preserved
      useEditorStore.getState().setActiveTab('/path/a.tex')
      const state = useEditorStore.getState()
      expect(state.activeFilePath).toBe('/path/a.tex')
      expect(documentRegistry.snapshot('/path/a.tex')?.text).toBe('edited A')
    })

    it('saves content of current tab before switching away', () => {
      // Open two files
      useEditorStore.getState().openFileInTab('/path/a.tex', 'content A')
      useEditorStore.getState().openFileInTab('/path/b.tex', 'content B')

      // Edit B
      useEditorStore.getState().updateActiveDocument('edited B')

      // Switch to A — B's edited content should be saved in openFiles
      useEditorStore.getState().setActiveTab('/path/a.tex')
      expect(documentRegistry.snapshot('/path/b.tex')?.text).toBe('edited B')
    })

    it('preserves cursor position across tab switches', () => {
      useEditorStore.getState().openFileInTab('/path/a.tex', 'content A')
      useEditorStore.getState().setCursorPosition(15, 8)

      useEditorStore.getState().openFileInTab('/path/b.tex', 'content B')
      useEditorStore.getState().setCursorPosition(3, 12)

      // Switch back to A
      useEditorStore.getState().setActiveTab('/path/a.tex')
      expect(useEditorStore.getState().cursorLine).toBe(15)
      expect(useEditorStore.getState().cursorColumn).toBe(8)

      // Switch back to B
      useEditorStore.getState().setActiveTab('/path/b.tex')
      expect(useEditorStore.getState().cursorLine).toBe(3)
      expect(useEditorStore.getState().cursorColumn).toBe(12)
    })
  })

  describe('document registry with multiple files', () => {
    it('updates only the active document model', () => {
      useEditorStore.getState().openFileInTab('/path/a.tex', 'content A')
      useEditorStore.getState().openFileInTab('/path/b.tex', 'content B')

      // Edit B (the active file)
      useEditorStore.getState().updateActiveDocument('modified B')

      expect(documentRegistry.snapshot('/path/b.tex')?.text).toBe('modified B')
      expect(documentRegistry.snapshot('/path/a.tex')?.text).toBe('content A')
    })
  })
})
