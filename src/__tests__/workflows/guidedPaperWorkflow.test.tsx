import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { guidedDemoTemplate } from '../../shared/templates'
import HomeScreen from '../../renderer/components/HomeScreen'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'

describe('guided paper workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(window.api.loadSettings).mockResolvedValue({
      ...useSettingsStore.getState().settings,
      recentProjects: []
    })
  })

  it('offers the compile-ready guided paper from the home screen', () => {
    const onOpenGuidedDemo = vi.fn()
    const onOpenHelp = vi.fn()
    render(
      <HomeScreen
        onOpenFolder={vi.fn()}
        onOpenGuidedDemo={onOpenGuidedDemo}
        onOpenHelp={onOpenHelp}
        onNewBlankProject={vi.fn()}
        onNewFromTemplate={vi.fn()}
      />
    )

    fireEvent.click(screen.getByTestId('guided-demo-action'))
    expect(onOpenGuidedDemo).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Learn TextEx' }))
    expect(onOpenHelp).toHaveBeenCalledOnce()
  })

  it('keeps its engine guard, citation, tour, and project profile together', () => {
    expect(guidedDemoTemplate.content).toContain('\\ifPDFTeX')
    expect(guidedDemoTemplate.content).toContain('\\bibliography{references}')
    expect(guidedDemoTemplate.content).toContain('\\cite{lamport1994latex}')
    expect(guidedDemoTemplate.files?.['references.bib']).toContain('@book{lamport1994latex')
    expect(guidedDemoTemplate.files?.['GUIDED_TOUR.md']).toContain('Overleaf ZIP')

    const profile = JSON.parse(
      guidedDemoTemplate.files?.['.textex/research-profile.json'] ?? '{}'
    ) as { version?: number; instructions?: string[] }
    expect(profile.version).toBe(1)
    expect(profile.instructions).toContain('Use concise academic English.')
  })
})
