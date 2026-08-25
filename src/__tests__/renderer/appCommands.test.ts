import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeAppCommand, toggleLogPanel } from '../../renderer/services/appCommands'
import { usePdfStore } from '../../renderer/store/usePdfStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useUiStore } from '../../renderer/store/useUiStore'
import {
  clearResearchProfileDraft,
  setResearchProfileDraftDirty
} from '../../renderer/services/researchProfileDraft'

const context = {
  checkForUpdates: vi.fn().mockResolvedValue(undefined),
  compile: vi.fn().mockResolvedValue(undefined),
  openFile: vi.fn().mockResolvedValue(undefined),
  openFolder: vi.fn().mockResolvedValue(undefined),
  openSettings: vi.fn(),
  openTemplateGallery: vi.fn(),
  runAiDraft: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
  saveAs: vi.fn().mockResolvedValue(undefined),
  toggleLog: vi.fn(),
  toggleTerminal: vi.fn(),
  closeWindow: vi.fn().mockResolvedValue(undefined),
  quitApp: vi.fn().mockResolvedValue(undefined),
  exportDocument: vi.fn().mockResolvedValue(undefined)
}

describe('executeAppCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useUiStore.setState({
      omniSearchFocusRequested: false,
      omniSearchFocusMode: null,
      updateStatus: 'idle'
    })
    clearResearchProfileDraft()
    useProjectStore.setState({
      isSidebarOpen: false,
      isResearchPanelOpen: false,
      researchPanelTab: 'chat',
      researchReferenceSource: 'project'
    })
    usePdfStore.setState({ zoomLevel: 100, fitRequest: null })
  })

  it('routes file commands through the injected handlers', async () => {
    await executeAppCommand('file.open', context)
    await executeAppCommand('file.save', context)
    await executeAppCommand('file.saveAs', context)
    await executeAppCommand('file.newTemplate', context)
    await executeAppCommand('file.export.docx', context)

    expect(context.openFile).toHaveBeenCalledOnce()
    expect(context.save).toHaveBeenCalledOnce()
    expect(context.saveAs).toHaveBeenCalledOnce()
    expect(context.openTemplateGallery).toHaveBeenCalledOnce()
    expect(context.exportDocument).toHaveBeenCalledWith('docx')
  })

  it('updates search focus and layout stores for view commands', async () => {
    await executeAppCommand('edit.find', context)
    expect(useUiStore.getState().omniSearchFocusMode).toBe('tex')

    await executeAppCommand('view.search.citations', context)
    expect(useUiStore.getState().omniSearchFocusMode).toBe('cite')

    await executeAppCommand('view.search.pdf', context)
    expect(useUiStore.getState().omniSearchFocusMode).toBe('pdf')

    await executeAppCommand('view.toggleSidebar', context)
    expect(useProjectStore.getState().isSidebarOpen).toBe(true)

    await executeAppCommand('view.toggleResearchPanel', context)
    expect(useProjectStore.getState().isResearchPanelOpen).toBe(true)
  })

  it('updates the PDF store for zoom and fit commands', async () => {
    await executeAppCommand('pdf.zoomIn', context)
    expect(usePdfStore.getState().zoomLevel).toBe(125)

    await executeAppCommand('pdf.zoomOut', context)
    expect(usePdfStore.getState().zoomLevel).toBe(100)

    await executeAppCommand('pdf.fitWidth', context)
    expect(usePdfStore.getState().fitRequest).toBe('width')

    await executeAppCommand('pdf.fitHeight', context)
    expect(usePdfStore.getState().fitRequest).toBe('height')
  })

  it('opens settings and checks for updates through the injected handlers', async () => {
    await executeAppCommand('app.settings', context)
    await executeAppCommand('app.checkUpdates', context)

    expect(context.openSettings).toHaveBeenCalledOnce()
    expect(context.checkForUpdates).toHaveBeenCalledOnce()
  })

  it('routes native window close and application quit through lifecycle handlers', async () => {
    await executeAppCommand('window.close', context)
    await executeAppCommand('app.quit', context)

    expect(context.closeWindow).toHaveBeenCalledOnce()
    expect(context.quitApp).toHaveBeenCalledOnce()
  })

  it('uses the shared compile and log handlers', async () => {
    await executeAppCommand('compile.run', context)
    await executeAppCommand('view.toggleLog', context)

    expect(context.compile).toHaveBeenCalledOnce()
    expect(context.toggleLog).toHaveBeenCalledOnce()
  })

  it('opens Submission Check in the References workflow', async () => {
    await executeAppCommand('compile.submissionCheck', context)

    expect(useProjectStore.getState()).toMatchObject({
      isResearchPanelOpen: true,
      researchPanelTab: 'references',
      researchReferenceSource: 'submission'
    })
  })

  it('toggles the Problems tab in the right panel', () => {
    toggleLogPanel()

    expect(useProjectStore.getState()).toMatchObject({
      isResearchPanelOpen: true,
      researchPanelTab: 'problems'
    })

    toggleLogPanel()
    expect(useProjectStore.getState().isResearchPanelOpen).toBe(false)
  })

  it('does not leave a dirty research profile when Problems navigation is cancelled', () => {
    useProjectStore.setState({ isResearchPanelOpen: true, researchPanelTab: 'profile' })
    setResearchProfileDraftDirty(true)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

    toggleLogPanel()

    expect(confirm).toHaveBeenCalledOnce()
    expect(useProjectStore.getState()).toMatchObject({
      isResearchPanelOpen: true,
      researchPanelTab: 'profile'
    })
    confirm.mockRestore()
    clearResearchProfileDraft()
  })

  it('routes available Tauri domains', async () => {
    await executeAppCommand('file.newTemplate', context)
    await executeAppCommand('file.export.docx', context)
    await executeAppCommand('ai.draft', context)
    await executeAppCommand('view.toggleTerminal', context)

    expect(context.openTemplateGallery).toHaveBeenCalledOnce()
    expect(context.exportDocument).toHaveBeenCalledWith('docx')
    expect(context.runAiDraft).toHaveBeenCalledOnce()
    expect(context.toggleTerminal).toHaveBeenCalledOnce()
  })
})
