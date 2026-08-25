import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReferencesPanel } from '../../renderer/components/research/ReferencesPanel'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useNotificationStore } from '../../renderer/store/useNotificationStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import type { SubmissionCheckResult } from '../../shared/submissionCheck'

const checkResult: SubmissionCheckResult = {
  rootFile: '/project/main.tex',
  scannedFiles: 4,
  summary: { errors: 1, warnings: 1, info: 1 },
  findings: [
    {
      severity: 'error',
      code: 'missing-figure',
      message: 'Figure file does not exist',
      file: 'sections/method.tex',
      line: 42
    },
    {
      severity: 'warning',
      code: 'anonymous-author',
      message: 'Author information remains',
      file: 'main.tex',
      line: 9
    },
    {
      severity: 'info',
      code: 'page-count',
      message: 'Document page count is 8',
      file: '',
      line: 0
    }
  ]
}

describe('SubmissionCheckPanel', () => {
  beforeEach(() => {
    vi.mocked(window.api.runSubmissionCheck).mockReset()
    vi.mocked(window.api.readFile).mockReset()
    useEditorStore.getState().resetEditor()
    useNotificationStore.getState().clearNotifications()
    useEditorStore.setState({
      activeFilePath: '/project/main.tex',
      filePath: '/project/main.tex',
      openFiles: { '/project/main.tex': { isDirty: false, cursorLine: 1, cursorColumn: 1 } }
    })
    useProjectStore.setState({
      projectRoot: '/project',
      researchReferenceSource: 'submission'
    })
  })

  it('runs the check, groups findings, and safely navigates a file finding', async () => {
    vi.mocked(window.api.runSubmissionCheck).mockResolvedValue(checkResult)
    vi.mocked(window.api.readFile).mockResolvedValue({
      filePath: '/project/sections/method.tex',
      content: 'method'
    })

    render(<ReferencesPanel />)

    await waitFor(() =>
      expect(window.api.runSubmissionCheck).toHaveBeenCalledWith({
        rootFile: '/project/main.tex'
      })
    )
    expect(await screen.findByText('2 issues need attention')).toBeInTheDocument()
    expect(screen.getByText('Scanned 4 source files')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Errors\s*1/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Warnings\s*1/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Information\s*1/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Run again' }))
    await waitFor(() => expect(window.api.runSubmissionCheck).toHaveBeenCalledTimes(2))

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Open Figure file does not exist at sections/method.tex:42'
      })
    )

    await waitFor(() => {
      expect(window.api.readFile).toHaveBeenCalledWith('/project/sections/method.tex')
      expect(useEditorStore.getState().activeFilePath).toBe('/project/sections/method.tex')
      expect(useEditorStore.getState().pendingJump).toEqual({
        line: 42,
        column: 1,
        skipFocus: undefined
      })
    })
  })

  it('keeps checking the paper root while navigating and resets for a new project', async () => {
    let resolveFirst!: (result: SubmissionCheckResult) => void
    const first = new Promise<SubmissionCheckResult>((resolve) => {
      resolveFirst = resolve
    })
    vi.mocked(window.api.runSubmissionCheck)
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({
        rootFile: '/project-b/main.tex',
        scannedFiles: 1,
        summary: { errors: 0, warnings: 0, info: 0 },
        findings: []
      })

    render(<ReferencesPanel />)
    await waitFor(() => expect(window.api.runSubmissionCheck).toHaveBeenCalledTimes(1))

    act(() => {
      useEditorStore.setState({ activeFilePath: '/project/appendix.tex' })
    })
    expect(window.api.runSubmissionCheck).toHaveBeenCalledTimes(1)

    act(() => {
      useProjectStore.setState({ projectRoot: '/project-b' })
      useEditorStore.setState({ activeFilePath: '/project-b/main.tex' })
    })

    expect(await screen.findByText('No blocking issues found')).toBeInTheDocument()
    expect(window.api.runSubmissionCheck).toHaveBeenLastCalledWith({
      rootFile: '/project-b/main.tex'
    })
    await act(async () => {
      resolveFirst(checkResult)
      await first
    })
    expect(screen.queryByText('Figure file does not exist')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back to current paper' }))
    expect(useProjectStore.getState().researchReferenceSource).toBe('project')
  })
})
