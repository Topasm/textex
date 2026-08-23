import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('pre-React startup shell', () => {
  const html = readFileSync(resolve(process.cwd(), 'src/renderer/index.html'), 'utf8')
  const document = new DOMParser().parseFromString(html, 'text/html')

  it('provides accessible loading feedback before the renderer bundle mounts', () => {
    const shell = document.querySelector('#root > #startup-shell')

    expect(shell).not.toBeNull()
    expect(shell?.getAttribute('role')).toBe('status')
    expect(shell?.getAttribute('aria-busy')).toBe('true')
    expect(shell?.getAttribute('aria-label')).toBe('Starting TextEx')
    expect(document.querySelector('link[href="./styles/startupShell.css"]')).not.toBeNull()
  })

  it('does not hide startup failures behind a timed refresh', () => {
    expect(document.querySelector('meta[http-equiv="refresh"]')).toBeNull()
    expect(document.querySelectorAll('script')).toHaveLength(1)
    expect(document.querySelector('script[src="./main.tsx"]')).not.toBeNull()
  })
})
