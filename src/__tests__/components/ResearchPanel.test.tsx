import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResearchPanel } from '../../renderer/components/ResearchPanel'
import { clearResearchProfileDraft } from '../../renderer/services/researchProfileDraft'
import { useProjectStore } from '../../renderer/store/useProjectStore'

describe('ResearchPanel tabs', () => {
  beforeEach(() => {
    clearResearchProfileDraft()
    vi.restoreAllMocks()
    useProjectStore.setState({
      projectRoot: '/project',
      isResearchPanelOpen: true,
      researchPanelTab: 'chat'
    })
    window.api.researchProfileLoad = vi.fn().mockResolvedValue({
      version: 1,
      paper: { title: '', authors: [] },
      resources: [],
      instructions: []
    })
  })

  it('opens the project research profile from its own tab', async () => {
    render(<ResearchPanel onAiDraft={vi.fn()} />)

    fireEvent.click(screen.getByRole('tab', { name: 'Profile' }))

    expect(useProjectStore.getState().researchPanelTab).toBe('profile')
    expect(await screen.findByLabelText('Title')).toBeInTheDocument()
  })

  it('does not discard an edited profile when leaving its tab is cancelled', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<ResearchPanel onAiDraft={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Profile' }))
    const title = await screen.findByLabelText('Title')
    fireEvent.change(title, { target: { value: 'Unsaved title' } })

    fireEvent.click(screen.getByRole('tab', { name: 'References' }))

    expect(confirm).toHaveBeenCalledOnce()
    expect(useProjectStore.getState().researchPanelTab).toBe('profile')
    expect(screen.getByLabelText('Title')).toHaveValue('Unsaved title')
  })

  it('does not close the panel while profile discard is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    useProjectStore.setState({ researchPanelTab: 'profile' })
    render(<ResearchPanel onAiDraft={vi.fn()} />)
    fireEvent.change(await screen.findByLabelText('Title'), {
      target: { value: 'Unsaved title' }
    })

    const closeButtons = screen.getAllByRole('button', { name: 'Close research panel' })
    fireEvent.click(closeButtons.at(-1)!)

    expect(useProjectStore.getState().isResearchPanelOpen).toBe(true)
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'research-tab-profile')
  })
})
