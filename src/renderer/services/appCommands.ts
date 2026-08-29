import type { AppCommandId } from '../../shared/types'
import { useEditorStore } from '../store/useEditorStore'
import { usePdfStore } from '../store/usePdfStore'
import { useProjectStore } from '../store/useProjectStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { proseAnchorFor, proseModeFor, useUiStore } from '../store/useUiStore'
import {
  clearResearchProfileDraft,
  confirmResearchProfileDraftDiscard
} from './researchProfileDraft'

export interface AppCommandContext {
  checkForUpdates: () => Promise<void>
  compile: () => Promise<void>
  openFile: () => Promise<void>
  openFolder: () => Promise<void>
  openProjectTerminal: () => Promise<void>
  openSettings: () => void
  openTemplateGallery: () => void
  runAiDraft: () => void
  save: () => Promise<void>
  saveAs: () => Promise<void>
  toggleLog: () => void
  closeWindow: () => Promise<void>
  quitApp: () => Promise<void>
  exportDocument: (format: 'html' | 'docx' | 'odt' | 'epub') => Promise<void>
}

function isExportCommand(
  command: AppCommandId
): command is Extract<AppCommandId, `file.export.${string}`> {
  return command.startsWith('file.export.')
}

function getExportFormat(command: Extract<AppCommandId, `file.export.${string}`>) {
  return command.replace('file.export.', '') as 'html' | 'docx' | 'odt' | 'epub'
}

export function toggleProjectSidebar(): void {
  const projectStore = useProjectStore.getState()
  const settingsStore = useSettingsStore.getState()

  if (settingsStore.settings.autoHideSidebar) {
    settingsStore.updateSetting('autoHideSidebar', false)
    if (!projectStore.isSidebarOpen) projectStore.toggleSidebar()
    return
  }

  projectStore.toggleSidebar()
}

export async function executeAppCommand(
  command: AppCommandId,
  context: AppCommandContext
): Promise<void> {
  switch (command) {
    case 'file.open':
      await context.openFile()
      return
    case 'file.openFolder':
      await context.openFolder()
      return
    case 'project.openTerminal':
      await context.openProjectTerminal()
      return
    case 'file.save':
      await context.save()
      return
    case 'file.saveAs':
      await context.saveAs()
      return
    case 'file.newTemplate':
      context.openTemplateGallery()
      return
    case 'compile.run':
      await context.compile()
      return
    case 'compile.submissionCheck': {
      const projectStore = useProjectStore.getState()
      projectStore.setResearchReferenceSource('submission')
      projectStore.openResearchPanel('references')
      return
    }
    case 'ai.draft':
      context.runAiDraft()
      return
    case 'edit.find':
      useUiStore.getState().requestOmniSearchFocus('tex')
      return
    case 'view.toggleSidebar':
      toggleProjectSidebar()
      return
    case 'view.toggleResearchPanel':
      useProjectStore.getState().toggleResearchPanel()
      return
    case 'view.toggleProse':
      toggleProseMode()
      return
    case 'view.toggleLog':
      context.toggleLog()
      return
    case 'view.search.citations':
      useUiStore.getState().requestOmniSearchFocus('cite')
      return
    case 'view.search.pdf':
      useUiStore.getState().requestOmniSearchFocus('pdf')
      return
    case 'pdf.zoomIn':
      usePdfStore.getState().zoomIn()
      return
    case 'pdf.zoomOut':
      usePdfStore.getState().zoomOut()
      return
    case 'pdf.zoomReset':
      usePdfStore.getState().resetZoom()
      return
    case 'pdf.fitWidth':
      usePdfStore.getState().requestFit('width')
      return
    case 'pdf.fitHeight':
      usePdfStore.getState().requestFit('height')
      return
    case 'app.settings':
      context.openSettings()
      return
    case 'app.checkUpdates': {
      await context.checkForUpdates()
      return
    }
    case 'window.close':
      await context.closeWindow()
      return
    case 'app.quit':
      await context.quitApp()
      return
    default:
      if (isExportCommand(command)) {
        await context.exportDocument(getExportFormat(command))
      }
  }
}

/**
 * Brings the Problems view forward without toggling it shut.
 *
 * Returns false when an unsaved research profile draft blocks the switch, so
 * callers reacting to a compile failure can fall back to a notification
 * instead of silently doing nothing.
 */
/**
 * Switches the active document between TeX and prose, and puts the caret on
 * the matching place so the author does not lose their spot across the swap.
 */
export function toggleProseMode(): void {
  const { filePath, cursorLine } = useEditorStore.getState()
  if (!filePath || !filePath.toLowerCase().endsWith('.tex')) return

  const ui = useUiStore.getState()
  const enabling = !proseModeFor(ui, filePath)
  ui.setProseMode(filePath, enabling)

  // Switching views keeps the author's place. Entering prose, the caret's line
  // becomes the anchor the Markdown scrolls to; leaving it, the anchor is
  // where Monaco lands, so the passage stays put across the swap.
  if (enabling) {
    ui.setProseAnchor(filePath, cursorLine, 'tex')
    return
  }
  useEditorStore.getState().requestJumpToLine(proseAnchorFor(ui, filePath)?.line ?? cursorLine, 1)
}

export function openProblemsPanel(): boolean {
  const projectStore = useProjectStore.getState()
  if (projectStore.isResearchPanelOpen && projectStore.researchPanelTab === 'problems') {
    return true
  }

  if (
    projectStore.isResearchPanelOpen &&
    projectStore.researchPanelTab === 'profile' &&
    !confirmResearchProfileDraftDiscard()
  ) {
    return false
  }

  if (projectStore.isResearchPanelOpen && projectStore.researchPanelTab === 'profile') {
    clearResearchProfileDraft()
  }
  projectStore.openResearchPanel('problems')
  return true
}

export function toggleLogPanel(): void {
  const projectStore = useProjectStore.getState()
  if (projectStore.isResearchPanelOpen && projectStore.researchPanelTab === 'problems') {
    projectStore.closeResearchPanel()
    return
  }
  openProblemsPanel()
}
