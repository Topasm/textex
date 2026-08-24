import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LogPanel from '../../renderer/components/LogPanel'
import { useCompileStore } from '../../renderer/store/useCompileStore'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useNotificationStore } from '../../renderer/store/useNotificationStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'

describe('LogPanel diagnostic navigation', () => {
  beforeEach(() => {
    vi.mocked(window.api.readFile).mockReset()
    useEditorStore.getState().resetEditor()
    useNotificationStore.getState().clearNotifications()
    useProjectStore.setState({ projectRoot: '/project' })
    useCompileStore.setState({
      isLogPanelOpen: true,
      logViewMode: 'structured',
      diagnostics: [
        {
          file: 'chapters/chapter2.tex',
          line: 80,
          column: 6,
          severity: 'error',
          message: 'Chapter error'
        }
      ]
    })
  })

  it('opens the diagnostic file before jumping to its reported line and column', async () => {
    vi.mocked(window.api.readFile).mockResolvedValue({
      filePath: '/project/chapters/chapter2.tex',
      content: 'chapter'
    })
    render(<LogPanel />)

    fireEvent.click(screen.getByText('Chapter error').closest('.log-entry')!)

    await waitFor(() => {
      expect(window.api.readFile).toHaveBeenCalledWith('/project/chapters/chapter2.tex')
      expect(useEditorStore.getState().activeFilePath).toBe('/project/chapters/chapter2.tex')
      expect(useEditorStore.getState().pendingJump).toEqual({
        line: 80,
        column: 6,
        skipFocus: undefined
      })
    })
  })
})
