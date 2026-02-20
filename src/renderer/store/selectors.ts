/**
 * Granular selector hooks that read directly from domain stores.
 *
 * Components can import these for optimal re-render performance,
 * as each selector only subscribes to its relevant domain store.
 *
 * For selectors that return derived objects, we use shallow equality
 * via useShallow to avoid unnecessary re-renders.
 */
import { useShallow } from 'zustand/react/shallow'
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
  useEditorStore(useShallow((s) => ({ line: s.cursorLine, column: s.cursorColumn })))
export const usePendingJump = () => useEditorStore((s) => s.pendingJump)

/** Number of open tabs -- primitive value, no object allocation. */
export const useOpenFileCount = () => useEditorStore((s) => Object.keys(s.openFiles).length)

/** List of open file paths (stable reference when paths haven't changed). */
export const useOpenFilePaths = () => useEditorStore(useShallow((s) => Object.keys(s.openFiles)))

/** Whether any open file has unsaved changes. */
export const useHasUnsavedFiles = () =>
  useEditorStore((s) => Object.values(s.openFiles).some((f) => f.isDirty))

// ---- Compile ----
export const useCompileStatus = () => useCompileStore((s) => s.compileStatus)
export const usePdfPath = () => useCompileStore((s) => s.pdfPath)
export const usePdfRevision = () => useCompileStore((s) => s.pdfRevision)
export const useLogs = () => useCompileStore((s) => s.logs)
export const useIsLogPanelOpen = () => useCompileStore((s) => s.isLogPanelOpen)
export const useDiagnostics = () => useCompileStore((s) => s.diagnostics)
export const useLogViewMode = () => useCompileStore((s) => s.logViewMode)

/** Number of errors in current diagnostics. */
export const useErrorCount = () =>
  useCompileStore((s) => s.diagnostics.filter((d) => d.severity === 'error').length)

/** Number of warnings in current diagnostics. */
export const useWarningCount = () =>
  useCompileStore((s) => s.diagnostics.filter((d) => d.severity === 'warning').length)

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
export const useOmniSearchFocusRequested = () => useUiStore((s) => s.omniSearchFocusRequested)
export const useOmniSearchFocusMode = () => useUiStore((s) => s.omniSearchFocusMode)
export const useIsTemplateGalleryOpen = () => useUiStore((s) => s.isTemplateGalleryOpen)
