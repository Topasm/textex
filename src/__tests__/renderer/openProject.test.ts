import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deactivateProject, openProject } from '../../renderer/utils/openProject'
import { useEditorStore } from '../../renderer/store/useEditorStore'
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
  syncOnOpen: false
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
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
    expect(useProjectStore.getState().projectRoot).toBeNull()
    expect(useEditorStore.getState().openFiles).toEqual({})
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

  it('auto-opens the first tex file by default', async () => {
    await openProject(projectRoot)

    expect(window.api.readFile).toHaveBeenCalledWith(`${projectRoot}/main.tex`)
    expect(useEditorStore.getState().filePath).toBe(`${projectRoot}/main.tex`)
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
