import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTauriApi } from '../../renderer/platform/tauriApi'
import { installDesktopApi } from '../../renderer/platform/desktopApi'
import { getDesktopCapabilities } from '../../renderer/platform/capabilities'

const invokeMock = vi.hoisted(() => vi.fn())
const isTauriMock = vi.hoisted(() => vi.fn())
const channelInstances = vi.hoisted(() => [] as Array<{ onmessage: (message: unknown) => void }>)
const listenMock = vi.hoisted(() => vi.fn())
const unlistenMock = vi.hoisted(() => vi.fn())
const eventCallbacks = vi.hoisted(() => new Map<string, (event: { payload: unknown }) => void>())
const setWindowThemeMock = vi.hoisted(() => vi.fn())
const closeWindowMock = vi.hoisted(() => vi.fn())
const minimizeWindowMock = vi.hoisted(() => vi.fn())
const toggleMaximizeWindowMock = vi.hoisted(() => vi.fn())
const startWindowDraggingMock = vi.hoisted(() => vi.fn())
const startWindowResizeMock = vi.hoisted(() => vi.fn())
const onCloseRequestedMock = vi.hoisted(() => vi.fn())
const closeWindowUnlistenMock = vi.hoisted(() => vi.fn())
const closeRequestedHandlers = vi.hoisted(
  () => [] as Array<(event: { preventDefault(): void }) => void | Promise<void>>
)

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
  isTauri: isTauriMock,
  Channel: class {
    onmessage: (message: unknown) => void = () => {}

    constructor() {
      channelInstances.push(this)
    }
  }
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    setTheme: setWindowThemeMock,
    close: closeWindowMock,
    minimize: minimizeWindowMock,
    toggleMaximize: toggleMaximizeWindowMock,
    startDragging: startWindowDraggingMock,
    startResizeDragging: startWindowResizeMock,
    onCloseRequested: onCloseRequestedMock
  })
}))

const originalApi = window.api

