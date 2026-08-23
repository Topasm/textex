import { create } from 'zustand'
import { subscribeWithSelector, persist } from 'zustand/middleware'
import {
  RESEARCH_PANEL_DEFAULT_WIDTH,
  RESEARCH_PANEL_WIDTH_MAX,
  RESEARCH_PANEL_WIDTH_MIN,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_MAX
} from '../constants'
import type {
  DirectoryEntry,
  BibEntry,
  CitationGroup,
  LabelInfo,
  PackageData,
  ProjectIndexDelta,
  ProjectIndexSnapshot
} from '../../shared/types'
import type { AuxCitationMap } from '../../shared/auxparser'
import type { GitStatusResult } from '../types/api'
import { applyProjectIndexDelta, projectPathKey } from '../services/projectIndex'

export type SidebarView = 'files' | 'git' | 'outline' | 'todo' | 'timeline'
export type ResearchPanelTab = 'chat' | 'references'
export type ReferenceSource = 'project' | 'zotero' | 'online'

export interface BibliographyRegistrationRequest {
  filePath: string
  bibliographyFile: string
  originalContent: string
  proposedContent: string
  command: string
  mode: 'bibtex' | 'biblatex'
}

interface PersistedResearchPanelState {
  open: boolean
  tab: ResearchPanelTab
  width: number
  source: ReferenceSource
}

interface ProjectState {
  projectRoot: string | null
  directoryTree: DirectoryEntry[] | null
  directoryRefreshVersions: Record<string, number>
  projectIndex: ProjectIndexSnapshot | null
  isSidebarOpen: boolean
  sidebarView: SidebarView
  sidebarWidth: number
  isResearchPanelOpen: boolean
  researchPanelTab: ResearchPanelTab
  researchPanelWidth: number
  researchReferenceSource: ReferenceSource
  researchSearchQuery: string
  bibliographyRegistrationRequest: BibliographyRegistrationRequest | null
  researchPanelStates: Record<string, PersistedResearchPanelState>

  // BibTeX
  bibEntries: BibEntry[]
  citationGroups: CitationGroup[]

  // Labels
  labels: LabelInfo[]

  // Aux citation map (for PDF citation tooltips)
  auxCitationMap: AuxCitationMap | null

  // Package data
  packageData: Record<string, PackageData>
  detectedPackages: string[]

  // Git
  isGitRepo: boolean
  gitBranch: string
  gitStatus: GitStatusResult | null

  // Actions
  setProjectRoot: (root: string | null) => void
  setDirectoryTree: (tree: DirectoryEntry[] | null) => void
  invalidateDirectory: (directoryPath: string) => void
  setProjectIndex: (snapshot: ProjectIndexSnapshot | null) => void
  applyProjectIndexDelta: (delta: ProjectIndexDelta) => boolean
  toggleSidebar: () => void
  setSidebarView: (view: SidebarView) => void
  setSidebarWidth: (width: number) => void
  toggleResearchPanel: () => void
  openResearchPanel: (tab?: ResearchPanelTab) => void
  closeResearchPanel: () => void
  setResearchPanelTab: (tab: ResearchPanelTab) => void
  setResearchPanelWidth: (width: number) => void
  setResearchReferenceSource: (source: ReferenceSource) => void
  setResearchSearchQuery: (query: string) => void
  setBibliographyRegistrationRequest: (request: BibliographyRegistrationRequest | null) => void
  setBibEntries: (entries: BibEntry[]) => void
  setCitationGroups: (groups: CitationGroup[]) => void
  setAuxCitationMap: (map: AuxCitationMap | null) => void
  setLabels: (labels: LabelInfo[]) => void
  setPackageData: (data: Record<string, PackageData>) => void
  setDetectedPackages: (packages: string[]) => void
  setIsGitRepo: (isRepo: boolean) => void
  setGitBranch: (branch: string) => void
  setGitStatus: (status: GitStatusResult | null) => void
}

