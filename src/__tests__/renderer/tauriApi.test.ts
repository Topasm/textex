import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTauriApi } from '../../renderer/platform/tauriApi'
import { installDesktopApi } from '../../renderer/platform/desktopApi'

const invokeMock = vi.hoisted(() => vi.fn())
const isTauriMock = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
  isTauri: isTauriMock,
  Channel: class {
    onmessage: (message: unknown) => void = () => {}
  }
}))

const originalApi = window.api

describe('Tauri DesktopApi adapter', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    isTauriMock.mockReset()
    const api = createTauriApi()
    api.removeCompileLogListener()
    api.removeDirectoryChangedListener()
  })

  afterEach(() => {
    window.api = originalApi
    delete document.documentElement.dataset.desktopRuntime
  })

  it('maps migrated filesystem methods to Tauri commands', async () => {
    invokeMock
      .mockResolvedValueOnce('/projects/paper')
      .mockResolvedValueOnce([{ name: 'main.tex', path: '/projects/paper/main.tex', type: 'file' }])
      .mockResolvedValueOnce({ content: 'hello', filePath: '/projects/paper/main.tex' })
      .mockResolvedValueOnce({ success: true })

    const api = createTauriApi()

    await expect(api.openDirectory()).resolves.toBe('/projects/paper')
    await expect(api.readDirectory('/projects/paper')).resolves.toHaveLength(1)
    await expect(api.readFile('/projects/paper/main.tex')).resolves.toEqual({
      content: 'hello',
      filePath: '/projects/paper/main.tex'
    })
    await expect(api.saveFile('updated', '/projects/paper/main.tex')).resolves.toEqual({
      success: true
    })

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'open_directory')
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'read_directory', {
      dirPath: '/projects/paper'
    })
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'read_file', {
      filePath: '/projects/paper/main.tex'
    })
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'save_file', {
      content: 'updated',
      filePath: '/projects/paper/main.tex'
    })
  })

  it('uses the atomic Rust batch-save command', async () => {
    invokeMock.mockResolvedValue({ success: true })
    const api = createTauriApi()

    await expect(
      api.saveFileBatch([
        { content: 'a', filePath: '/project/a.tex' },
        { content: 'b', filePath: '/project/b.tex' }
      ])
    ).resolves.toEqual({ success: true })

    expect(invokeMock).toHaveBeenCalledOnce()
    expect(invokeMock).toHaveBeenCalledWith('save_file_batch', {
      files: [
        { content: 'a', filePath: '/project/a.tex' },
        { content: 'b', filePath: '/project/b.tex' }
      ]
    })
  })

  it('maps the extended filesystem commands and normalizes binary data', async () => {
    invokeMock
      .mockResolvedValueOnce({
        content: '\\documentclass{article}',
        filePath: '/project/main.tex',
        warnLargeFile: false
      })
      .mockResolvedValueOnce({ filePath: '/project/copy.tex' })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ data: 'data:image/png;base64,iVBORw==', mimeType: 'image/png' })
      .mockResolvedValueOnce({ data: [37, 80, 68, 70], mimeType: 'application/pdf' })

    const api = createTauriApi()

    await expect(api.openFile()).resolves.toEqual({
      content: '\\documentclass{article}',
      filePath: '/project/main.tex',
      warnLargeFile: false
    })
    await expect(api.saveFileAs('copy')).resolves.toEqual({ filePath: '/project/copy.tex' })
    await expect(api.createFile('/project/chapter.tex')).resolves.toEqual({ success: true })
    await expect(api.createDirectory('/project/figures')).resolves.toEqual({ success: true })
    await expect(api.copyFile('/project/source.png', '/project/figures/copy.png')).resolves.toEqual(
      {
        success: true
      }
    )
    await expect(api.readFileBase64('/project/source.png')).resolves.toEqual({
      data: 'data:image/png;base64,iVBORw==',
      mimeType: 'image/png'
    })
    const binary = await api.readFileBinary('/project/main.pdf')
    expect(binary.mimeType).toBe('application/pdf')
    expect(binary.data).toBeInstanceOf(Uint8Array)
    expect([...binary.data]).toEqual([37, 80, 68, 70])

    expect(invokeMock.mock.calls).toEqual([
      ['open_file'],
      ['save_file_as', { content: 'copy' }],
      ['create_file', { filePath: '/project/chapter.tex' }],
      ['create_directory', { dirPath: '/project/figures' }],
      ['copy_file', { source: '/project/source.png', dest: '/project/figures/copy.png' }],
      ['read_file_base64', { filePath: '/project/source.png' }],
      ['read_file_binary', { filePath: '/project/main.pdf' }]
    ])
  })

  it('keeps project activation and settings on the typed Rust boundary', async () => {
    const settings = {
      theme: 'dark',
      fontSize: 16,
      autoCompile: true,
      watchOpenFiles: true,
      spellCheckEnabled: false,
      spellCheckLanguage: 'en-US',
      gitEnabled: true,
      autoUpdateEnabled: true,
      lspEnabled: true,
      zoteroEnabled: false,
      zoteroPort: 23119,
      aiProvider: '',
      aiModel: '',
      recentProjects: []
    }
    invokeMock
      .mockResolvedValueOnce('/project')
      .mockResolvedValueOnce(settings)
      .mockResolvedValueOnce(settings)
      .mockResolvedValueOnce(settings)
      .mockResolvedValueOnce(settings)
      .mockResolvedValueOnce(settings)

    const api = createTauriApi()
    await expect(api.activateProject('/project')).resolves.toBe('/project')
    await expect(api.loadSettings()).resolves.toBe(settings)
    await expect(api.saveSettings({ theme: 'dark' })).resolves.toBe(settings)
    await expect(api.addRecentProject('/project')).resolves.toBe(settings)
    await expect(api.removeRecentProject('/project')).resolves.toBe(settings)
    await expect(api.updateRecentProject('/project', { pinned: true })).resolves.toBe(settings)

    expect(invokeMock.mock.calls).toEqual([
      ['activate_project', { projectPath: '/project' }],
      ['load_settings'],
      ['save_settings', { partial: { theme: 'dark' } }],
      ['add_recent_project', { projectPath: '/project' }],
      ['remove_recent_project', { projectPath: '/project' }],
      ['update_recent_project', { projectPath: '/project', updates: { pinned: true } }]
    ])
  })

  it('streams revision-tagged compile logs through a Tauri channel', async () => {
    const request = {
      filePath: '/project/main.tex',
      requestId: 4,
      documentId: '/project/main.tex',
      documentRevision: 9,
      priority: 'normal' as const
    }
    const response = {
      requestId: 4,
      documentId: '/project/main.tex',
      documentRevision: 9,
      pdfPath: '/project/main.pdf',
      compiledFilePath: '/project/main.tex'
    }
    const logListener = vi.fn()
    invokeMock.mockImplementation(async (command: string, payload: Record<string, unknown>) => {
      expect(command).toBe('compile_latex')
      const channel = payload.onEvent as { onmessage(message: unknown): void }
      channel.onmessage({
        event: 'log',
        requestId: 4,
        documentId: '/project/main.tex',
        documentRevision: 9,
        text: 'Running TeX\n'
      })
      return response
    })

    const api = createTauriApi()
    api.onCompileLog(logListener)

    await expect(api.compile(request)).resolves.toEqual(response)
    expect(logListener).toHaveBeenCalledWith({
      requestId: 4,
      documentId: '/project/main.tex',
      documentRevision: 9,
      text: 'Running TeX\n'
    })
    expect(invokeMock).toHaveBeenCalledWith('compile_latex', {
      request,
      onEvent: expect.any(Object)
    })
  })

  it('streams directory changes through one watcher channel', async () => {
    const listener = vi.fn()
    let watcherChannel: { onmessage(message: unknown): void } | undefined
    invokeMock.mockImplementation(async (command: string, payload?: Record<string, unknown>) => {
      if (command === 'watch_directory') {
        watcherChannel = payload?.onEvent as { onmessage(message: unknown): void }
      }
      return { success: true }
    })

    const api = createTauriApi()
    api.onDirectoryChanged(listener)
    await expect(api.watchDirectory('/project')).resolves.toEqual({ success: true })
    watcherChannel?.onmessage({ type: 'change', filename: 'chapters/intro.tex' })

    expect(listener).toHaveBeenCalledWith({
      type: 'change',
      filename: 'chapters/intro.tex'
    })
    expect(invokeMock).toHaveBeenNthCalledWith(1, 'watch_directory', {
      dirPath: '/project',
      onEvent: expect.any(Object)
    })

    api.removeDirectoryChangedListener()
    watcherChannel?.onmessage({ type: 'rename', filename: 'main.tex' })
    expect(listener).toHaveBeenCalledOnce()
    await expect(api.unwatchDirectory()).resolves.toEqual({ success: true })
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'unwatch_directory')
  })

  it('keeps mandatory listeners and LSP cleanup safe while their backends are pending', async () => {
    const api = createTauriApi()
    const disposeData = api.onPtyData('pty-1', () => {})
    const disposeExit = api.onPtyExit('pty-1', () => {})

    expect(() => api.onCompileLog(() => {})).not.toThrow()
    expect(() => api.onDiagnostics(() => {})).not.toThrow()
    expect(() => api.onUpdateEvent('available', () => {})).not.toThrow()
    expect(() => api.onAppCommand(() => {})).not.toThrow()
    expect(() => disposeData()).not.toThrow()
    expect(() => disposeExit()).not.toThrow()
    await expect(api.lspStop()).resolves.toEqual({ success: false })
  })

  it('fails non-migrated commands with an actionable error', async () => {
    const api = createTauriApi()

    await expect(api.gitStatus('/project')).rejects.toThrow(
      'Desktop API method "gitStatus" has not been migrated'
    )
  })

  it('preserves the Electron preload API when it is already installed', async () => {
    const electronApi = window.api

    await installDesktopApi()

    expect(window.api).toBe(electronApi)
    expect(document.documentElement.dataset.desktopRuntime).toBe('electron')
    expect(isTauriMock).not.toHaveBeenCalled()
  })

  it('installs the adapter only inside the Tauri runtime', async () => {
    window.api = undefined as unknown as Window['api']
    isTauriMock.mockReturnValue(true)

    await installDesktopApi()

    expect(window.api.openDirectory).toBeTypeOf('function')
    expect(document.documentElement.dataset.desktopRuntime).toBe('tauri')
    expect(isTauriMock).toHaveBeenCalledOnce()
  })

  it('rejects startup when no supported desktop runtime exists', async () => {
    window.api = undefined as unknown as Window['api']
    isTauriMock.mockReturnValue(false)

    await expect(installDesktopApi()).rejects.toThrow(
      'TextEx requires either the Electron preload or Tauri runtime'
    )
  })
})
