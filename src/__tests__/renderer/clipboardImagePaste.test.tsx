import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorAdapter } from '../../renderer/editor/EditorAdapter'
import { useClipboardImagePaste } from '../../renderer/hooks/editor/useClipboardImagePaste'
import { useNotificationStore } from '../../renderer/store/useNotificationStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { clipboardImageFileName, findClipboardImage } from '../../renderer/utils/clipboardImage'

function imageFile(name: string, type: string, bytes = [137, 80, 78, 71]): File {
  const file = new File([new Uint8Array(bytes)], name, { type })
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => Uint8Array.from(bytes).buffer
  })
  return file
}

function pasteEvent(files: File[]) {
  return {
    clipboardData: { files, items: [] },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn()
  }
}

function editorAdapter(): EditorAdapter {
  return {
    getPosition: vi.fn(() => ({ line: 12, column: 1 })),
    applyEdits: vi.fn(() => true),
    focus: vi.fn()
  } as unknown as EditorAdapter
}

describe('clipboard image paste', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useProjectStore.setState({ projectRoot: '/project' })
    useNotificationStore.getState().clearNotifications()
    vi.mocked(window.api.createDirectory).mockResolvedValue({ success: true })
    vi.mocked(window.api.writeFileBinary).mockResolvedValue({
      filePath: '/project/images/pasted-20260902-101500.png'
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('names a bare clipboard bitmap from its MIME type and paste time', () => {
    expect(clipboardImageFileName('image/png', new Date(2026, 8, 2, 10, 15, 0))).toBe(
      'pasted-20260902-101500.png'
    )
    expect(clipboardImageFileName('image/jpeg;charset=binary', new Date(2026, 0, 5, 9, 4, 3))).toBe(
      'pasted-20260105-090403.jpg'
    )
    expect(clipboardImageFileName('text/plain', new Date())).toBeNull()
  })

  it('keeps a usable copied file name but takes the extension from the clipboard type', () => {
    const found = findClipboardImage(
      { files: [imageFile('Figure One.bmp', 'image/png')], items: [] } as unknown as DataTransfer,
      new Date(2026, 8, 2, 10, 15, 0)
    )
    expect(found?.fileName).toBe('Figure-One.png')
  })

  it('writes the pasted bytes into the project and cites the written copy', async () => {
    const event = pasteEvent([imageFile('', 'image/png')])
    const editor = editorAdapter()
    const { result } = renderHook(() => useClipboardImagePaste())

    await act(async () => {
      expect(
        await result.current.handlePaste(event as unknown as React.ClipboardEvent, editor)
      ).toBe(true)
    })

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.stopPropagation).toHaveBeenCalledOnce()
    expect(window.api.createDirectory).toHaveBeenCalledWith('/project/images')
    expect(window.api.writeFileBinary).toHaveBeenCalledWith(
      expect.stringMatching(/^\/project\/images\/pasted-\d{8}-\d{6}\.png$/u),
      Uint8Array.from([137, 80, 78, 71])
    )
    expect(editor.applyEdits).toHaveBeenCalledWith(
      'clipboard-image-paste',
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining('{images/pasted-20260902-101500.png}')
        })
      ])
    )
  })

  it('leaves a text paste to the editor', async () => {
    const event = pasteEvent([])
    const editor = editorAdapter()
    const { result } = renderHook(() => useClipboardImagePaste())

    await act(async () => {
      expect(
        await result.current.handlePaste(event as unknown as React.ClipboardEvent, editor)
      ).toBe(false)
    })

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(window.api.writeFileBinary).not.toHaveBeenCalled()
    expect(editor.applyEdits).not.toHaveBeenCalled()
  })

  it('reports the failure instead of leaving the paste silently dropped', async () => {
    vi.mocked(window.api.writeFileBinary).mockRejectedValue(new Error('Disk is full'))
    const event = pasteEvent([imageFile('', 'image/png')])
    const { result } = renderHook(() => useClipboardImagePaste())

    await act(async () => {
      await result.current.handlePaste(event as unknown as React.ClipboardEvent, editorAdapter())
    })

    expect(useNotificationStore.getState().notifications.at(-1)?.message).toContain('Disk is full')
  })

  it('asks for a project before importing image bytes', async () => {
    useProjectStore.setState({ projectRoot: null })
    const event = pasteEvent([imageFile('', 'image/png')])
    const { result } = renderHook(() => useClipboardImagePaste())

    await act(async () => {
      await result.current.handlePaste(event as unknown as React.ClipboardEvent, editorAdapter())
    })

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(window.api.writeFileBinary).not.toHaveBeenCalled()
    expect(useNotificationStore.getState().notifications.at(-1)?.message).toBe(
      'Open a project before pasting an image.'
    )
  })
})