describe('Tauri DesktopApi adapter', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    isTauriMock.mockReset()
    unlistenMock.mockReset()
    setWindowThemeMock.mockReset()
    closeWindowMock.mockReset()
    minimizeWindowMock.mockReset()
    toggleMaximizeWindowMock.mockReset()
    startWindowDraggingMock.mockReset()
    startWindowResizeMock.mockReset()
    onCloseRequestedMock.mockReset()
    closeWindowUnlistenMock.mockReset()
    closeRequestedHandlers.length = 0
    onCloseRequestedMock.mockImplementation(
      async (handler: (event: { preventDefault(): void }) => void | Promise<void>) => {
        closeRequestedHandlers.push(handler)
        return closeWindowUnlistenMock
      }
    )
    eventCallbacks.clear()
    listenMock.mockReset()
    listenMock.mockImplementation(
      async (event: string, callback: (event: { payload: unknown }) => void) => {
        eventCallbacks.set(event, callback)
        return unlistenMock
      }
    )
    channelInstances.length = 0
    const api = createTauriApi()
    api.removeCompileLogListener()
    api.removeDiagnosticsListener()
    api.removeDirectoryChangedListener()
  })

  afterEach(() => {
    window.api = originalApi
    delete document.documentElement.dataset.desktopRuntime
  })

  it('maps research chat to the dedicated configured-provider command', async () => {
    const request = {
      message: 'Compare the implementation with the paper.',
      history: [{ role: 'user' as const, content: 'Focus on the training loss.' }],
      contexts: [
        {
          kind: 'repository' as const,
          resourceId: 'official-code',
          label: 'Official code',
          source: 'src/train.py:42',
          content: 'loss = policy_loss(batch)'
        }
      ],
      instructions: ['Use concise technical language.'],
      execution: { provider: 'anthropic' as const, model: 'claude-sonnet-4-6' }
    }
    const response = {
      content: 'The implementation uses policy_loss [Official code].',
      execution: { provider: 'anthropic', model: 'claude-sonnet-4-6' }
    }
    invokeMock.mockResolvedValueOnce(response)

    const api = createTauriApi()
    await expect(api.aiResearchChat(request)).resolves.toEqual(response)
    expect(invokeMock).toHaveBeenCalledWith('ai_research_chat', { request })
  })

  it('keeps Zotero planning and approved writes on separate native commands', async () => {
    const request = { message: 'Create a Zotero collection.', history: [] }
    const plan = {
      summary: 'Create Writing Projects.',
      serverId: 'server',
      port: 23_119,
      projectRoot: '/project',
      projectEpoch: '3',
      operations: [
        {
          kind: 'createCollection' as const,
          key: 'ABCD2345',
          name: 'Writing Projects',
          path: 'Writing Projects',
          parentKey: null,
          parentLabel: 'Library root'
        }
      ]
    }
    invokeMock.mockResolvedValueOnce(plan).mockResolvedValueOnce({
      summary: 'Applied 1 approved Zotero change.',
      applied: 1,
      collectionChanges: 1,
      itemChanges: 0
    })

    const api = createTauriApi()
    await expect(api.aiPlanZotero(request, 23_119)).resolves.toEqual(plan)
    await expect(api.zoteroApplyMutationPlan(plan)).resolves.toEqual(
      expect.objectContaining({ applied: 1 })
    )
    expect(invokeMock.mock.calls).toEqual([
      ['ai_plan_zotero', { request, port: 23_119 }],
      ['zotero_apply_mutation_plan', { plan }]
    ])
  })

  it('maps filesystem methods to Tauri commands', async () => {
    invokeMock
      .mockResolvedValueOnce('/projects/paper')
      .mockResolvedValueOnce([{ name: 'main.tex', path: '/projects/paper/main.tex', type: 'file' }])
      .mockResolvedValueOnce({ content: 'hello', filePath: '/projects/paper/main.tex' })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ filePath: '/projects/paper/figure.png' })

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
    await expect(
      api.writeFileBinary('/projects/paper/figure.png', Uint8Array.from([137, 80]))
    ).resolves.toEqual({ filePath: '/projects/paper/figure.png' })

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
    expect(invokeMock).toHaveBeenNthCalledWith(5, 'write_file_binary', Uint8Array.from([137, 80]), {
      headers: {
        'x-textex-file-path': 'L3Byb2plY3RzL3BhcGVyL2ZpZ3VyZS5wbmc'
      }
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
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ data: 'data:image/png;base64,iVBORw==', mimeType: 'image/png' })
      .mockResolvedValueOnce(new Uint8Array([37, 80, 68, 70]).buffer)
      .mockResolvedValueOnce(new Uint8Array([37, 80, 68, 70]).buffer)

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
    await expect(api.renamePath('/project/draft.tex', '/project/paper.tex')).resolves.toEqual({
      success: true
    })
    await expect(api.deletePath('/project/old.tex')).resolves.toEqual({ success: true })
    await expect(api.readFileBase64('/project/source.png')).resolves.toEqual({
      data: 'data:image/png;base64,iVBORw==',
      mimeType: 'image/png'
    })
    const binary = await api.readFileBinary('/project/main.pdf')
    expect(binary.mimeType).toBe('application/pdf')
    expect(binary.data).toBeInstanceOf(Uint8Array)
    expect([...binary.data]).toEqual([37, 80, 68, 70])
    const compiled = await api.readCompiledPdf('/cache/build/project/tectonic/main.pdf')
    expect(compiled.mimeType).toBe('application/pdf')
    expect([...compiled.data]).toEqual([37, 80, 68, 70])

    expect(invokeMock.mock.calls).toEqual([
      ['open_file'],
      ['save_file_as', { content: 'copy' }],
      ['create_file', { filePath: '/project/chapter.tex' }],
      ['create_directory', { dirPath: '/project/figures' }],
      ['copy_file', { source: '/project/source.png', dest: '/project/figures/copy.png' }],
      ['rename_path', { source: '/project/draft.tex', destination: '/project/paper.tex' }],
      ['delete_path', { path: '/project/old.tex' }],
      ['read_file_base64', { filePath: '/project/source.png' }],
      ['read_file_binary', { filePath: '/project/main.pdf' }],
      ['read_compiled_pdf', { filePath: '/cache/build/project/tectonic/main.pdf' }]
    ])
  })

  it('preserves MIME inference for platform byte-array fallbacks', async () => {
    invokeMock.mockResolvedValueOnce([137, 80, 78, 71])

    const api = createTauriApi()
    const binary = await api.readFileBinary('C:\\project\\FIGURE.PNG')

    expect([...binary.data]).toEqual([137, 80, 78, 71])
    expect(binary.mimeType).toBe('image/png')
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
      .mockResolvedValueOnce('/project')
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce(settings)
      .mockResolvedValueOnce(settings)
      .mockResolvedValueOnce(settings)
      .mockResolvedValueOnce(settings)
      .mockResolvedValueOnce(settings)

    const api = createTauriApi()
    await expect(api.activateProject('/project')).resolves.toBe('/project')
    await expect(api.getActiveProject()).resolves.toBe('/project')
    await expect(api.deactivateProject()).resolves.toEqual({ success: true })
    await expect(api.loadSettings()).resolves.toBe(settings)
    await expect(api.saveSettings({ theme: 'dark' })).resolves.toBe(settings)
    await expect(api.addRecentProject('/project')).resolves.toBe(settings)
    await expect(api.removeRecentProject('/project')).resolves.toBe(settings)
    await expect(api.updateRecentProject('/project', { pinned: true })).resolves.toBe(settings)

    expect(invokeMock.mock.calls).toEqual([
      ['activate_project', { projectPath: '/project' }],
      ['get_active_project'],
      ['deactivate_project'],
      ['load_settings'],
      ['save_settings', { partial: { theme: 'dark' } }],
      ['add_recent_project', { projectPath: '/project' }],
      ['remove_recent_project', { projectPath: '/project' }],
      ['update_recent_project', { projectPath: '/project', updates: { pinned: true } }]
    ])
  })

  it('maps application themes to the current Tauri window theme', async () => {
    setWindowThemeMock.mockResolvedValue(undefined)
    const api = createTauriApi()

    await api.setTheme('system')
    await api.setTheme('dark')
    await api.setTheme('light')
    await api.setTheme('high-contrast')
    await api.setTheme('glass')

    expect(setWindowThemeMock.mock.calls).toEqual([
      [null],
      ['dark'],
      ['light'],
      ['dark'],
      ['light']
    ])
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('fails window close requests closed until the renderer lifecycle approves them', async () => {
    closeWindowMock.mockResolvedValue(undefined)
    const api = createTauriApi()
    const guard = vi.fn().mockReturnValue(false)
    const preventDefault = vi.fn()

    api.onWindowCloseRequested(guard)
    await vi.waitFor(() => expect(closeRequestedHandlers).toHaveLength(1))
    await closeRequestedHandlers[0]({ preventDefault })

    expect(guard).toHaveBeenCalledOnce()
    expect(preventDefault).toHaveBeenCalledOnce()

    guard.mockReturnValue(true)
    preventDefault.mockClear()
    await closeRequestedHandlers[0]({ preventDefault })
    expect(preventDefault).not.toHaveBeenCalled()

    await api.requestWindowClose()
    expect(closeWindowMock).toHaveBeenCalledOnce()

    api.removeWindowCloseRequestedListener()
    await vi.waitFor(() => expect(closeWindowUnlistenMock).toHaveBeenCalledOnce())
  })

  it('maps frameless window chrome actions to the current Tauri window', async () => {
    minimizeWindowMock.mockResolvedValue(undefined)
    toggleMaximizeWindowMock.mockResolvedValue(undefined)
    startWindowDraggingMock.mockResolvedValue(undefined)
    startWindowResizeMock.mockResolvedValue(undefined)
    const api = createTauriApi()

    await api.minimizeWindow()
    await api.toggleMaximizeWindow()
    await api.startWindowDragging()
    await api.startWindowResize('SouthEast')

    expect(minimizeWindowMock).toHaveBeenCalledOnce()
    expect(toggleMaximizeWindowMock).toHaveBeenCalledOnce()
    expect(startWindowDraggingMock).toHaveBeenCalledOnce()
    expect(startWindowResizeMock).toHaveBeenCalledOnce()
    expect(startWindowResizeMock).toHaveBeenCalledWith('SouthEast')
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('maps an approved application exit to the typed Rust command', async () => {
    invokeMock.mockResolvedValueOnce({ success: true })
    const api = createTauriApi()

    await expect(api.exitApp()).resolves.toEqual({ success: true })
    expect(invokeMock).toHaveBeenCalledWith('exit_app')
  })

  it('maps project metadata operations to the scoped Rust commands', async () => {
    const compileRecord = {
      filePath: '/project/main.tex',
      lastCompiled: '2026-08-23T00:01:00Z',
      duration: 1,
      exitCode: 0,
      pdfPath: '/project/main.pdf',
      errorCount: 0,
      warningCount: 0,
      hash: 'abc'
    }
    const snippet = { prefix: 'fig', label: 'Figure', body: 'body', description: '' }
    const bookmark = { file: '/project/main.tex', line: 3, column: 1, label: 'Result' }
    invokeMock.mockResolvedValue(undefined)
    const api = createTauriApi()

    await api.projectInit('/project')
    await api.projectExists('/project')
    await api.projectLoad('/project')
    await api.projectSave('/project', { mainFile: 'main.tex' })
    await api.projectTouch('/project')
    await api.projectCompileLoad('/project')
    await api.projectCompileSave('/project', compileRecord)
    await api.projectCompileClear('/project')
    await api.projectCompileLogSave('/project', '/project/main.tex', 'ok')
    await api.projectCompileLogLoad('/project', '/project/main.tex')
    await api.projectSnippetsLoad('/project')
    await api.projectSnippetsAdd('/project', snippet)
    await api.projectSnippetsRemove('/project', 'snippet-1')
    await api.projectBookmarksLoad('/project')
    await api.projectBookmarksAdd('/project', bookmark)
    await api.projectBookmarksRemove('/project', 'bm-1')

    expect(invokeMock.mock.calls).toEqual([
      ['project_init', { projectRoot: '/project' }],
      ['project_exists', { projectRoot: '/project' }],
      ['project_load', { projectRoot: '/project' }],
      ['project_save', { projectRoot: '/project', partial: { mainFile: 'main.tex' } }],
      ['project_touch', { projectRoot: '/project' }],
      ['project_compile_load', { projectRoot: '/project' }],
      ['project_compile_save', { projectRoot: '/project', record: compileRecord }],
      ['project_compile_clear', { projectRoot: '/project' }],
      [
        'project_compile_log_save',
        { projectRoot: '/project', filePath: '/project/main.tex', log: 'ok' }
      ],
      ['project_compile_log_load', { projectRoot: '/project', filePath: '/project/main.tex' }],
      ['project_snippets_load', { projectRoot: '/project' }],
      ['project_snippets_add', { projectRoot: '/project', snippet }],
      ['project_snippets_remove', { projectRoot: '/project', id: 'snippet-1' }],
      ['project_bookmarks_load', { projectRoot: '/project' }],
      ['project_bookmarks_add', { projectRoot: '/project', bookmark }],
      ['project_bookmarks_remove', { projectRoot: '/project', id: 'bm-1' }]
    ])
  })

  it('streams revision-tagged compile logs and diagnostics through a Tauri channel', async () => {
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
    const diagnosticsListener = vi.fn()
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
      channel.onmessage({
        event: 'diagnostics',
        requestId: 4,
        documentId: '/project/main.tex',
        documentRevision: 9,
        diagnostics: [
          {
            file: '/project/main.tex',
            line: 7,
            column: 2,
            severity: 'error',
            message: 'Undefined control sequence'
          }
        ]
      })
      return response
    })

    const api = createTauriApi()
    api.onCompileLog(logListener)
    api.onDiagnostics(diagnosticsListener)

    await expect(api.compile(request)).resolves.toEqual(response)
    expect(logListener).toHaveBeenCalledWith({
      requestId: 4,
      documentId: '/project/main.tex',
      documentRevision: 9,
      text: 'Running TeX\n'
    })
    expect(diagnosticsListener).toHaveBeenCalledWith({
      requestId: 4,
      documentId: '/project/main.tex',
      documentRevision: 9,
      diagnostics: [
        {
          file: '/project/main.tex',
          line: 7,
          column: 2,
          severity: 'error',
          message: 'Undefined control sequence'
        }
      ]
    })
    expect(invokeMock).toHaveBeenCalledWith('compile_latex', {
      request,
      onEvent: expect.any(Object)
    })
  })

  it('maps Tectonic cache inspection and reset to pathless native commands', async () => {
    const status = {
      seed: {
        path: '/resources/tectonic-cache',
        fileCount: 0,
        totalBytes: 0,
        ready: false,
        integrity: 'empty',
        seedVersion: 'empty-v1',
        detail: 'empty'
      },
      cache: {
        path: '/cache/tectonic',
        fileCount: 0,
        totalBytes: 0,
        ready: false,
        integrity: 'empty',
        installedSeedVersion: null,
        detail: 'empty'
      },
      cacheUsable: false,
      networkFallback: true
    }
    invokeMock.mockResolvedValue(status)

    const api = createTauriApi()
    await expect(api.tectonicCacheStatus()).resolves.toEqual(status)
    await expect(api.tectonicCacheReset()).resolves.toEqual(status)

    expect(invokeMock.mock.calls).toEqual([['tectonic_cache_status'], ['tectonic_cache_reset']])
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

  it('rejects late events from a superseded watcher channel', async () => {
    invokeMock.mockResolvedValue({ success: true })
    const listener = vi.fn()
    const api = createTauriApi()
    api.onDirectoryChanged(listener)

    await api.watchDirectory('/project-a')
    const firstChannel = channelInstances.at(-1)
    await api.watchDirectory('/project-b')
    const secondChannel = channelInstances.at(-1)

    firstChannel?.onmessage({ type: 'rename', filename: 'stale.tex' })
    secondChannel?.onmessage({ type: 'rename', filename: 'current.tex' })

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith({ type: 'rename', filename: 'current.tex' })

    await api.deactivateProject()
    secondChannel?.onmessage({ type: 'rename', filename: 'after-close.tex' })
    expect(listener).toHaveBeenCalledOnce()
  })

  it('lazily requests the native flat project index', async () => {
    const snapshot = {
      root: '/project',
      generation: 1,
      entries: [
        {
          path: '/project/main.tex',
          relativePath: 'main.tex',
          parentRelativePath: '',
          name: 'main.tex',
          type: 'file',
          size: 12,
          modifiedMs: 123
        }
      ]
    }
    invokeMock.mockResolvedValueOnce(snapshot)

    const api = createTauriApi()
    await expect(api.getProjectIndex()).resolves.toEqual(snapshot)
    expect(invokeMock).toHaveBeenCalledWith('get_project_index')
  })

  it('maps Git operations to project-scoped Rust commands', async () => {
    const status = {
      branch: 'main',
      files: [{ path: 'main.tex', index: ' ', working_dir: 'M' }],
      staged: [],
      modified: ['main.tex'],
      not_added: []
    }
    const remoteStatus = {
      remote: 'origin',
      upstream: 'origin/main',
      ahead: 1,
      behind: 0
    }
    const log = [
      {
        hash: 'abc123',
        date: '2026-08-20T00:00:00Z',
        author: 'Ada',
        message: 'Update paper'
      }
    ]
    invokeMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce(status)
      .mockResolvedValueOnce(remoteStatus)
      .mockResolvedValueOnce(remoteStatus)
      .mockResolvedValueOnce(remoteStatus)
      .mockResolvedValueOnce(remoteStatus)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce('diff --git a/main.tex b/main.tex')
      .mockResolvedValueOnce(log)
      .mockResolvedValueOnce(log)

    const api = createTauriApi()
    await expect(api.gitIsRepo('/project')).resolves.toBe(true)
    await expect(api.gitInit('/project')).resolves.toEqual({ success: true })
    await expect(api.gitStatus('/project')).resolves.toEqual(status)
    await expect(api.gitRemoteStatus('/project')).resolves.toEqual(remoteStatus)
    await expect(api.gitFetch('/project')).resolves.toEqual(remoteStatus)
    await expect(api.gitPull('/project')).resolves.toEqual(remoteStatus)
    await expect(api.gitPush('/project')).resolves.toEqual(remoteStatus)
    await expect(api.gitStage('/project', 'main.tex')).resolves.toEqual({ success: true })
    await expect(api.gitUnstage('/project', 'main.tex')).resolves.toEqual({ success: true })
    await expect(api.gitCommit('/project', 'Update paper')).resolves.toEqual({ success: true })
    await expect(api.gitDiff('/project')).resolves.toContain('diff --git')
    await expect(api.gitLog('/project')).resolves.toEqual(log)
    await expect(api.gitFileLog('/project', '/project/main.tex')).resolves.toEqual(log)

    expect(invokeMock.mock.calls).toEqual([
      ['git_is_repo', { workDir: '/project' }],
      ['git_init', { workDir: '/project' }],
      ['git_status', { workDir: '/project' }],
      ['git_remote_status', { workDir: '/project' }],
      ['git_fetch', { workDir: '/project' }],
      ['git_pull', { workDir: '/project' }],
      ['git_push', { workDir: '/project' }],
      ['git_stage', { workDir: '/project', filePath: 'main.tex' }],
      ['git_unstage', { workDir: '/project', filePath: 'main.tex' }],
      ['git_commit', { workDir: '/project', message: 'Update paper' }],
      ['git_diff', { workDir: '/project' }],
      ['git_log', { workDir: '/project' }],
      ['git_file_log', { workDir: '/project', filePath: '/project/main.tex' }]
    ])
  })

  it('loads LaTeX package metadata from bundled Rust resources', async () => {
    const packageData = {
      amsmath: {
        macros: [{ name: 'dfrac', snippet: '{$1}{$2}' }],
        envs: [{ name: 'align', argSnippet: '' }],
        deps: ['amstext']
      }
    }
    invokeMock.mockResolvedValueOnce(packageData)

    const api = createTauriApi()
    await expect(api.loadPackageData(['amsmath'])).resolves.toEqual(packageData)
    expect(invokeMock).toHaveBeenCalledWith('load_package_data', {
      packageNames: ['amsmath']
    })
  })

  it('maps spellcheck operations to the worker-backed Rust dictionary', async () => {
    invokeMock
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce(['mispellled'])
      .mockResolvedValueOnce(['misspelled'])
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })

    const api = createTauriApi()

    await expect(api.spellInit('en-US')).resolves.toEqual({ success: true })
    await expect(api.spellCheck(['editor', 'mispellled'])).resolves.toEqual(['mispellled'])
    await expect(api.spellSuggest('mispellled')).resolves.toEqual(['misspelled'])
    await expect(api.spellAddWord('textexword')).resolves.toEqual({ success: true })
    await expect(api.spellSetLanguage('en-US')).resolves.toEqual({ success: true })

    expect(invokeMock.mock.calls).toEqual([
      ['spell_init', { language: 'en-US' }],
      ['spell_check', { words: ['editor', 'mispellled'] }],
      ['spell_suggest', { word: 'mispellled' }],
      ['spell_add_word', { word: 'textexword' }],
      ['spell_set_language', { language: 'en-US' }]
    ])
  })

  it('combines built-in templates with Rust custom templates and creates projects', async () => {
    const customTemplate = {
      id: 'custom-1',
      name: 'Lab report',
      description: 'Custom',
      content: 'content',
      builtIn: false
    }
    invokeMock
      .mockResolvedValueOnce({
        projectPath: '/projects/article',
        filePath: '/projects/article/main.tex'
      })
      .mockResolvedValueOnce([customTemplate])
      .mockResolvedValueOnce(customTemplate)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce(customTemplate)

    const api = createTauriApi()
    await expect(
      api.createTemplateProject('Article', 'content', { 'figures/data.txt': 'data' })
    ).resolves.toEqual({
      projectPath: '/projects/article',
      filePath: '/projects/article/main.tex'
    })
    const templates = await api.listTemplates()
    expect(templates.some((template) => template.id === 'article' && template.builtIn)).toBe(true)
    expect(templates.at(-1)).toEqual(customTemplate)
    await expect(api.addTemplate('Lab report', 'Custom', 'content')).resolves.toEqual(
      customTemplate
    )
    await expect(api.removeTemplate('custom-1')).resolves.toEqual({ success: true })
    await expect(api.importTemplateZip()).resolves.toEqual(customTemplate)

    expect(invokeMock.mock.calls).toEqual([
      [
        'create_template_project',
        {
          templateName: 'Article',
          content: 'content',
          files: { 'figures/data.txt': 'data' }
        }
      ],
      ['list_custom_templates'],
      ['add_custom_template', { name: 'Lab report', description: 'Custom', content: 'content' }],
      ['remove_custom_template', { id: 'custom-1' }],
      ['import_template_zip']
    ])
  })

  it('maps optional Pandoc export through the scoped Rust service', async () => {
    invokeMock
      .mockResolvedValueOnce([
        { name: 'HTML', ext: 'html' },
        { name: 'DOCX', ext: 'docx' }
      ])
      .mockResolvedValueOnce({ success: true, outputPath: '/project/paper.docx' })
      .mockResolvedValueOnce({ success: true, outputPath: '/exports/paper-overleaf.zip' })

    const api = createTauriApi()
    await expect(api.getExportFormats()).resolves.toEqual([
      { name: 'HTML', ext: 'html' },
      { name: 'DOCX', ext: 'docx' }
    ])
    await expect(api.exportDocument('/project/paper.tex', 'docx')).resolves.toEqual({
      success: true,
      outputPath: '/project/paper.docx'
    })
    await expect(api.exportOverleafZip()).resolves.toEqual({
      success: true,
      outputPath: '/exports/paper-overleaf.zip'
    })
    expect(invokeMock.mock.calls).toEqual([
      ['get_export_formats'],
      ['export_document', { inputPath: '/project/paper.tex', format: 'docx' }],
      ['export_overleaf_zip']
    ])
  })

  it('runs a structured submission check through the native adapter', async () => {
    invokeMock.mockResolvedValueOnce({
      rootFile: '/project/main.tex',
      scannedFiles: 1,
      findings: [],
      summary: { errors: 0, warnings: 0, info: 0 }
    })
    const api = createTauriApi()

    await api.runSubmissionCheck({ rootFile: '/project/main.tex' })

    expect(invokeMock).toHaveBeenCalledWith('run_submission_check', {
      request: { rootFile: '/project/main.tex' }
    })
  })

  it('maps citation groups, external URLs, and performance memory to Rust', async () => {
    const groups = [{ id: 'methods', name: 'Methods', citekeys: ['knuth1984'] }]
    const memory = {
      sampledAtEpochMs: 1,
      totalWorkingSetKiB: 2048,
      totalPrivateKiB: 2048,
      processes: [
        {
          pid: 42,
          type: 'Tauri',
          cpuPercent: 0,
          workingSetKiB: 2048,
          peakWorkingSetKiB: 2048,
          privateKiB: 2048,
          sharedKiB: 0
        }
      ]
    }
    invokeMock
      .mockResolvedValueOnce(groups)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce(memory)

    const api = createTauriApi()
    await expect(api.loadCitationGroups('/project')).resolves.toEqual(groups)
    await expect(api.saveCitationGroups('/project', groups)).resolves.toEqual({ success: true })
    await expect(api.openExternal('https://textex.app/docs')).resolves.toEqual({ success: true })
    await expect(api.getPerformanceMemory()).resolves.toEqual(memory)

    expect(invokeMock.mock.calls).toEqual([
      ['load_citation_groups', { projectRoot: '/project' }],
      ['save_citation_groups', { projectRoot: '/project', groups }],
      ['open_external', { url: 'https://textex.app/docs' }],
      ['get_performance_memory']
    ])
  })

  it('parses the fallback document outline locally without a native round trip', async () => {
    const api = createTauriApi()
    await expect(
      api.getDocumentOutline(
        '/project/main.tex',
        '\\begin{abstract}\nSummary\n\\end{abstract}\n\\section{Intro}\nText\n\\subsection{Method}'
      )
    ).resolves.toMatchObject([
      { title: 'Abstract', semanticKind: 'frontmatter', startLine: 1 },
      {
        title: 'Intro',
        semanticKind: 'section',
        startLine: 4,
        children: [{ title: 'Method', startLine: 6 }]
      }
    ])
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('maps SyncTeX navigation to the trusted Rust commands', async () => {
    invokeMock
      .mockResolvedValueOnce({ page: 2, x: 12.5, y: 48 })
      .mockResolvedValueOnce({ file: '/project/chapter.tex', line: 7, column: 0 })
      .mockResolvedValueOnce([{ line: 7, page: 2, y: 48 }])

    const api = createTauriApi()
    await expect(api.synctexForward('/project/chapter.tex', 7)).resolves.toEqual({
      page: 2,
      x: 12.5,
      y: 48
    })
    await expect(api.synctexInverse('/project/main.tex', 2, 12.5, 48)).resolves.toEqual({
      file: '/project/chapter.tex',
      line: 7,
      column: 0
    })
    await expect(api.synctexBuildLineMap('/project/chapter.tex')).resolves.toEqual([
      { line: 7, page: 2, y: 48 }
    ])

    expect(invokeMock.mock.calls).toEqual([
      ['synctex_forward', { texFile: '/project/chapter.tex', line: 7 }],
      ['synctex_inverse', { texFile: '/project/main.tex', page: 2, x: 12.5, y: 48 }],
      ['synctex_build_line_map', { texFile: '/project/chapter.tex' }]
    ])
  })

  it('loads bibliography entries and labels through the Rust reference index', async () => {
    const bibEntry = {
      key: 'smith2026',
      type: 'article',
      title: 'A Paper',
      author: 'A. Smith',
      year: '2026',
      file: '/project/references.bib',
      line: 1
    }
    const label = {
      label: 'sec:intro',
      file: '/project/main.tex',
      line: 4,
      context: '\\section{Intro}\\label{sec:intro}'
    }
    const citations = [{ citekey: 'smith2026', count: 2 }]
    invokeMock
      .mockResolvedValueOnce([bibEntry])
      .mockResolvedValueOnce([bibEntry])
      .mockResolvedValueOnce([label])
      .mockResolvedValueOnce(citations)

    const api = createTauriApi()
    await expect(api.parseBibFile('/project/references.bib')).resolves.toEqual([bibEntry])
    await expect(api.findBibInProject('/project')).resolves.toEqual([bibEntry])
    await expect(api.scanLabels('/project')).resolves.toEqual([label])
    await expect(api.scanCitations('/project')).resolves.toEqual(citations)
    expect(invokeMock.mock.calls).toEqual([
      ['parse_bib_file', { filePath: '/project/references.bib' }],
      ['find_bib_in_project', { projectRoot: '/project' }],
      ['scan_labels', { projectRoot: '/project' }],
      ['scan_citations', { projectRoot: '/project' }]
    ])
  })

  it('maps Zotero operations to the loopback-only Rust client', async () => {
    const result = {
      citekey: 'smith2026',
      title: 'A Paper',
      author: 'Smith, Ada',
      year: '2026',
      type: 'article'
    }
    invokeMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce([result])
      .mockResolvedValueOnce('\\cite{smith2026}')
      .mockResolvedValueOnce('@article{smith2026}')
      .mockResolvedValueOnce({
        filePath: '/project/references.bib',
        bytesWritten: 19,
        entryCount: 1
      })

    const api = createTauriApi()
    await expect(api.zoteroProbe(23119)).resolves.toBe(true)
    await expect(api.zoteroSearch('paper', 23119)).resolves.toEqual([result])
    await expect(api.zoteroCiteCAYW(23119)).resolves.toBe('\\cite{smith2026}')
    await expect(api.zoteroExportBibtex(['smith2026'], 23119)).resolves.toBe('@article{smith2026}')
    await expect(api.zoteroSyncCollection('/0/8CV58ZVD', undefined, 23119)).resolves.toEqual({
      filePath: '/project/references.bib',
      bytesWritten: 19,
      entryCount: 1
    })
    expect(invokeMock.mock.calls).toEqual([
      ['zotero_probe', { port: 23119 }],
      ['zotero_search', { term: 'paper', port: 23119 }],
      ['zotero_cite_cayw', { port: 23119 }],
      ['zotero_export_bibtex', { citekeys: ['smith2026'], port: 23119 }],
      ['zotero_sync_collection', { collection: '/0/8CV58ZVD', targetFile: undefined, port: 23119 }]
    ])
  })

  it('maps research collection and online reference operations to Rust', async () => {
    const collection = { key: '/0/ABC', name: 'Papers', parentKey: null, itemCount: 2 }
    const library = { key: '/0', name: 'My Library', itemCount: 20, collections: [collection] }
    const collectionPage = { items: [], totalResults: 2, offset: 0, limit: 50 }
    const reference = {
      source: 'crossref' as const,
      id: '10.1000/example',
      title: 'A Paper',
      authors: ['Ada Smith'],
      year: '2026',
      type: 'journal-article',
      doi: '10.1000/example'
    }
    const added = {
      filePath: '/project/references.bib',
      citekey: 'Smith2026Paper',
      inserted: true,
      duplicate: false
    }
    const saved = { itemKey: 'ABC12345', citekey: 'Smith2026Paper', duplicate: false }
    const config = {
      version: 1 as const,
      referencesFile: 'references.bib',
      zoteroFile: 'zotero.bib',
      zoteroCollection: '/0/ABC',
      syncOnOpen: true
    }
    const profile = {
      version: 1 as const,
      paper: {
        title: 'Diffusion Policy',
        authors: [{ id: 'cheng-chi', name: 'Cheng Chi' }]
      },
      resources: [
        {
          id: 'official-code',
          kind: 'git' as const,
          label: 'Official code',
          url: 'https://github.com/example/project',
          chatAccess: 'indexed-read' as const
        }
      ],
      instructions: ['Prefer the official implementation.']
    }
    const snapshot = {
      resourceId: 'project-site',
      url: 'https://example.org/paper',
      fetchedAt: 1_725_000_000_000,
      content: 'Paper and code',
      truncated: false
    }
    const chatSession = {
      version: 1 as const,
      messages: [{ role: 'user' as const, content: 'Compare the methods.' }],
      selectedContexts: [{ id: 'paper', kind: 'paper' as const, label: 'Paper' }]
    }
    const chatScope = {
      projectRoot: '/projects/paper',
      projectEpoch: '7',
      revision: '3'
    }
    const chatSnapshot = { ...chatScope, session: chatSession }
    const nextChatSnapshot = {
      ...chatSnapshot,
      revision: '4'
    }
    const nextChatScope = { ...chatScope, revision: '4' }
    invokeMock
      .mockResolvedValueOnce([collection])
      .mockResolvedValueOnce([library])
      .mockResolvedValueOnce(collectionPage)
      .mockResolvedValueOnce(added)
      .mockResolvedValueOnce(saved)
      .mockResolvedValueOnce([reference])
      .mockResolvedValueOnce(added)
      .mockResolvedValueOnce(config)
      .mockResolvedValueOnce(config)
      .mockResolvedValueOnce(profile)
      .mockResolvedValueOnce(profile)
      .mockResolvedValueOnce(chatSnapshot)
      .mockResolvedValueOnce(nextChatSnapshot)
      .mockResolvedValueOnce({
        ...nextChatSnapshot,
        revision: '5',
        session: { ...chatSession, messages: [] }
      })
      .mockResolvedValueOnce(snapshot)

    const api = createTauriApi()
    await expect(api.zoteroCollections(23119)).resolves.toEqual([collection])
    await expect(api.zoteroLibraryTree(23119)).resolves.toEqual([library])
    await expect(api.zoteroCollectionItems('/0/ABC', 0, 50, 23119)).resolves.toEqual(collectionPage)
    await expect(api.zoteroAddToProject('Smith2026Paper', 23119)).resolves.toEqual(added)
    await expect(api.zoteroSaveOnline(reference, 23119)).resolves.toEqual(saved)
    await expect(api.researchSearchOnline('paper')).resolves.toEqual([reference])
    await expect(api.researchAddOnline(reference)).resolves.toEqual(added)
    await expect(api.researchLoadConfig()).resolves.toEqual(config)
    await expect(api.researchSaveConfig(config)).resolves.toEqual(config)
    await expect(api.researchProfileLoad()).resolves.toEqual(profile)
    await expect(api.researchProfileSave(profile)).resolves.toEqual(profile)
    await expect(api.researchChatSessionLoad()).resolves.toEqual(chatSnapshot)
    await expect(api.researchChatSessionSave(chatScope, chatSession)).resolves.toEqual(
      nextChatSnapshot
    )
    await expect(api.researchChatSessionClear(nextChatScope)).resolves.toEqual({
      ...nextChatSnapshot,
      revision: '5',
      session: { ...chatSession, messages: [] }
    })
    await expect(api.researchResourceSnapshot('project-site')).resolves.toEqual(snapshot)
    expect(invokeMock.mock.calls).toEqual([
      ['zotero_collections', { port: 23119 }],
      ['zotero_library_tree', { port: 23119 }],
      ['zotero_collection_items', { collection: '/0/ABC', offset: 0, limit: 50, port: 23119 }],
      ['zotero_add_to_project', { citekey: 'Smith2026Paper', port: 23119 }],
      ['zotero_save_online', { reference, port: 23119 }],
      ['research_search_online', { query: 'paper' }],
      ['research_add_online', { reference }],
      ['research_load_config'],
      ['research_save_config', { config }],
      ['research_profile_load'],
      ['research_profile_save', { profile }],
      ['research_chat_session_load'],
      ['research_chat_session_save', { scope: chatScope, session: chatSession }],
      ['research_chat_session_clear', { scope: nextChatScope }],
      ['research_resource_snapshot', { resourceId: 'project-site' }]
    ])
  })

  it('maps history snapshots to project-scoped Rust commands', async () => {
    const item = { timestamp: 123, size: 42, path: '/project/.textex/history/main.tex/123.gz' }
    invokeMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce('old')

    const api = createTauriApi()
    await expect(api.saveHistorySnapshot('/project/main.tex', 'current')).resolves.toBeUndefined()
    await expect(api.getHistoryList('/project/main.tex')).resolves.toEqual([item])
    await expect(api.loadHistorySnapshot('/project/main.tex', item.path)).resolves.toBe('old')
    expect(invokeMock.mock.calls).toEqual([
      ['save_history_snapshot', { filePath: '/project/main.tex', content: 'current' }],
      ['get_history_list', { filePath: '/project/main.tex' }],
      ['load_history_snapshot', { filePath: '/project/main.tex', snapshotPath: item.path }]
    ])
  })

  it('maps crash recovery snapshots to the app-local native store', async () => {
    const item = {
      id: 'a'.repeat(64),
      filePath: '/project/main.tex',
      capturedAtEpochMs: 123,
      size: 5,
      diskState: 'modified' as const
    }
    const snapshot = { item, content: 'draft', diskContent: 'disk' }
    invokeMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)

    const api = createTauriApi()
    await api.saveRecoverySnapshot(item.filePath, snapshot.content)
    await expect(api.listRecoverySnapshots()).resolves.toEqual([item])
    await expect(api.loadRecoverySnapshot(item.id)).resolves.toEqual(snapshot)
    await api.discardRecoverySnapshot(item.id)
    await api.clearRecoverySnapshot(item.filePath)

    expect(invokeMock.mock.calls).toEqual([
      ['save_recovery_snapshot', { filePath: item.filePath, content: snapshot.content }],
      ['list_recovery_snapshots'],
      ['load_recovery_snapshot', { id: item.id }],
      ['discard_recovery_snapshot', { id: item.id }],
      ['clear_recovery_snapshot', { filePath: item.filePath }]
    ])
  })

  it('maps bounded research source indexing and search commands', async () => {
    const index = {
      resourceId: 'official-code',
      rootPath: '/project/sources/code',
      branch: 'main',
      indexedAt: 123,
      files: [{ path: 'src/main.rs', bytes: 42, language: 'rust' }],
      fileCount: 1,
      totalBytes: 42,
      truncated: false
    }
    const result = {
      resourceId: 'official-code',
      path: 'src/main.rs',
      line: 5,
      startLine: 3,
      snippet: 'fn train() {}',
      score: 110
    }
    const cloned = {
      success: true,
      resourceId: 'official-code',
      localPath: '/project/sources/code',
      action: 'cloned' as const,
      output: 'Cloning into sources/code'
    }
    const fetched = { ...cloned, action: 'fetched' as const, output: 'Already up to date.' }
    invokeMock
      .mockResolvedValueOnce(index)
      .mockResolvedValueOnce([result])
      .mockResolvedValueOnce(cloned)
      .mockResolvedValueOnce(fetched)

    const api = createTauriApi()
    await expect(api.researchSourceIndex('official-code', 'sources/code')).resolves.toEqual(index)
    await expect(api.researchSourceSearch('official-code', 'train', 4)).resolves.toEqual([result])
    await expect(api.researchSourceClone('official-code')).resolves.toEqual(cloned)
    await expect(api.researchSourceFetch('official-code')).resolves.toEqual(fetched)
    expect(invokeMock.mock.calls).toEqual([
      ['research_source_index', { resourceId: 'official-code', localPath: 'sources/code' }],
      ['research_source_search', { resourceId: 'official-code', query: 'train', limit: 4 }],
      ['research_source_clone', { resourceId: 'official-code' }],
      ['research_source_fetch', { resourceId: 'official-code' }]
    ])
  })

  it('maps updater metadata and bridges Channel progress through a typed callback', async () => {
    invokeMock
      .mockResolvedValueOnce({
        currentVersion: '1.0.8',
        version: '1.0.9',
        date: '2026-08-20T12:00:00Z',
        body: 'Faster editing'
      })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
    const progress = vi.fn()
    const api = createTauriApi()

    await expect(api.updateCheck()).resolves.toEqual({
      success: true,
      update: {
        currentVersion: '1.0.8',
        version: '1.0.9',
        date: '2026-08-20T12:00:00Z',
        body: 'Faster editing'
      }
    })

    const download = api.updateDownload(progress)
    const updateChannel = channelInstances.at(-1)
    updateChannel?.onmessage({ event: 'started', contentLength: 1000 })
    updateChannel?.onmessage({
      event: 'progress',
      chunkLength: 250,
      downloaded: 250,
      contentLength: 1000
    })
    updateChannel?.onmessage({ event: 'finished' })
    await expect(download).resolves.toEqual({ success: true })
    expect(progress.mock.calls).toEqual([
      [{ downloaded: 0, contentLength: 1000, percent: 0 }],
      [{ downloaded: 250, contentLength: 1000, percent: 25 }],
      [{ downloaded: 250, contentLength: 1000, percent: 100 }]
    ])

    await expect(api.updateInstall()).resolves.toEqual({ success: true })
    expect(invokeMock.mock.calls).toEqual([
      ['check_app_update'],
      ['download_and_install_update', { onEvent: updateChannel }],
      ['restart_app']
    ])
  })

  it('returns updater errors without throwing and reports download failures', async () => {
    invokeMock.mockRejectedValueOnce('missing signing key').mockRejectedValueOnce('network failed')
    const api = createTauriApi()

    await expect(api.updateCheck()).resolves.toEqual({
      success: false,
      error: 'missing signing key'
    })
    await expect(api.updateDownload()).resolves.toEqual({
      success: false,
      error: 'network failed'
    })
  })

  it('keeps mandatory listeners and LSP cleanup safe while their backends are pending', async () => {
    const api = createTauriApi()
    const disposeData = api.onPtyData('pty-1', () => {})
    const disposeExit = api.onPtyExit('pty-1', () => {})

    expect(() => api.onCompileLog(() => {})).not.toThrow()
    expect(() => api.onDiagnostics(() => {})).not.toThrow()
    expect(() => api.onAppCommand(() => {})).not.toThrow()
    api.removeAppCommandListener()
    expect(() => disposeData()).not.toThrow()
    expect(() => disposeExit()).not.toThrow()
    invokeMock.mockResolvedValueOnce({ success: true })
    await expect(api.lspStop()).resolves.toEqual({ success: true })
  })

  it('forwards validated native menu events and disposes the listener', async () => {
    const command = vi.fn()
    const api = createTauriApi()

    api.onAppCommand(command)
    await vi.waitFor(() => expect(eventCallbacks.has('app-command')).toBe(true))
    eventCallbacks.get('app-command')?.({ payload: 'file.open' })
    eventCallbacks.get('app-command')?.({ payload: 'window.close' })

    expect(command.mock.calls).toEqual([['file.open'], ['window.close']])

    api.removeAppCommandListener()
    await vi.waitFor(() => expect(unlistenMock).toHaveBeenCalledOnce())
    eventCallbacks.get('app-command')?.({ payload: 'file.save' })
    expect(command).toHaveBeenCalledTimes(2)
  })

  it('maps TexLab lifecycle, JSON-RPC, and channel events', async () => {
    invokeMock
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ status: 'running' })
      .mockResolvedValueOnce({ success: true })
    const message = vi.fn()
    const status = vi.fn()
    const api = createTauriApi()
    api.onLspMessage(message)
    api.onLspStatus(status)

    await expect(api.lspStart('/project')).resolves.toEqual({ success: true })
    const lspChannel = channelInstances.at(-1)
    lspChannel?.onmessage({
      event: 'message',
      message: { jsonrpc: '2.0', id: 1, result: null }
    })
    lspChannel?.onmessage({ event: 'status', status: 'running' })
    expect(message).toHaveBeenCalledWith({ jsonrpc: '2.0', id: 1, result: null })
    expect(status).toHaveBeenCalledWith('running', undefined)

    const payload = { jsonrpc: '2.0', method: 'initialized', params: {} }
    await expect(api.lspSend(payload)).resolves.toEqual({ success: true })
    await expect(api.lspStatus()).resolves.toEqual({ status: 'running' })
    await expect(api.lspStop()).resolves.toEqual({ success: true })
    lspChannel?.onmessage({
      event: 'message',
      message: { jsonrpc: '2.0', id: 2, result: 'late' }
    })
    lspChannel?.onmessage({ event: 'status', status: 'error', error: 'late' })
    expect(message).toHaveBeenCalledOnce()
    expect(status).toHaveBeenCalledOnce()
    api.removeLspMessageListener()
    api.removeLspStatusListener()

    expect(invokeMock.mock.calls).toEqual([
      ['lsp_start', { workspaceRoot: '/project', onEvent: lspChannel }],
      ['lsp_send', { message: payload }],
      ['lsp_status'],
      ['lsp_stop']
    ])
  })

  it('maps PTY commands and buffers channel events until listeners attach', async () => {
    invokeMock
      .mockResolvedValueOnce({ id: 'pty-1' })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
    const api = createTauriApi()

    await expect(api.ptyCreate({ cwd: '/project', cols: 80, rows: 24 })).resolves.toEqual({
      id: 'pty-1'
    })
    const ptyChannel = channelInstances.at(-1)
    ptyChannel?.onmessage({ event: 'data', id: 'pty-1', data: 'ready' })
    ptyChannel?.onmessage({ event: 'overflow', id: 'pty-1', droppedBytes: 8192 })
    ptyChannel?.onmessage({ event: 'exit', id: 'pty-1', exitCode: 0, signal: null })

    const data = vi.fn()
    const exit = vi.fn()
    const disposeData = api.onPtyData('pty-1', data)
    const disposeExit = api.onPtyExit('pty-1', exit)
    expect(data).toHaveBeenCalledWith('ready\r\n[TextEx terminal output truncated]\r\n')
    expect(exit).toHaveBeenCalledWith(0, null)

    await expect(api.ptyWrite('pty-1', 'pwd\r')).resolves.toEqual({ success: true })
    await expect(api.ptyResize('pty-1', 90.8, 30.2)).resolves.toEqual({ success: true })
    await expect(api.ptyDispose('pty-1')).resolves.toEqual({ success: true })
    disposeData()
    disposeExit()

    const lateData = vi.fn()
    const disposeLateData = api.onPtyData('pty-1', lateData)
    ptyChannel?.onmessage({ event: 'data', id: 'pty-1', data: 'late' })
    expect(lateData).not.toHaveBeenCalled()
    disposeLateData()

    expect(invokeMock.mock.calls).toEqual([
      [
        'pty_create',
        {
          options: { cwd: '/project', cols: 80, rows: 24 },
          onEvent: ptyChannel
        }
      ],
      ['pty_write', { id: 'pty-1', data: 'pwd\r' }],
      ['pty_resize', { id: 'pty-1', cols: 90, rows: 30 }],
      ['pty_dispose', { id: 'pty-1' }]
    ])
  })

  it('replaces a pre-existing bridge with the Tauri adapter', async () => {
    const existingApi = window.api
    isTauriMock.mockReturnValue(true)

    await installDesktopApi()

    expect(window.api).not.toBe(existingApi)
    expect(window.api.openDirectory).toBeTypeOf('function')
    expect(document.documentElement.dataset.desktopRuntime).toBe('tauri')
    expect(getDesktopCapabilities().runtime).toBe('tauri')
    expect(isTauriMock).toHaveBeenCalledOnce()
  })

  it('installs the adapter only inside the Tauri runtime', async () => {
    window.api = undefined as unknown as Window['api']
    isTauriMock.mockReturnValue(true)

    await installDesktopApi()

    expect(window.api.openDirectory).toBeTypeOf('function')
    expect(document.documentElement.dataset.desktopRuntime).toBe('tauri')
    expect(getDesktopCapabilities().runtime).toBe('tauri')
    expect(isTauriMock).toHaveBeenCalledOnce()
  })

  it('rejects startup outside Tauri even when a pre-existing bridge exists', async () => {
    const existingApi = window.api
    isTauriMock.mockReturnValue(false)

    await expect(installDesktopApi()).rejects.toThrow('TextEx requires the Tauri desktop runtime')
    expect(window.api).toBe(existingApi)
    expect(document.documentElement.dataset.desktopRuntime).toBeUndefined()
  })
})
