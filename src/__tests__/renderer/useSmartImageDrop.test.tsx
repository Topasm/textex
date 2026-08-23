import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorAdapter } from '../../renderer/editor/EditorAdapter'
import {
  MAX_DROPPED_IMAGE_BYTES,
  droppedImageFileName,
  useSmartImageDrop
} from '../../renderer/hooks/editor/useSmartImageDrop'
import { useProjectStore } from '../../renderer/store/useProjectStore'

function imageFile(name = 'plot.png', bytes = [137, 80, 78, 71]): File {
  const file = new File([new Uint8Array(bytes)], name, { type: 'image/png' })
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => Uint8Array.from(bytes).buffer
  })
  return file
}

function dropEvent(file: File) {
  return {
    clientX: 40,
    clientY: 80,
    dataTransfer: { files: [file] },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn()
  }
}

function editorAdapter(): EditorAdapter {
  return {
    getPositionAtClientPoint: vi.fn(() => ({ line: 3, column: 5 })),
    applyEdits: vi.fn(() => true),
    setPosition: vi.fn(),
    focus: vi.fn()
  } as unknown as EditorAdapter
}

describe('useSmartImageDrop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'alert').mockImplementation(() => {})
    useProjectStore.setState({ projectRoot: '/project' })
    vi.mocked(window.api.createDirectory).mockResolvedValue({ success: true })
    vi.mocked(window.api.writeFileBinary).mockResolvedValue({
      filePath: '/project/images/chapter-plot.png'
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('imports HTML5 file bytes through the project-scoped Tauri command', async () => {
    const file = imageFile('chapter plot.png')
    const event = dropEvent(file)
    const editor = editorAdapter()
    const { result } = renderHook(() => useSmartImageDrop())

    await act(async () => {
      await result.current.handleDrop(event as unknown as React.DragEvent, editor)
    })

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.stopPropagation).toHaveBeenCalledOnce()
    expect(window.api.createDirectory).toHaveBeenCalledWith('/project/images')
    expect(window.api.writeFileBinary).toHaveBeenCalledWith(
      '/project/images/chapter-plot.png',
      Uint8Array.from([137, 80, 78, 71])
    )
    expect(editor.applyEdits).toHaveBeenCalledWith(
      'image-drop',
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining('{images/chapter-plot.png}')
        })
      ])
    )
  })

  it('rejects oversized image drops before crossing the native boundary', async () => {
    const file = imageFile()
    Object.defineProperty(file, 'size', { value: MAX_DROPPED_IMAGE_BYTES + 1 })
    const event = dropEvent(file)
    const { result } = renderHook(() => useSmartImageDrop())

    await act(async () => {
      await result.current.handleDrop(event as unknown as React.DragEvent, editorAdapter())
    })

    expect(window.api.writeFileBinary).not.toHaveBeenCalled()
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })

  it('normalizes path-like browser names to a safe basename', () => {
    expect(droppedImageFileName('C:\\Users\\Ada\\figure.png')).toBe('figure.png')
    expect(droppedImageFileName('../../figure.png')).toBe('figure.png')
    expect(droppedImageFileName('plot%}.png')).toBe('plot.png')
    expect(droppedImageFileName('..')).toBeNull()
  })
})
