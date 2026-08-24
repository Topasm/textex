import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const responsiveStyles = readFileSync(resolve(root, 'src/renderer/styles/responsive.css'), 'utf8')
const rendererEntry = readFileSync(resolve(root, 'src/renderer/main.tsx'), 'utf8')
const tauriConfig = JSON.parse(
  readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8')
) as {
  app: { windows: Array<{ minWidth?: number }> }
}

describe('responsive desktop layout contract', () => {
  it('loads the compact stylesheet after the base renderer styles', () => {
    const baseImport = rendererEntry.indexOf("import './styles/index.css'")
    const responsiveImport = rendererEntry.indexOf("import './styles/responsive.css'")

    expect(baseImport).toBeGreaterThan(-1)
    expect(responsiveImport).toBeGreaterThan(baseImport)
  })

  it('compacts chrome at the Tauri minimum width and stacks constrained panes', () => {
    expect(tauriConfig.app.windows[0]?.minWidth).toBe(800)
    expect(responsiveStyles).toContain('@media (max-width: 840px)')
    expect(responsiveStyles).toContain('.editor-main-content.has-terminal-pane')
    expect(responsiveStyles).toContain('.editor-main-content:not(.has-terminal-pane)')
    expect(responsiveStyles).toContain('.settings-sidebar')
  })

  it('disables resize handles while compact CSS overrides stored pane sizes', () => {
    expect(responsiveStyles).toMatch(
      /\.sidebar-wrapper \.sidebar-resize-handle\s*\{\s*display: none;/
    )
    expect(responsiveStyles).toMatch(
      /\.editor-main-content\.has-terminal-pane > \.split-divider\s*\{\s*display: none;/
    )
  })

  it('keeps compact transitions and boundaries compatible with accessibility preferences', () => {
    expect(responsiveStyles).toContain('@media (prefers-reduced-motion: reduce)')
    expect(responsiveStyles).toContain('@media (forced-colors: active)')
    expect(responsiveStyles).toContain('forced-color-adjust: none')
  })
})
