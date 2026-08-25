import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const baseStyles = readFileSync(resolve(root, 'src/renderer/styles/index.css'), 'utf8')
const loadingStyles = readFileSync(
  resolve(root, 'src/renderer/components/LoadingFallback.css'),
  'utf8'
)
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

  it('keeps the document toolbar as the single draggable desktop chrome row', () => {
    expect(baseStyles).toContain(".toolbar[data-custom-window-chrome='true']")
    expect(baseStyles).toContain('.toolbar-window-controls')
    expect(baseStyles).toContain('.window-resize-handle-south-east')
    expect(baseStyles).not.toContain('app-region:')
  })

  it('lets the right-side Problems view fill its panel instead of reopening below the workspace', () => {
    expect(baseStyles).toMatch(/\.log-panel\s*\{[^}]*height:\s*100%/s)
    expect(baseStyles).toMatch(/\.log-structured\s*\{[^}]*height:\s*100%/s)
    expect(baseStyles).not.toMatch(/\.log-structured\s*\{[^}]*height:\s*200px/s)
    expect(baseStyles).toContain('@container (max-width: 360px)')
  })

  it('positions the research panel over the PDF instead of participating in workspace layout', () => {
    expect(baseStyles).toMatch(
      /\.research-panel\.overlay\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0 0 var\(--research-panel-bottom, 0\) auto;/s
    )
    expect(baseStyles).toMatch(
      /\.app-container\.has-research-panel > \.toolbar\s*\{[^}]*margin-right:\s*clamp\(320px, var\(--research-panel-width\), 520px\);/s
    )
    expect(loadingStyles).toMatch(
      /\.preview-pane > \.loading-fallback--panel\s*\{[^}]*position:\s*absolute;/s
    )
    expect(baseStyles).toMatch(
      /\.preview-pane\s*\{[^}]*position:\s*relative;[^}]*overflow:\s*hidden;/s
    )
    expect(baseStyles).toMatch(
      /@media \(max-width: 1199px\)[\s\S]*\.research-panel\.overlay \.research-resize-handle\s*\{[^}]*display:\s*none;/
    )
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