export const useProjectStore = create<ProjectState>()(
  persist(
    subscribeWithSelector((set) => ({
      projectRoot: null,
      directoryTree: null,
      directoryRefreshVersions: {},
      projectIndex: null,
      isSidebarOpen: false,
      sidebarView: 'files',
      sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
      isResearchPanelOpen: false,
      researchPanelTab: 'references',
      researchPanelWidth: RESEARCH_PANEL_DEFAULT_WIDTH,
      researchReferenceSource: 'project',
      researchSearchQuery: '',
      bibliographyRegistrationRequest: null,
      researchPanelStates: {},

      bibEntries: [],
      citationGroups: [],
      auxCitationMap: null,
      labels: [],
      packageData: {},
      detectedPackages: [],
      isGitRepo: false,
      gitBranch: '',
      gitStatus: null,

      setProjectRoot: (projectRoot) =>
        set((state) => {
          const saved = projectRoot ? state.researchPanelStates[projectRoot] : undefined
          return {
            projectRoot,
            directoryRefreshVersions: {},
            projectIndex: null,
            isResearchPanelOpen: saved?.open ?? false,
            researchPanelTab: saved?.tab ?? 'references',
            researchPanelWidth: saved?.width ?? RESEARCH_PANEL_DEFAULT_WIDTH,
            researchReferenceSource: saved?.source ?? 'project',
            researchSearchQuery: '',
            bibliographyRegistrationRequest: null
          }
        }),
      setDirectoryTree: (directoryTree) => set({ directoryTree }),
      invalidateDirectory: (directoryPath) =>
        set((state) => {
          const key = projectPathKey(directoryPath)
          return {
            directoryRefreshVersions: {
              ...state.directoryRefreshVersions,
              [key]: (state.directoryRefreshVersions[key] ?? 0) + 1
            }
          }
        }),
      setProjectIndex: (projectIndex) => set({ projectIndex }),
      applyProjectIndexDelta: (delta) => {
        let applied = false
        set((state) => {
          if (!state.projectIndex) return state
          const next = applyProjectIndexDelta(state.projectIndex, delta)
          if (!next) return state
          applied = true
          return { projectIndex: next }
        })
        return applied
      },
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setSidebarView: (sidebarView) => set({ sidebarView }),
      setSidebarWidth: (sidebarWidth) =>
        set({
          sidebarWidth: Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, sidebarWidth))
        }),
      toggleResearchPanel: () =>
        set((state) => {
          const open = !state.isResearchPanelOpen
          return persistResearchPanelState(state, { open })
        }),
      openResearchPanel: (tab) =>
        set((state) => persistResearchPanelState(state, { open: true, ...(tab ? { tab } : {}) })),
      closeResearchPanel: () => set((state) => persistResearchPanelState(state, { open: false })),
      setResearchPanelTab: (tab) => set((state) => persistResearchPanelState(state, { tab })),
      setResearchPanelWidth: (width) =>
        set((state) =>
          persistResearchPanelState(state, {
            width: Math.max(RESEARCH_PANEL_WIDTH_MIN, Math.min(RESEARCH_PANEL_WIDTH_MAX, width))
          })
        ),
      setResearchReferenceSource: (source) =>
        set((state) => persistResearchPanelState(state, { source })),
      setResearchSearchQuery: (researchSearchQuery) => set({ researchSearchQuery }),
      setBibliographyRegistrationRequest: (bibliographyRegistrationRequest) =>
        set({ bibliographyRegistrationRequest }),
      setBibEntries: (bibEntries) => set({ bibEntries }),
      setCitationGroups: (citationGroups) => set({ citationGroups }),
      setAuxCitationMap: (auxCitationMap) => set({ auxCitationMap }),
      setLabels: (labels) => set({ labels }),
      setPackageData: (packageData) => set({ packageData }),
      setDetectedPackages: (detectedPackages) => set({ detectedPackages }),
      setIsGitRepo: (isGitRepo) => set({ isGitRepo }),
      setGitBranch: (gitBranch) => set({ gitBranch }),
      setGitStatus: (gitStatus) => set({ gitStatus })
    })),
    {
      name: 'textex-project-storage',
      partialize: (state) => ({
        projectRoot: state.projectRoot,
        isSidebarOpen: state.isSidebarOpen,
        sidebarView: state.sidebarView,
        sidebarWidth: state.sidebarWidth,
        researchPanelStates: state.researchPanelStates
      }),
      onRehydrateStorage: () => (state) => {
        // Migrate removed sidebar views
        if (state && (state.sidebarView as string) === 'memo') {
          state.sidebarView = 'todo'
        }
        if (state && (state.sidebarView as string) === 'structure') {
          state.sidebarView = 'outline'
        }
        if (state && (state.sidebarView as string) === 'bib') {
          state.sidebarView = 'files'
        }
      }
    }
  )
)

function persistResearchPanelState(
  state: ProjectState,
  change: Partial<PersistedResearchPanelState>
): Partial<ProjectState> {
  const next = {
    open: change.open ?? state.isResearchPanelOpen,
    tab: change.tab ?? state.researchPanelTab,
    width: change.width ?? state.researchPanelWidth,
    source: change.source ?? state.researchReferenceSource
  }
  return {
    isResearchPanelOpen: next.open,
    researchPanelTab: next.tab,
    researchPanelWidth: next.width,
    researchReferenceSource: next.source,
    researchPanelStates: state.projectRoot
      ? { ...state.researchPanelStates, [state.projectRoot]: next }
      : state.researchPanelStates
  }
}
