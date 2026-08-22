import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTauriApi } from '../../renderer/platform/tauriApi'
import { installDesktopApi } from '../../renderer/platform/desktopApi'

const invokeMock = vi.hoisted(() => vi.fn())
const isTauriMock = vi.hoisted(() => vi.fn())
const channelInstances = vi.hoisted(() => [] as Array<{ onmessage: (message: unknown) => void }>)

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

const originalApi = window.api

describe('Tauri DesktopApi adapter', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    isTauriMock.mockReset()
    channelInstances.length = 0
    const api = createTauriApi()
    api.removeCompileLogListener()
    api.removeDiagnosticsListener()
    api.removeDirectoryChangedListener()
    api.removeUpdateListeners()
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
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ data: 'data:image/png;base64,iVBORw==', mimeType: 'image/png' })
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

    expect(invokeMock.mock.calls).toEqual([
      ['open_file'],
      ['save_file_as', { content: 'copy' }],
      ['create_file', { filePath: '/project/chapter.tex' }],
      ['create_directory', { dirPath: '/project/figures' }],
      ['copy_file', { source: '/project/source.png', dest: '/project/figures/copy.png' }],
      ['rename_path', { source: '/project/draft.tex', destination: '/project/paper.tex' }],
      ['delete_path', { path: '/project/old.tex' }],
      ['read_file_base64', { filePath: '/project/source.png' }],
      ['read_file_binary', { filePath: '/project/main.pdf' }]
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
    await expect(api.getProjectIndex?.()).resolves.toEqual(snapshot)
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
    invokeMock
      .mockResolvedValueOnce([bibEntry])
      .mockResolvedValueOnce([bibEntry])
      .mockResolvedValueOnce([label])

    const api = createTauriApi()
    await expect(api.parseBibFile('/project/references.bib')).resolves.toEqual([bibEntry])
    await expect(api.findBibInProject('/project')).resolves.toEqual([bibEntry])
    await expect(api.scanLabels('/project')).resolves.toEqual([label])
    expect(invokeMock.mock.calls).toEqual([
      ['parse_bib_file', { filePath: '/project/references.bib' }],
      ['find_bib_in_project', { projectRoot: '/project' }],
      ['scan_labels', { projectRoot: '/project' }]
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

    const api = createTauriApi()
    await expect(api.zoteroProbe(23119)).resolves.toBe(true)
    await expect(api.zoteroSearch('paper', 23119)).resolves.toEqual([result])
    await expect(api.zoteroCiteCAYW(23119)).resolves.toBe('\\cite{smith2026}')
    await expect(api.zoteroExportBibtex(['smith2026'], 23119)).resolves.toBe('@article{smith2026}')
    expect(invokeMock.mock.calls).toEqual([
      ['zotero_probe', { port: 23119 }],
      ['zotero_search', { term: 'paper', port: 23119 }],
      ['zotero_cite_cayw', { port: 23119 }],
      ['zotero_export_bibtex', { citekeys: ['smith2026'], port: 23119 }]
    ])
  })

  it('maps the Rust-owned updater and bridges Channel progress to existing events', async () => {
    invokeMock
      .mockResolvedValueOnce({
        currentVersion: '1.0.8',
        version: '1.0.9',
        date: '2026-08-20T12:00:00Z',
        body: 'Faster editing'
      })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
    const available = vi.fn()
    const progress = vi.fn()
    const downloaded = vi.fn()
    const api = createTauriApi()
    api.onUpdateEvent('available', available)
    api.onUpdateEvent('download-progress', progress)
    api.onUpdateEvent('downloaded', downloaded)

    await expect(api.updateCheck()).resolves.toEqual({ success: true })
    expect(available).toHaveBeenCalledWith('1.0.9')

    await expect(api.updateDownload()).resolves.toEqual({ success: true })
    const updateChannel = channelInstances.at(-1)
    updateChannel?.onmessage({ event: 'started', contentLength: 1000 })
    updateChannel?.onmessage({
      event: 'progress',
      chunkLength: 250,
      downloaded: 250,
      contentLength: 1000
    })
    updateChannel?.onmessage({ event: 'finished' })
    expect(progress.mock.calls).toEqual([[0], [25]])
    expect(downloaded).toHaveBeenCalledOnce()

    await expect(api.updateInstall()).resolves.toEqual({ success: true })
    expect(invokeMock.mock.calls).toEqual([
      ['check_app_update'],
      ['download_and_install_update', { onEvent: updateChannel }],
      ['restart_app']
    ])
  })

  it('returns updater errors without throwing and reports download failures', async () => {
    invokeMock.mockRejectedValueOnce('missing signing key').mockRejectedValueOnce('network failed')
    const error = vi.fn()
    const api = createTauriApi()
    api.onUpdateEvent('error', error)

    await expect(api.updateCheck()).resolves.toEqual({
      success: false,
      error: 'missing signing key'
    })
    expect(error).not.toHaveBeenCalled()
    await expect(api.updateDownload()).resolves.toEqual({
      success: false,
      error: 'network failed'
    })
    expect(error).toHaveBeenCalledWith('network failed')
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

    await expect(api.ptyCreate({ cwd: '/project' })).rejects.toThrow(
      'Desktop API method "ptyCreate" has not been migrated'
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
