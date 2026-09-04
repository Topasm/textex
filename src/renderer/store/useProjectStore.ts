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
import {
  clearResearchProfileDraft,
  confirmResearchProfileDraftDiscard
} from '../services/researchProfileDraft'
import type { ReferenceDragPayload } from '../services/referencePayload'

export type SidebarView = 'files' | 'git' | 'outline' | 'references' | 'timeline'
export type ResearchPanelTab = 'chat' | 'notes' | 'profile' | 'problems'
export type ReferenceSource = 'project' | 'zotero' | 'online' | 'submission'

export interface BibliographyRegistrationRequest {
  filePath: string
  bibliographyFile: string
  originalContent: string
  proposedContent: string
  command: string
  mode: 'bibtex' | 'biblatex'
}

export interface ResearchSelectionRequest {
  token: number
  projectRoot: string
  filePath: string
  content: string
  startLine: number
  endLine: number
}

/**
 * Queued cross-panel handoffs to Research Chat. `payload`/`prompt` originate
 * from the References view (left sidebar) or the Problems view (right
 * panel); both now live outside Research Chat's own panel, so the store is
 * the shared channel instead of a prop passed down from a common parent.
 * The reference payload is a runtime-neutral service contract so this store
 * never needs to depend on a component module.
 */
export interface PendingChatReference {
  token: number
  projectRoot: string
  payload: ReferenceDragPayload
}

export interface PendingChatPrompt {
  token: number
  projectRoot: string
  prompt: string
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
  pendingResearchSelection: ResearchSelectionRequest | null
  researchSelectionToken: number
  pendingChatReference: PendingChatReference | null
  chatReferenceToken: number
  pendingChatPrompt: PendingChatPrompt | null
  chatPromptToken: number
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
  /** Opens the left sidebar to the References view, optionally switching its source. */
  openReferences: (source?: ReferenceSource) => void
  setResearchSearchQuery: (query: string) => void
  queueResearchSelection: (request: Omit<ResearchSelectionRequest, 'token'>) => void
  consumeResearchSelection: (token: number) => void
  queueChatReference: (payload: ReferenceDragPayload) => void
  consumeChatReference: (token: number) => void
  queueChatPrompt: (prompt: string) => void
  consumeChatPrompt: (token: number) => void
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
      researchPanelTab: 'chat',
      researchPanelWidth: RESEARCH_PANEL_DEFAULT_WIDTH,
      researchReferenceSource: 'project',
      researchSearchQuery: '',
      pendingResearchSelection: null,
      researchSelectionToken: 0,
      pendingChatReference: null,
      chatReferenceToken: 0,
      pendingChatPrompt: null,
      chatPromptToken: 0,
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
            researchPanelTab: saved?.tab ?? 'chat',
            researchPanelWidth: saved?.width ?? RESEARCH_PANEL_DEFAULT_WIDTH,
            researchReferenceSource: saved?.source ?? 'project',
            researchSearchQuery: '',
            pendingResearchSelection: null,
            pendingChatReference: null,
            pendingChatPrompt: null,
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
      openReferences: (source) =>
        set((state) => ({
          sidebarView: 'references',
          isSidebarOpen: true,
          researchReferenceSource: source ?? state.researchReferenceSource
        })),
      setResearchSearchQuery: (researchSearchQuery) => set({ researchSearchQuery }),
      queueResearchSelection: (request) =>
        set((state) => {
          const token = state.researchSelectionToken + 1
          return {
            researchSelectionToken: token,
            pendingResearchSelection: { ...request, token }
          }
        }),
      consumeResearchSelection: (token) =>
        set((state) => ({
          pendingResearchSelection:
            state.pendingResearchSelection?.token === token ? null : state.pendingResearchSelection
        })),
      queueChatReference: (payload) =>
        set((state) => {
          if (!state.projectRoot) return state
          if (state.researchPanelTab === 'profile' && !confirmResearchProfileDraftDiscard()) {
            return state
          }
          if (state.researchPanelTab === 'profile') clearResearchProfileDraft()
          const token = state.chatReferenceToken + 1
          return {
            ...persistResearchPanelState(state, { open: true, tab: 'chat' }),
            chatReferenceToken: token,
            pendingChatReference: { token, projectRoot: state.projectRoot, payload }
          }
        }),
      consumeChatReference: (token) =>
        set((state) => ({
          pendingChatReference:
            state.pendingChatReference?.token === token ? null : state.pendingChatReference
        })),
      queueChatPrompt: (prompt) =>
        set((state) => {
          if (!state.projectRoot || !prompt.trim()) return state
          if (state.researchPanelTab === 'profile' && !confirmResearchProfileDraftDiscard()) {
            return state
          }
          if (state.researchPanelTab === 'profile') clearResearchProfileDraft()
          const token = state.chatPromptToken + 1
          return {
            ...persistResearchPanelState(state, { open: true, tab: 'chat' }),
            chatPromptToken: token,
            pendingChatPrompt: { token, projectRoot: state.projectRoot, prompt }
          }
        }),
      consumeChatPrompt: (token) =>
        set((state) => ({
          pendingChatPrompt:
            state.pendingChatPrompt?.token === token ? null : state.pendingChatPrompt
        })),
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
        if (!state) return
        // Migrate removed sidebar views. Notes/Todo moved to the research
        // panel's "notes" tab, so its old sidebar slot falls back to files.
        if ((state.sidebarView as string) === 'memo' || (state.sidebarView as string) === 'todo') {
          state.sidebarView = 'files'
        }
        if ((state.sidebarView as string) === 'structure') {
          state.sidebarView = 'outline'
        }
        if ((state.sidebarView as string) === 'bib') {
          state.sidebarView = 'files'
        }
        // References moved from the research panel to the sidebar; redirect
        // any per-project restore that still points at the retired tab.
        if (state.researchPanelStates) {
          for (const key of Object.keys(state.researchPanelStates)) {
            const saved = state.researchPanelStates[key]
            if (saved && (saved.tab as string) === 'references') {
              state.researchPanelStates[key] = { ...saved, tab: 'chat' }
            }
          }
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
