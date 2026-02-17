import { create } from 'zustand'
import { subscribeWithSelector, persist } from 'zustand/middleware'
import type {
  DirectoryEntry,
  BibEntry,
  CitationGroup,
  LabelInfo,
  PackageData
} from '../../shared/types'
import type { GitStatusResult } from '../types/api'

export type SidebarView = 'files' | 'git' | 'bib' | 'outline' | 'todo' | 'timeline'

interface ProjectState {
  projectRoot: string | null
  directoryTree: DirectoryEntry[] | null
  isSidebarOpen: boolean
  sidebarView: SidebarView
  sidebarWidth: number

  // BibTeX
  bibEntries: BibEntry[]
  citationGroups: CitationGroup[]

  // Labels
  labels: LabelInfo[]

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
  toggleSidebar: () => void
  setSidebarView: (view: SidebarView) => void
  setSidebarWidth: (width: number) => void
  setBibEntries: (entries: BibEntry[]) => void
  setCitationGroups: (groups: CitationGroup[]) => void
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
      isSidebarOpen: false,
      sidebarView: 'files',
      sidebarWidth: 240,

      bibEntries: [],
      citationGroups: [],
      labels: [],
      packageData: {},
      detectedPackages: [],
      isGitRepo: false,
      gitBranch: '',
      gitStatus: null,

      setProjectRoot: (projectRoot) => set({ projectRoot }),
      setDirectoryTree: (directoryTree) => set({ directoryTree }),
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setSidebarView: (sidebarView) => set({ sidebarView }),
      setSidebarWidth: (sidebarWidth) => set({ sidebarWidth: Math.max(150, Math.min(500, sidebarWidth)) }),
      setBibEntries: (bibEntries) => set({ bibEntries }),
      setCitationGroups: (citationGroups) => set({ citationGroups }),
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
        sidebarWidth: state.sidebarWidth
      }),
      onRehydrateStorage: () => (state) => {
        // Migrate removed sidebar views
        if (state && (state.sidebarView as string) === 'memo') {
          state.sidebarView = 'todo'
        }
        if (state && (state.sidebarView as string) === 'structure') {
          state.sidebarView = 'outline'
        }
      }
    }
  )
)
