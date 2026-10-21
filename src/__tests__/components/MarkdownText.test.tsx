import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { MarkdownText, renderInline } from '../../renderer/components/ui/MarkdownText'

it('keeps LaTeX backslashes in rendered replies', () => {
  render(<MarkdownText text={'Write \\{x\\}, \\_ and end the line with \\\\.'} />)
  expect(screen.getByText('Write \\{x\\}, \\_ and end the line with \\\\.')).toBeInTheDocument()
})

it('treats backslash escapes literally only when requested', () => {
  render(
    <p data-testid="note">
      {renderInline('\\*not italic\\* and **bold**', 'n', { escapes: true })}
    </p>
  )
  const note = screen.getByTestId('note')
  expect(note).toHaveTextContent('*not italic* and bold')
  expect(note.querySelector('em')).toBeNull()
  expect(note.querySelector('strong')).toHaveTextContent('bold')
})
