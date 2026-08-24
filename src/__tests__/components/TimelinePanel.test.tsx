import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TimelinePanel } from '../../renderer/components/TimelinePanel'
import i18n from '../../renderer/i18n'
import { documentRegistry } from '../../renderer/models/documentRegistry'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useNotificationStore } from '../../renderer/store/useNotificationStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'

const FILE_PATH = '/project/main.tex'
const HISTORY_ITEM = {
  timestamp: Date.now() - 1_000,
  size: 24,
  path: '/project/.textex/history/main.tex/1.gz'
}
const SECOND_FILE_PATH = '/project/second.tex'
const SECOND_HISTORY_ITEM = {
  timestamp: Date.now() - 2_000,
  size: 30,
  path: '/project/.textex/history/second.tex/2.gz'
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('TimelinePanel local history restore', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('en')
    useEditorStore.getState().resetEditor()
    useEditorStore.getState().openFileInTab(FILE_PATH, 'current disk text')
    useNotificationStore.getState().clearNotifications()
    useProjectStore.setState({ projectRoot: '/project', isGitRepo: false })
    vi.mocked(window.api.getHistoryList).mockResolvedValue([HISTORY_ITEM])
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('restores a confirmed snapshot into the editor as an unsaved change', async () => {
    vi.mocked(window.api.loadHistorySnapshot).mockResolvedValue('older text')
    render(<TimelinePanel />)

    fireEvent.click(await screen.findByRole('button'))

    await waitFor(() => {
      expect(documentRegistry.snapshot(FILE_PATH)?.text).toBe('older text')
    })
    expect(window.confirm).toHaveBeenCalledWith(
      'Restore this snapshot into the editor? It will remain unsaved until you save it.'
    )
    expect(useEditorStore.getState().isDirty).toBe(true)
    expect(documentRegistry.getModel(FILE_PATH)?.requiresExplicitSave).toBe(true)
    expect(window.api.saveFile).not.toHaveBeenCalled()
    expect(useNotificationStore.getState().notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'timeline-restore-success', tone: 'success' })
      ])
    )
  })

  it('uses the destructive-change confirmation and leaves content untouched when cancelled', async () => {
    useEditorStore.getState().updateActiveDocument('unsaved work')
    vi.mocked(window.confirm).mockReturnValue(false)
    render(<TimelinePanel />)

    fireEvent.click(await screen.findByRole('button'))

    expect(window.confirm).toHaveBeenCalledWith(
      'Replace your current unsaved changes with this snapshot? The restored text will remain unsaved until you save it.'
    )
    expect(window.api.loadHistorySnapshot).not.toHaveBeenCalled()
    expect(documentRegistry.snapshot(FILE_PATH)?.text).toBe('unsaved work')
  })

  it('drops a loaded snapshot when the document revision changed after confirmation', async () => {
    const load = deferred<string>()
    vi.mocked(window.api.loadHistorySnapshot).mockReturnValue(load.promise)
    render(<TimelinePanel />)

    fireEvent.click(await screen.findByRole('button'))
    act(() => {
      useEditorStore.getState().updateActiveDocument('newer edit')
    })
    await act(async () => {
      load.resolve('older text')
      await load.promise
    })

    await waitFor(() => {
      expect(useNotificationStore.getState().notifications).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'timeline-restore-stale', tone: 'warning' })
        ])
      )
    })
    expect(documentRegistry.snapshot(FILE_PATH)?.text).toBe('newer edit')
    expect(window.api.saveFile).not.toHaveBeenCalled()
  })

  it('does not publish an older timeline refresh after the active file changes', async () => {
    const firstRefresh = deferred<(typeof HISTORY_ITEM)[]>()
    vi.mocked(window.api.getHistoryList).mockImplementation((filePath) =>
      filePath === FILE_PATH ? firstRefresh.promise : Promise.resolve([SECOND_HISTORY_ITEM])
    )
    vi.mocked(window.api.loadHistorySnapshot).mockResolvedValue('second text')
    render(<TimelinePanel />)

    act(() => {
      useEditorStore.getState().openFileInTab(SECOND_FILE_PATH, 'second text')
    })
    await waitFor(() => {
      expect(window.api.getHistoryList).toHaveBeenCalledWith(SECOND_FILE_PATH)
    })

    fireEvent.click(await screen.findByRole('button'))
    await waitFor(() => {
      expect(window.api.loadHistorySnapshot).toHaveBeenCalledWith(
        SECOND_FILE_PATH,
        SECOND_HISTORY_ITEM.path
      )
    })
    vi.mocked(window.api.loadHistorySnapshot).mockClear()

    await act(async () => {
      firstRefresh.resolve([HISTORY_ITEM])
      await firstRefresh.promise
    })
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(window.api.loadHistorySnapshot).toHaveBeenCalledWith(
        SECOND_FILE_PATH,
        SECOND_HISTORY_ITEM.path
      )
    })
  })
})
