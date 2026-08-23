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
})
