import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openProject } from '../../renderer/utils/openProject'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import type { DirectoryEntry } from '../../shared/types'

const projectRoot = '/workspace/project'
const tree: DirectoryEntry[] = [
  { name: 'main.tex', path: `${projectRoot}/main.tex`, type: 'file' },
  { name: 'notes.txt', path: `${projectRoot}/notes.txt`, type: 'file' }
]

describe('openProject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useEditorStore.setState({
      filePath: null,
      content: '',
      isDirty: false,
      openFiles: {},
      activeFilePath: null,
      cursorLine: 1,
      cursorColumn: 1,
      pendingJump: null,
      pendingInsertText: null,
      editorInstance: null,
      _sessionOpenPaths: [],
      _sessionActiveFile: null
    })
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
    vi.mocked(window.api.readFile).mockResolvedValue({
      filePath: `${projectRoot}/main.tex`,
      content: '\\section{Intro}'
    })
    vi.mocked(window.api.watchDirectory).mockResolvedValue(undefined)
    vi.mocked(window.api.gitIsRepo).mockResolvedValue(false)
    vi.mocked(window.api.findBibInProject).mockResolvedValue([])
    vi.mocked(window.api.scanLabels).mockResolvedValue([])
    vi.mocked(window.api.addRecentProject).mockResolvedValue({})
  })

  it('does not auto-open the first tex file when disabled', async () => {
    await openProject(projectRoot, { autoOpenFirstTex: false })

    expect(window.api.readDirectory).toHaveBeenCalledWith(projectRoot)
    expect(window.api.readFile).not.toHaveBeenCalled()
    expect(useEditorStore.getState().filePath).toBeNull()
    expect(useProjectStore.getState().projectRoot).toBe(projectRoot)
  })

  it('auto-opens the first tex file by default', async () => {
    await openProject(projectRoot)

    expect(window.api.readFile).toHaveBeenCalledWith(`${projectRoot}/main.tex`)
    expect(useEditorStore.getState().filePath).toBe(`${projectRoot}/main.tex`)
  })
})
