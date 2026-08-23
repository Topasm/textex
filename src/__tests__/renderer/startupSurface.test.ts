import { screen } from '@testing-library/dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { showStartupError } from '../../renderer/services/startupSurface'

describe('showStartupError', () => {
  let root: HTMLDivElement

  beforeEach(() => {
    root = document.createElement('div')
    root.innerHTML = '<div id="startup-shell">Starting…</div>'
    document.body.replaceChildren(root)
  })

  it('replaces the loading shell with a persistent accessible error surface', () => {
    showStartupError(root, new Error('Native settings could not be loaded'))

    expect(document.getElementById('startup-shell')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('TextEx could not start')
    expect(screen.getByRole('alert')).toHaveTextContent('Native settings could not be loaded')
  })

  it('renders unknown failures as text rather than markup', () => {
    showStartupError(root, '<img src=x onerror=alert(1)>')

    expect(root.querySelector('img')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('<img src=x onerror=alert(1)>')
  })
})
