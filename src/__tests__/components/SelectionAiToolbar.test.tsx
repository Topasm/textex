import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SelectionAiToolbar, getToolbarPosition } from '../../renderer/components/editor/SelectionAiToolbar'
import { AI_ACTIONS } from '../../renderer/components/editor/editorAiActions'

function createEditor(width = 600, height = 300) {
  const domNode = document.createElement('div')
  Object.defineProperty(domNode, 'clientWidth', { value: width, configurable: true })
  Object.defineProperty(domNode, 'clientHeight', { value: height, configurable: true })
  domNode.getBoundingClientRect = () =>
    ({
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON: () => {}
    }) as DOMRect

  return {
    getDomNode: () => domNode,
    getScrolledVisiblePosition: vi.fn(({ lineNumber, column }) => ({
      top: lineNumber === 20 ? 270 : 40,
      left: column * 12,
      height: 20
    }))
  }
}

const selection = {
  startLineNumber: 1,
  startColumn: 2,
  endLineNumber: 1,
  endColumn: 14
}

describe('SelectionAiToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all AI quick actions and forwards clicks', () => {
    const editor = createEditor()
    const onAction = vi.fn()
    render(
      <SelectionAiToolbar
        editorRef={{ current: editor as never }}
        selection={selection as never}
        actions={AI_ACTIONS}
        onAction={onAction}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByTestId('selection-ai-toolbar')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Summarize' }))
    expect(onAction).toHaveBeenCalledWith(AI_ACTIONS[2])
  })

  it('clamps the toolbar inside the editor bounds and flips near the bottom', () => {
    const editor = createEditor(500, 300)
    const position = getToolbarPosition(
      editor as never,
      {
        startLineNumber: 20,
        startColumn: 10,
        endLineNumber: 20,
        endColumn: 40
      } as never
    )

    expect(position).not.toBeNull()
    expect(position?.left).toBeGreaterThanOrEqual(8)
    expect(position?.left).toBeLessThanOrEqual(62)
    expect(position?.flipped).toBe(true)
    expect(position?.top).toBeGreaterThanOrEqual(8)
  })

  it('closes on Escape', () => {
    const editor = createEditor()
    const onClose = vi.fn()
    render(
      <SelectionAiToolbar
        editorRef={{ current: editor as never }}
        selection={selection as never}
        actions={AI_ACTIONS}
        onAction={vi.fn()}
        onClose={onClose}
      />
    )

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
