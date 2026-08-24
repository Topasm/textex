import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultUserSettings } from '../../shared/defaultSettings'
import { RecentProjectSwitcher } from '../../renderer/components/RecentProjectSwitcher'
import i18n from '../../renderer/i18n'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { openProject } from '../../renderer/utils/openProject'

vi.mock('../../renderer/utils/openProject', () => ({
  openProject: vi.fn()
}))

const projects = [
  {
    path: '/projects/alpha',
    name: 'alpha',
    title: 'Alpha',
    lastOpened: '2026-08-24T12:00:00.000Z'
  },
  {
    path: '/projects/beta',
    name: 'beta',
    title: 'Beta',
    lastOpened: '2026-08-23T12:00:00.000Z'
  },
  {
    path: '/projects/gamma',
    name: 'gamma',
    title: 'Gamma',
    lastOpened: '2026-08-22T12:00:00.000Z'
  }
]

describe('RecentProjectSwitcher', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('en')
    useProjectStore.setState({ projectRoot: '/projects/alpha' })
    vi.mocked(window.api.loadSettings).mockResolvedValue({
      ...createDefaultUserSettings(),
      recentProjects: projects
    })
    vi.mocked(openProject).mockResolvedValue({ generation: 1, projectPath: '/projects/beta' })
  })

  it('identifies the current project and switches only through the openProject lifecycle', async () => {
    render(<RecentProjectSwitcher />)

    const trigger = screen.getByRole('button', { name: 'Current project: alpha' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)

    const menu = await screen.findByRole('menu', { name: 'Switch recent project' })
    const current = screen.getByRole('menuitem', { name: 'Alpha, current project' })
    const beta = screen.getByRole('menuitem', { name: 'Beta' })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger).toHaveAttribute('aria-controls', menu.id)
    expect(menu).toHaveAttribute('aria-busy', 'false')
    expect(current).toBeDisabled()
    expect(current).toHaveAttribute('aria-current', 'true')
    expect(beta).not.toBeDisabled()
    expect(menu).toContainElement(beta)

    fireEvent.click(beta)

    await waitFor(() => expect(openProject).toHaveBeenCalledWith('/projects/beta'))
    expect(window.api.activateProject).not.toHaveBeenCalled()
    expect(window.api.removeRecentProject).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('supports roving menu focus and restores focus on Escape', async () => {
    render(<RecentProjectSwitcher />)
    const trigger = screen.getByRole('button', { name: 'Current project: alpha' })
    trigger.focus()

    fireEvent.keyDown(trigger, { key: 'ArrowDown' })

    const beta = await screen.findByRole('menuitem', { name: 'Beta' })
    const gamma = screen.getByRole('menuitem', { name: 'Gamma' })
    await waitFor(() => expect(beta).toHaveFocus())

    fireEvent.keyDown(beta, { key: 'ArrowDown' })
    expect(gamma).toHaveFocus()

    fireEvent.keyDown(gamma, { key: 'Home' })
    expect(beta).toHaveFocus()

    fireEvent.keyDown(beta, { key: 'ArrowUp' })
    expect(gamma).toHaveFocus()

    fireEvent.keyDown(gamma, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('enters at the last available project with ArrowUp', async () => {
    render(<RecentProjectSwitcher />)
    const trigger = screen.getByRole('button', { name: 'Current project: alpha' })

    fireEvent.keyDown(trigger, { key: 'ArrowUp' })

    const gamma = await screen.findByRole('menuitem', { name: 'Gamma' })
    await waitFor(() => expect(gamma).toHaveFocus())
  })

  it('keeps the recent entry and menu recovery context when opening fails', async () => {
    vi.mocked(openProject).mockRejectedValueOnce(new Error('Folder is unavailable'))
    render(<RecentProjectSwitcher />)
    fireEvent.click(screen.getByRole('button', { name: 'Current project: alpha' }))

    const beta = await screen.findByRole('menuitem', { name: 'Beta' })
    fireEvent.click(beta)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not open Beta: Folder is unavailable The recent entry was kept for recovery from Home.'
    )
    expect(screen.getByRole('menuitem', { name: 'Beta' })).toBeInTheDocument()
    expect(window.api.removeRecentProject).not.toHaveBeenCalled()
    expect(window.api.updateRecentProject).not.toHaveBeenCalled()
  })

  it('leaves the menu intact when the shared dirty guard cancels the transition', async () => {
    vi.mocked(openProject).mockResolvedValueOnce(null)
    render(<RecentProjectSwitcher />)
    fireEvent.click(screen.getByRole('button', { name: 'Current project: alpha' }))

    fireEvent.click(await screen.findByRole('menuitem', { name: 'Beta' }))

    await waitFor(() => expect(openProject).toHaveBeenCalledWith('/projects/beta'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(window.api.removeRecentProject).not.toHaveBeenCalled()
  })
})
