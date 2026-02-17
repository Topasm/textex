/**
 * Granular selector hooks for useAppStore.
 *
 * Intermediate bridge layer: components import these selectors instead of
 * reaching directly into useAppStore. When domain stores become the source
 * of truth, only this file needs to change.
 */
import { useAppStore } from './useAppStore'

// ---- Editor ----
export const useFilePath = () => useAppStore((s) => s.filePath)
export const useContent = () => useAppStore((s) => s.content)
export const useIsDirty = () => useAppStore((s) => s.isDirty)
export const useOpenFiles = () => useAppStore((s) => s.openFiles)
export const useActiveFilePath = () => useAppStore((s) => s.activeFilePath)
export const useCursorPosition = () =>
  useAppStore((s) => ({ line: s.cursorLine, column: s.cursorColumn }))
export const usePendingJump = () => useAppStore((s) => s.pendingJump)

// ---- Compile ----
export const useCompileStatus = () => useAppStore((s) => s.compileStatus)
export const usePdfBase64 = () => useAppStore((s) => s.pdfBase64)
export const useLogs = () => useAppStore((s) => s.logs)
export const useIsLogPanelOpen = () => useAppStore((s) => s.isLogPanelOpen)
export const useDiagnostics = () => useAppStore((s) => s.diagnostics)
export const useLogViewMode = () => useAppStore((s) => s.logViewMode)

// ---- PDF / Zoom ----
export const useSplitRatio = () => useAppStore((s) => s.splitRatio)
export const useZoomLevel = () => useAppStore((s) => s.zoomLevel)
export const useSynctexHighlight = () => useAppStore((s) => s.synctexHighlight)
export const usePdfSearchVisible = () => useAppStore((s) => s.pdfSearchVisible)
export const usePdfSearchQuery = () => useAppStore((s) => s.pdfSearchQuery)
export const useSyncToCodeRequest = () => useAppStore((s) => s.syncToCodeRequest)

// ---- Settings ----
export const useSettings = () => useAppStore((s) => s.settings)
export const useSetting = <K extends keyof import('./useAppStore').UserSettings>(key: K) =>
  useAppStore((s) => s.settings[key])

// ---- Project ----
export const useProjectRoot = () => useAppStore((s) => s.projectRoot)
export const useDirectoryTree = () => useAppStore((s) => s.directoryTree)
export const useIsSidebarOpen = () => useAppStore((s) => s.isSidebarOpen)
export const useSidebarView = () => useAppStore((s) => s.sidebarView)
export const useSidebarWidth = () => useAppStore((s) => s.sidebarWidth)
export const useBibEntries = () => useAppStore((s) => s.bibEntries)
export const useCitationGroups = () => useAppStore((s) => s.citationGroups)
export const useLabels = () => useAppStore((s) => s.labels)
export const usePackageData = () => useAppStore((s) => s.packageData)
export const useDetectedPackages = () => useAppStore((s) => s.detectedPackages)
export const useIsGitRepo = () => useAppStore((s) => s.isGitRepo)
export const useGitBranch = () => useAppStore((s) => s.gitBranch)
export const useGitStatus = () => useAppStore((s) => s.gitStatus)

// ---- UI ----
export const useUpdateStatus = () => useAppStore((s) => s.updateStatus)
export const useUpdateVersion = () => useAppStore((s) => s.updateVersion)
export const useUpdateProgress = () => useAppStore((s) => s.updateProgress)
export const useExportStatus = () => useAppStore((s) => s.exportStatus)
export const useLspStatus = () => useAppStore((s) => s.lspStatus)
export const useLspError = () => useAppStore((s) => s.lspError)
export const useDocumentSymbols = () => useAppStore((s) => s.documentSymbols)
export const useCiteSearchFocusRequested = () => useAppStore((s) => s.citeSearchFocusRequested)
export const useIsTemplateGalleryOpen = () => useAppStore((s) => s.isTemplateGalleryOpen)
