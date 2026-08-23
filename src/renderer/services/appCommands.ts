import type { AppCommandId } from '../../shared/types'
import { useCompileStore } from '../store/useCompileStore'
import { usePdfStore } from '../store/usePdfStore'
import { useProjectStore } from '../store/useProjectStore'
import { useUiStore } from '../store/useUiStore'
import { getDesktopCapabilities } from '../platform/capabilities'

export interface AppCommandContext {
  checkForUpdates: () => Promise<void>
  compile: () => Promise<void>
  openFile: () => Promise<void>
  openFolder: () => Promise<void>
  openSettings: () => void
  openTemplateGallery: () => void
  runAiDraft: () => void
  save: () => Promise<void>
  saveAs: () => Promise<void>
  toggleLog: () => void
  toggleTerminal: () => void
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
    case 'view.toggleTerminal':
      if (capabilities.pty) context.toggleTerminal()
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
    default:
      if (isExportCommand(command)) {
        if (capabilities.documentExport) {
          await context.exportDocument(getExportFormat(command))
        }
      }
  }
}

export function toggleLogPanel(): void {
  useCompileStore.getState().toggleLogPanel()
}
