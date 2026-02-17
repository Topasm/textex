/**
 * Granular selector hooks that read directly from domain stores.
 *
 * Components can import these for optimal re-render performance,
 * as each selector only subscribes to its relevant domain store.
 */
import { useEditorStore } from './useEditorStore'
import { useCompileStore } from './useCompileStore'
import { useProjectStore } from './useProjectStore'
import { usePdfStore } from './usePdfStore'
import { useUiStore } from './useUiStore'
import { useSettingsStore } from './useSettingsStore'
import type { UserSettings } from '../../shared/types'

// ---- Editor ----
export const useFilePath = () => useEditorStore((s) => s.filePath)
export const useContent = () => useEditorStore((s) => s.content)
export const useIsDirty = () => useEditorStore((s) => s.isDirty)
export const useOpenFiles = () => useEditorStore((s) => s.openFiles)
export const useActiveFilePath = () => useEditorStore((s) => s.activeFilePath)
export const useCursorPosition = () =>
  useEditorStore((s) => ({ line: s.cursorLine, column: s.cursorColumn }))
export const usePendingJump = () => useEditorStore((s) => s.pendingJump)

// ---- Compile ----
export const useCompileStatus = () => useCompileStore((s) => s.compileStatus)
export const usePdfBase64 = () => useCompileStore((s) => s.pdfBase64)
export const useLogs = () => useCompileStore((s) => s.logs)
export const useIsLogPanelOpen = () => useCompileStore((s) => s.isLogPanelOpen)
export const useDiagnostics = () => useCompileStore((s) => s.diagnostics)
export const useLogViewMode = () => useCompileStore((s) => s.logViewMode)

// ---- PDF / Zoom ----
export const useSplitRatio = () => usePdfStore((s) => s.splitRatio)
export const useZoomLevel = () => usePdfStore((s) => s.zoomLevel)
export const useSynctexHighlight = () => usePdfStore((s) => s.synctexHighlight)
export const usePdfSearchVisible = () => usePdfStore((s) => s.pdfSearchVisible)
export const usePdfSearchQuery = () => usePdfStore((s) => s.pdfSearchQuery)
export const useSyncToCodeRequest = () => usePdfStore((s) => s.syncToCodeRequest)

// ---- Settings ----
export const useSettings = () => useSettingsStore((s) => s.settings)
export const useSetting = <K extends keyof UserSettings>(key: K) =>
  useSettingsStore((s) => s.settings[key])

// ---- Project ----
export const useProjectRoot = () => useProjectStore((s) => s.projectRoot)
export const useDirectoryTree = () => useProjectStore((s) => s.directoryTree)
export const useIsSidebarOpen = () => useProjectStore((s) => s.isSidebarOpen)
export const useSidebarView = () => useProjectStore((s) => s.sidebarView)
export const useSidebarWidth = () => useProjectStore((s) => s.sidebarWidth)
export const useBibEntries = () => useProjectStore((s) => s.bibEntries)
export const useCitationGroups = () => useProjectStore((s) => s.citationGroups)
export const useLabels = () => useProjectStore((s) => s.labels)
export const usePackageData = () => useProjectStore((s) => s.packageData)
export const useDetectedPackages = () => useProjectStore((s) => s.detectedPackages)
export const useIsGitRepo = () => useProjectStore((s) => s.isGitRepo)
export const useGitBranch = () => useProjectStore((s) => s.gitBranch)
export const useGitStatus = () => useProjectStore((s) => s.gitStatus)

// ---- UI ----
export const useUpdateStatus = () => useUiStore((s) => s.updateStatus)
export const useUpdateVersion = () => useUiStore((s) => s.updateVersion)
export const useUpdateProgress = () => useUiStore((s) => s.updateProgress)
export const useExportStatus = () => useUiStore((s) => s.exportStatus)
export const useLspStatus = () => useUiStore((s) => s.lspStatus)
export const useLspError = () => useUiStore((s) => s.lspError)
export const useDocumentSymbols = () => useUiStore((s) => s.documentSymbols)
export const useCiteSearchFocusRequested = () => useUiStore((s) => s.citeSearchFocusRequested)
export const useIsTemplateGalleryOpen = () => useUiStore((s) => s.isTemplateGalleryOpen)
