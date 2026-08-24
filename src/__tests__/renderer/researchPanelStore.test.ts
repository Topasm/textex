import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore } from '../../renderer/store/useProjectStore'

describe('research panel project state', () => {
  beforeEach(() => {
    useProjectStore.setState({
      projectRoot: null,
      isResearchPanelOpen: false,
      researchPanelTab: 'references',
      researchPanelWidth: 380,
      researchReferenceSource: 'project',
      researchSearchQuery: '',
      pendingResearchSelection: null,
      researchSelectionToken: 0,
      researchPanelStates: {}
    })
  })

  it('restores open, tab, width, and source independently per project', () => {
    const store = useProjectStore.getState()
    store.setProjectRoot('/one')
    store.openResearchPanel('chat')
    store.setResearchPanelWidth(444)
    store.setResearchReferenceSource('online')

    useProjectStore.getState().setProjectRoot('/two')
    expect(useProjectStore.getState()).toMatchObject({
      isResearchPanelOpen: false,
      researchPanelTab: 'references',
      researchReferenceSource: 'project'
    })

    useProjectStore.getState().setProjectRoot('/one')
    expect(useProjectStore.getState()).toMatchObject({
      isResearchPanelOpen: true,
      researchPanelTab: 'chat',
      researchPanelWidth: 444,
      researchReferenceSource: 'online'
    })
  })

  it('persists the project profile tab like other research tabs', () => {
    useProjectStore.getState().setProjectRoot('/paper')
    useProjectStore.getState().openResearchPanel('profile')

    useProjectStore.getState().setProjectRoot('/other')
    useProjectStore.getState().setProjectRoot('/paper')

    expect(useProjectStore.getState()).toMatchObject({
      isResearchPanelOpen: true,
      researchPanelTab: 'profile'
    })
  })

  it('persists the project problems tab like other right-panel tabs', () => {
    useProjectStore.getState().setProjectRoot('/paper')
    useProjectStore.getState().openResearchPanel('problems')

    useProjectStore.getState().setProjectRoot('/other')
    useProjectStore.getState().setProjectRoot('/paper')

    expect(useProjectStore.getState()).toMatchObject({
      isResearchPanelOpen: true,
      researchPanelTab: 'problems'
    })
  })

  it('keeps editor selections transient and gives repeated requests unique tokens', () => {
    useProjectStore.getState().setProjectRoot('/paper')
    const request = {
      projectRoot: '/paper',
      filePath: '/paper/main.tex',
      content: 'Selected claim',
      startLine: 4,
      endLine: 4
    }

    useProjectStore.getState().queueResearchSelection(request)
    const firstToken = useProjectStore.getState().pendingResearchSelection?.token
    useProjectStore.getState().consumeResearchSelection(firstToken!)
    useProjectStore.getState().queueResearchSelection(request)

    expect(useProjectStore.getState().pendingResearchSelection?.token).toBe((firstToken ?? 0) + 1)
    useProjectStore.getState().setProjectRoot('/other')
    expect(useProjectStore.getState().pendingResearchSelection).toBeNull()
  })
})
