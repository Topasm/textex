import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deactivateProject,
  isCurrentProjectTransitionSnapshot,
  openProject
} from '../../renderer/utils/openProject'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useNotificationStore } from '../../renderer/store/useNotificationStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'
import {
  clearResearchProfileDraft,
  hasUnsavedResearchProfileDraft,
  setResearchProfileDraftDirty
} from '../../renderer/services/researchProfileDraft'
import type { DirectoryEntry, ResearchConfig } from '../../shared/types'

const projectRoot = '/workspace/project'
const tree: DirectoryEntry[] = [
  { name: 'main.tex', path: `${projectRoot}/main.tex`, type: 'file' },
  { name: 'notes.txt', path: `${projectRoot}/notes.txt`, type: 'file' }
]
const defaultResearchConfig: ResearchConfig = {
  version: 1,
  referencesFile: 'references.bib',
  zoteroFile: 'zotero.bib',
  zoteroCollection: null,
  syncOnOpen: false,
  autoSync: false
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

describe('openProject', () => {
  beforeEach(() => {
    clearResearchProfileDraft()
    vi.clearAllMocks()
    useEditorStore.getState().resetEditor()
    useProjectStore.setState({
      projectRoot: null,
      directoryTree: null,
      isSidebarOpen: false,
      sidebarView: 'files',
      sidebarWidth: useProjectStore.getState().sidebarWidth,
      bibEntries: [],
      citationGroups: [],
      auxCitationMap: null,
      labels: [],
      packageData: {},
      detectedPackages: [],
      isGitRepo: false,
      gitBranch: '',
      gitStatus: null
    })

    vi.mocked(window.api.readDirectory).mockResolvedValue(tree)
    vi.mocked(window.api.activateProject).mockImplementation(async (path) => path)
    vi.mocked(window.api.getActiveProject).mockResolvedValue(null)
    vi.mocked(window.api.readFile).mockResolvedValue({
      filePath: `${projectRoot}/main.tex`,
      content: '\\section{Intro}'
    })
    vi.mocked(window.api.watchDirectory).mockResolvedValue({ success: true })
    vi.mocked(window.api.unwatchDirectory).mockResolvedValue({ success: true })
    vi.mocked(window.api.deactivateProject).mockResolvedValue({ success: true })
    vi.mocked(window.api.gitIsRepo).mockResolvedValue(false)
    vi.mocked(window.api.findBibInProject).mockResolvedValue([])
    vi.mocked(window.api.scanLabels).mockResolvedValue([])
    vi.mocked(window.api.addRecentProject).mockResolvedValue(useSettingsStore.getState().settings)
    vi.mocked(window.api.researchLoadConfig).mockResolvedValue(defaultResearchConfig)
    vi.mocked(window.api.zoteroSyncCollection).mockResolvedValue({
      filePath: `${projectRoot}/zotero.bib`,
      bytesWritten: 10,
      entryCount: 1
    })
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, zoteroPort: 23_119 }
    }))
  })

  afterEach(() => {
    clearResearchProfileDraft()
    vi.restoreAllMocks()
  })

  it('cancels a project switch with dirty tabs before native activation', async () => {
    const oldRoot = '/workspace/current'
    const dirtyFile = `${oldRoot}/draft.tex`
    useProjectStore.getState().setProjectRoot(oldRoot)
    useEditorStore.getState().openFileInTab(dirtyFile, 'saved')
    useEditorStore.getState().updateActiveDocument('unsaved', 'editor')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

    await expect(openProject('/workspace/replacement')).resolves.toBeNull()

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('1 open document has'))
    expect(window.api.activateProject).not.toHaveBeenCalled()
    expect(window.api.deactivateProject).not.toHaveBeenCalled()
    expect(useProjectStore.getState().projectRoot).toBe(oldRoot)
    expect(useEditorStore.getState().openFiles[dirtyFile]?.isDirty).toBe(true)
  })

  it('cancels project close with dirty tabs before native deactivation', async () => {
    const dirtyFile = `${projectRoot}/draft.tex`
    useProjectStore.getState().setProjectRoot(projectRoot)
    useEditorStore.getState().openFileInTab(dirtyFile, 'saved')
    useEditorStore.getState().updateActiveDocument('unsaved', 'editor')
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    await expect(deactivateProject()).resolves.toBe(false)

    expect(window.api.deactivateProject).not.toHaveBeenCalled()
    expect(useProjectStore.getState().projectRoot).toBe(projectRoot)
    expect(useEditorStore.getState().openFiles[dirtyFile]?.isDirty).toBe(true)
  })

  it('cancels a project switch with an unsaved research profile', async () => {
    useProjectStore.getState().setProjectRoot('/workspace/current')
    setResearchProfileDraftDirty(true)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

    await expect(openProject('/workspace/replacement')).resolves.toBeNull()

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('research profile'))
    expect(window.api.activateProject).not.toHaveBeenCalled()
    expect(useProjectStore.getState().projectRoot).toBe('/workspace/current')
    expect(hasUnsavedResearchProfileDraft()).toBe(true)
  })

  it('clears dirty tabs only after an accepted close is deactivated natively', async () => {
    const dirtyFile = `${projectRoot}/draft.tex`
    useProjectStore.getState().setProjectRoot(projectRoot)
    useEditorStore.getState().openFileInTab(dirtyFile, 'saved')
    useEditorStore.getState().updateActiveDocument('unsaved', 'editor')
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    await expect(deactivateProject()).resolves.toBe(true)

    expect(window.api.deactivateProject).toHaveBeenCalledOnce()
    expect(window.api.removeDirectoryChangedListener).toHaveBeenCalledOnce()
    expect(useProjectStore.getState().projectRoot).toBeNull()
    expect(useEditorStore.getState().openFiles).toEqual({})
  })

  it('clears stale renderer state when native deactivation fails after closing authority', async () => {
    const oldFile = `${projectRoot}/paper.tex`
    useProjectStore.getState().setProjectRoot(projectRoot)
    useEditorStore.getState().openFileInTab(oldFile, 'saved')
    vi.mocked(window.api.deactivateProject).mockRejectedValueOnce(
      new Error('watcher cleanup failed')
    )
    vi.mocked(window.api.getActiveProject).mockResolvedValueOnce(null)

    await expect(deactivateProject()).rejects.toThrow('watcher cleanup failed')

    expect(window.api.getActiveProject).toHaveBeenCalledOnce()
    expect(window.api.removeDirectoryChangedListener).toHaveBeenCalledOnce()
    expect(useProjectStore.getState().projectRoot).toBeNull()
    expect(useEditorStore.getState().openFiles).toEqual({})
  })

  it('preserves renderer state when native deactivation fails before closing authority', async () => {
    const oldFile = `${projectRoot}/paper.tex`
    useProjectStore.getState().setProjectRoot(projectRoot)
    useEditorStore.getState().openFileInTab(oldFile, 'saved')
    vi.mocked(window.api.deactivateProject).mockRejectedValueOnce(new Error('state unavailable'))
    vi.mocked(window.api.getActiveProject).mockResolvedValueOnce(projectRoot)

    await expect(deactivateProject()).rejects.toThrow('state unavailable')

    expect(window.api.getActiveProject).toHaveBeenCalledOnce()
    expect(window.api.removeDirectoryChangedListener).not.toHaveBeenCalled()
    expect(useProjectStore.getState().projectRoot).toBe(projectRoot)
    expect(useEditorStore.getState().openFiles).toHaveProperty(oldFile)
  })

  it('does not let stale deactivation reconciliation clear a newer project', async () => {
    const replacementRoot = '/workspace/replacement'
    const nativeAuthority = deferred<string | null>()
    useProjectStore.getState().setProjectRoot(projectRoot)
    vi.mocked(window.api.deactivateProject).mockRejectedValueOnce(new Error('cleanup failed'))
    vi.mocked(window.api.getActiveProject).mockReturnValueOnce(nativeAuthority.promise)
    vi.mocked(window.api.readDirectory).mockResolvedValue([])

    const failedClose = deactivateProject()
    await vi.waitFor(() => expect(window.api.getActiveProject).toHaveBeenCalledOnce())

    await openProject(replacementRoot, { autoOpenFirstTex: false })
    nativeAuthority.resolve(null)
    await expect(failedClose).rejects.toThrow('cleanup failed')

    expect(useProjectStore.getState().projectRoot).toBe(replacementRoot)
    expect(window.api.watchDirectory).toHaveBeenCalledWith(replacementRoot)
  })

  it('clears stale renderer state when native activation failure closed the old project', async () => {
    const oldRoot = '/workspace/current'
    const oldFile = `${oldRoot}/paper.tex`
    useProjectStore.getState().setProjectRoot(oldRoot)
    useEditorStore.getState().openFileInTab(oldFile, 'saved')
    vi.mocked(window.api.activateProject).mockRejectedValueOnce(new Error('cleanup failed'))
    vi.mocked(window.api.getActiveProject).mockResolvedValueOnce(null)

    await expect(openProject('/workspace/replacement')).rejects.toThrow('cleanup failed')

    expect(window.api.getActiveProject).toHaveBeenCalledOnce()
    expect(useProjectStore.getState().projectRoot).toBeNull()
    expect(useEditorStore.getState().openFiles).toEqual({})
  })

  it('preserves renderer state when activation is rejected before native deactivation', async () => {
    const oldRoot = '/workspace/current'
    const oldFile = `${oldRoot}/paper.tex`
    useProjectStore.getState().setProjectRoot(oldRoot)
    useEditorStore.getState().openFileInTab(oldFile, 'saved')
    vi.mocked(window.api.activateProject).mockRejectedValueOnce(new Error('not authorized'))
    vi.mocked(window.api.getActiveProject).mockResolvedValueOnce(oldRoot)

    await expect(openProject('/workspace/replacement')).rejects.toThrow('not authorized')

    expect(useProjectStore.getState().projectRoot).toBe(oldRoot)
    expect(useEditorStore.getState().openFiles).toHaveProperty(oldFile)
  })

  it('keeps the active generation valid while a failed replacement preserves authority', async () => {
    const oldRoot = '/workspace/current'
    const replacementRoot = '/workspace/replacement'
    vi.mocked(window.api.readDirectory).mockResolvedValue([])
    const oldSnapshot = await openProject(oldRoot, {
      autoOpenFirstTex: false,
      deferProjectEnrichment: true
    })
    expect(oldSnapshot).not.toBeNull()

    const replacementActivation = deferred<string>()
    vi.mocked(window.api.activateProject).mockReturnValueOnce(replacementActivation.promise)
    vi.mocked(window.api.getActiveProject).mockResolvedValueOnce(oldRoot)

    const replacement = openProject(replacementRoot, { autoOpenFirstTex: false })
    await vi.waitFor(() => expect(window.api.activateProject).toHaveBeenCalledWith(replacementRoot))
    expect(isCurrentProjectTransitionSnapshot(oldSnapshot!)).toBe(true)

    replacementActivation.reject(new Error('not authorized'))
    await expect(replacement).rejects.toThrow('not authorized')

    expect(useProjectStore.getState().projectRoot).toBe(oldRoot)
    expect(isCurrentProjectTransitionSnapshot(oldSnapshot!)).toBe(true)
  })

  it('does not let stale activation reconciliation clear a newer project', async () => {
    const oldRoot = '/workspace/current'
    const replacementRoot = '/workspace/replacement'
    const nativeAuthority = deferred<string | null>()
    useProjectStore.getState().setProjectRoot(oldRoot)
    vi.mocked(window.api.activateProject).mockRejectedValueOnce(new Error('activation failed'))
    vi.mocked(window.api.getActiveProject).mockReturnValueOnce(nativeAuthority.promise)
    vi.mocked(window.api.readDirectory).mockResolvedValue([])

    const failedOpen = openProject('/workspace/failed', { autoOpenFirstTex: false })
    await vi.waitFor(() => expect(window.api.getActiveProject).toHaveBeenCalledOnce())

    await openProject(replacementRoot, { autoOpenFirstTex: false })
    nativeAuthority.resolve(null)
    await expect(failedOpen).rejects.toThrow('activation failed')

    expect(useProjectStore.getState().projectRoot).toBe(replacementRoot)
    expect(window.api.watchDirectory).toHaveBeenCalledWith(replacementRoot)
  })

  it('does not auto-open the first tex file when disabled', async () => {
    await openProject(projectRoot, { autoOpenFirstTex: false })

    expect(window.api.activateProject).toHaveBeenCalledWith(projectRoot)
    expect(window.api.unwatchDirectory).toHaveBeenCalledOnce()
    expect(window.api.readDirectory).toHaveBeenCalledWith(projectRoot)
    expect(vi.mocked(window.api.watchDirectory).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(window.api.readDirectory).mock.invocationCallOrder[0]
    )
    expect(window.api.readFile).not.toHaveBeenCalled()
    expect(useEditorStore.getState().filePath).toBeNull()
    expect(useProjectStore.getState().projectRoot).toBe(projectRoot)
  })

  it('runs independent project enrichment without serial native waits', async () => {
    const gitResult = deferred<boolean>()
    const bibResult = deferred<Awaited<ReturnType<typeof window.api.findBibInProject>>>()
    const labelResult = deferred<Awaited<ReturnType<typeof window.api.scanLabels>>>()
    const recentResult = deferred<Awaited<ReturnType<typeof window.api.addRecentProject>>>()
    vi.mocked(window.api.gitIsRepo).mockReturnValueOnce(gitResult.promise)
    vi.mocked(window.api.findBibInProject).mockReturnValueOnce(bibResult.promise)
    vi.mocked(window.api.scanLabels).mockReturnValueOnce(labelResult.promise)
    vi.mocked(window.api.addRecentProject).mockReturnValueOnce(recentResult.promise)

    const opening = openProject(projectRoot, { autoOpenFirstTex: false })

    await vi.waitFor(() => {
      expect(window.api.gitIsRepo).toHaveBeenCalledWith(projectRoot)
      expect(window.api.findBibInProject).toHaveBeenCalledWith(projectRoot)
      expect(window.api.scanLabels).toHaveBeenCalledWith(projectRoot)
      expect(window.api.addRecentProject).toHaveBeenCalledWith(projectRoot)
    })

    gitResult.resolve(false)
    bibResult.resolve([])
    labelResult.resolve([])
    recentResult.resolve(useSettingsStore.getState().settings)
    await opening
  })

  it('can defer enrichment without allowing stale results into a newer project', async () => {
    const firstRoot = '/workspace/deferred'
    const secondRoot = '/workspace/current'
    const firstGitResult = deferred<boolean>()
    vi.mocked(window.api.readDirectory).mockResolvedValue([])
    vi.mocked(window.api.gitIsRepo)
      .mockReturnValueOnce(firstGitResult.promise)
      .mockResolvedValueOnce(false)

    await expect(
      openProject(firstRoot, {
        autoOpenFirstTex: false,
        deferProjectEnrichment: true
      })
    ).resolves.toEqual({ generation: expect.any(Number), projectPath: firstRoot })

    await openProject(secondRoot, { autoOpenFirstTex: false })
    firstGitResult.resolve(true)
    await Promise.resolve()
    await Promise.resolve()

    expect(useProjectStore.getState().projectRoot).toBe(secondRoot)
    expect(useProjectStore.getState().isGitRepo).toBe(false)
    expect(window.api.gitStatus).not.toHaveBeenCalledWith(firstRoot)
  })

  it('auto-opens the first tex file by default', async () => {
    await openProject(projectRoot)

    expect(window.api.readFile).toHaveBeenCalledWith(`${projectRoot}/main.tex`)
    expect(useEditorStore.getState().filePath).toBe(`${projectRoot}/main.tex`)
  })

  it('prefers a conventional root document and discovers nested tex files', async () => {
    const nestedMain = `${projectRoot}/src/main.tex`
    vi.mocked(window.api.readDirectory).mockResolvedValueOnce([
      { name: 'appendix.tex', path: `${projectRoot}/appendix.tex`, type: 'file' },
      {
        name: 'src',
        path: `${projectRoot}/src`,
        type: 'directory',
        children: [{ name: 'main.tex', path: nestedMain, type: 'file' }]
      },
      { name: 'root.tex', path: `${projectRoot}/root.tex`, type: 'file' }
    ])
    vi.mocked(window.api.readFile).mockImplementationOnce(async (filePath) => ({
      filePath,
      content: '\\documentclass{article}'
    }))

    await openProject(projectRoot)

    expect(window.api.readFile).toHaveBeenCalledWith(`${projectRoot}/root.tex`)
    expect(useEditorStore.getState().activeFilePath).toBe(`${projectRoot}/root.tex`)
  })

  it('runs sync-on-open once from the project lifecycle without mounting research UI', async () => {
    vi.mocked(window.api.researchLoadConfig).mockResolvedValue({
      ...defaultResearchConfig,
      zoteroCollection: '/0/RESEARCH',
      syncOnOpen: true
    })

    await openProject(projectRoot, { autoOpenFirstTex: false })

    await vi.waitFor(() =>
      expect(window.api.zoteroSyncCollection).toHaveBeenCalledWith(
        '/0/RESEARCH',
        `${projectRoot}/zotero.bib`,
        23_119
      )
    )
    expect(window.api.zoteroSyncCollection).toHaveBeenCalledOnce()
  })

  it('reports a failed sync-on-open instead of dropping it silently', async () => {
    useNotificationStore.getState().clearNotifications()
    vi.mocked(window.api.researchLoadConfig).mockResolvedValue({
      ...defaultResearchConfig,
      zoteroCollection: '/0/RESEARCH',
      syncOnOpen: true
    })
    vi.mocked(window.api.zoteroSyncCollection).mockRejectedValue(new Error('Zotero is not running'))

    await openProject(projectRoot, { autoOpenFirstTex: false })

    await vi.waitFor(() =>
      expect(useNotificationStore.getState().notifications.at(-1)?.message).toContain(
        'Zotero is not running'
      )
    )
  })

  it('does not start an older project sync after a newer project lifecycle wins', async () => {
    const firstConfig = deferred<ResearchConfig>()
    vi.mocked(window.api.researchLoadConfig)
      .mockImplementationOnce(() => firstConfig.promise)
      .mockResolvedValue(defaultResearchConfig)
    vi.mocked(window.api.readDirectory).mockResolvedValue([])

    await openProject('/workspace/first-sync', { autoOpenFirstTex: false })
    await vi.waitFor(() => expect(window.api.researchLoadConfig).toHaveBeenCalledOnce())
    await openProject('/workspace/second-sync', { autoOpenFirstTex: false })
    firstConfig.resolve({
      ...defaultResearchConfig,
      zoteroCollection: '/0/STALE',
      syncOnOpen: true
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(window.api.zoteroSyncCollection).not.toHaveBeenCalled()
  })

  it('does not let a slower project overwrite a newer project', async () => {
    const firstRoot = '/workspace/first'
    const secondRoot = '/workspace/second'
    const firstTree = deferred<DirectoryEntry[]>()
    const secondTree: DirectoryEntry[] = [
      { name: 'second.tex', path: `${secondRoot}/second.tex`, type: 'file' }
    ]
    vi.mocked(window.api.readDirectory).mockImplementation(async (path) => {
      if (path === firstRoot) return firstTree.promise
      return secondTree
    })
    vi.mocked(window.api.readFile).mockImplementation(async (path) => ({
      filePath: path,
      content: '\\section{Second}'
    }))

    const firstOpen = openProject(firstRoot)
    await vi.waitFor(() => expect(window.api.readDirectory).toHaveBeenCalledWith(firstRoot))
    const secondOpen = openProject(secondRoot)
    await secondOpen

    firstTree.resolve([{ name: 'first.tex', path: `${firstRoot}/first.tex`, type: 'file' }])
    await firstOpen

    expect(useProjectStore.getState().projectRoot).toBe(secondRoot)
    expect(useProjectStore.getState().directoryTree).toEqual(secondTree)
    expect(useEditorStore.getState().filePath).toBe(`${secondRoot}/second.tex`)
    expect(window.api.unwatchDirectory).toHaveBeenCalledTimes(2)
    expect(window.api.watchDirectory).toHaveBeenCalledWith(secondRoot)
  })

  it('serializes native activation and skips a superseded activation result', async () => {
    const firstRoot = '/workspace/first-activation'
    const secondRoot = '/workspace/second-activation'
    const firstActivation = deferred<string>()
    vi.mocked(window.api.activateProject).mockImplementation(async (path) => {
      if (path === firstRoot) return firstActivation.promise
      return path
    })
    vi.mocked(window.api.readDirectory).mockResolvedValue([])

    const firstOpen = openProject(firstRoot)
    await vi.waitFor(() => expect(window.api.activateProject).toHaveBeenCalledWith(firstRoot))
    const secondOpen = openProject(secondRoot)

    expect(window.api.activateProject).not.toHaveBeenCalledWith(secondRoot)
    firstActivation.resolve(firstRoot)
    await Promise.all([firstOpen, secondOpen])

    expect(window.api.activateProject).toHaveBeenNthCalledWith(1, firstRoot)
    expect(window.api.activateProject).toHaveBeenNthCalledWith(2, secondRoot)
    expect(window.api.readDirectory).not.toHaveBeenCalledWith(firstRoot)
    expect(useProjectStore.getState().projectRoot).toBe(secondRoot)
  })

  it('invalidates pending renderer work when the project is deactivated', async () => {
    const firstRoot = '/workspace/closing'
    const firstTree = deferred<DirectoryEntry[]>()
    vi.mocked(window.api.readDirectory).mockReturnValue(firstTree.promise)

    const opening = openProject(firstRoot)
    await vi.waitFor(() => expect(window.api.readDirectory).toHaveBeenCalledWith(firstRoot))
    await deactivateProject()
    firstTree.resolve([{ name: 'late.tex', path: `${firstRoot}/late.tex`, type: 'file' }])
    await opening

    expect(window.api.deactivateProject).toHaveBeenCalledOnce()
    expect(useProjectStore.getState().directoryTree).toBeNull()
    expect(window.api.readFile).not.toHaveBeenCalled()
    expect(window.api.addRecentProject).not.toHaveBeenCalledWith(firstRoot)
  })
})
