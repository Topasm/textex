import type { AppCommandId } from '../../shared/types'
import { usePdfStore } from '../store/usePdfStore'
import { useProjectStore } from '../store/useProjectStore'
import { useUiStore } from '../store/useUiStore'
import { getDesktopCapabilities } from '../platform/capabilities'
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

export async function executeAppCommand(
  command: AppCommandId,
  context: AppCommandContext
): Promise<void> {
  const capabilities = getDesktopCapabilities()
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
      if (capabilities.templates) context.openTemplateGallery()
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
      if (capabilities.ai) context.runAiDraft()
      return
    case 'edit.find':
      useUiStore.getState().requestOmniSearchFocus('tex')
      return
    case 'view.toggleSidebar':
      useProjectStore.getState().toggleSidebar()
      return
    case 'view.toggleResearchPanel':
      useProjectStore.getState().toggleResearchPanel()
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
        if (capabilities.documentExport) {
          await context.exportDocument(getExportFormat(command))
        }
      }
  }
}

export function toggleLogPanel(): void {
  const projectStore = useProjectStore.getState()
  if (projectStore.isResearchPanelOpen && projectStore.researchPanelTab === 'problems') {
    projectStore.closeResearchPanel()
    return
  }

  if (
    projectStore.isResearchPanelOpen &&
    projectStore.researchPanelTab === 'profile' &&
    !confirmResearchProfileDraftDiscard()
  ) {
    return
  }

  if (projectStore.isResearchPanelOpen && projectStore.researchPanelTab === 'profile') {
    clearResearchProfileDraft()
  }
  projectStore.openResearchPanel('problems')
}
