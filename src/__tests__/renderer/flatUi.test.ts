import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const rendererEntry = readFileSync(resolve(root, 'src/renderer/main.tsx'), 'utf8')
const flatStyles = readFileSync(resolve(root, 'src/renderer/styles/flat.css'), 'utf8')
const startupStyles = readFileSync(resolve(root, 'src/renderer/styles/startupShell.css'), 'utf8')

describe('flat renderer presentation contract', () => {
  it('loads the flat layer between base geometry and responsive overrides', () => {
    const baseImport = rendererEntry.indexOf("import './styles/index.css'")
    const flatImport = rendererEntry.indexOf("import './styles/flat.css'")
    const responsiveImport = rendererEntry.indexOf("import './styles/responsive.css'")

    expect(baseImport).toBeGreaterThan(-1)
    expect(flatImport).toBeGreaterThan(baseImport)
    expect(responsiveImport).toBeGreaterThan(flatImport)
  })

  it('defines reusable surface, radius, elevation, and contrast roles', () => {
    expect(flatStyles).toContain('--ui-radius-control: 4px')
    expect(flatStyles).toContain('--ui-radius-panel: 6px')
    expect(flatStyles).toContain('--ui-surface-raised:')
    expect(flatStyles).toContain('--ui-selected-bg:')
    expect(flatStyles).toContain('--ui-focus-ring:')
    expect(flatStyles).toContain('--ui-shadow-popover:')
    expect(flatStyles).toContain("[data-theme='high-contrast']")
    expect(flatStyles).toContain('--accent-contrast: #000000')
  })

  it('defines one compact outline icon scale across dense controls', () => {
    expect(flatStyles).toContain('--ui-icon-size-micro: 12px')
    expect(flatStyles).toContain('--ui-icon-size-compact: 14px')
    expect(flatStyles).toContain('--ui-icon-size-control: 16px')
    expect(flatStyles).toContain('--ui-icon-stroke: 1.75')
    expect(flatStyles).toContain('html .file-tree-icon > .ui-icon')
    expect(flatStyles).toContain('html .status-bar .ui-icon')
  })

  it('flattens the main chrome while preserving explicit selected states', () => {
    for (const selector of [
      'html .toolbar',
      'html .tab-bar',
      'html .tab.active',
      'html .sidebar',
      'html .file-tree-item.selected',
      'html .status-bar'
    ]) {
      expect(flatStyles).toContain(selector)
    }

    expect(flatStyles).toMatch(/html \.status-bar\s*\{[^}]*border-top: 1px solid/s)
    expect(flatStyles).toMatch(/html \.tab\.active\s*\{[^}]*border-top-color: var\(--accent\)/s)
  })

  it('reserves limited elevation for overlays and groups content rows', () => {
    for (const selector of [
      'html .modal-content',
      'html .command-palette',
      'html .settings-section',
      'html .research-profile-section',
      'html .home-recent-item'
    ]) {
      expect(flatStyles).toContain(selector)
    }

    expect(flatStyles).toMatch(/html \.home-recent-item\s*\{[^}]*border-bottom: 1px solid/s)
    expect(flatStyles).not.toContain('backdrop-filter')
    expect(flatStyles).not.toMatch(/(?:48|60|72)px/)
  })

  it('keeps keyboard and forced-color cues visible without shadow-only focus', () => {
    expect(flatStyles).toContain('html .settings-input:focus-visible')
    expect(flatStyles).toContain('outline: 2px solid var(--ui-focus-ring)')
    expect(flatStyles).toContain('@media (forced-colors: active)')
    expect(flatStyles).toContain('outline-color: Highlight')
  })

  it('uses the same flat boundaries before React mounts', () => {
    expect(startupStyles).toMatch(/\.startup-shell__toolbar\s*\{[^}]*height: 38px/s)
    expect(startupStyles).toMatch(/\.startup-shell__status\s*\{[^}]*border-top: 1px solid/s)
    expect(startupStyles).toMatch(/\.startup-error__card\s*\{[^}]*border-radius: 6px/s)
  })
})
