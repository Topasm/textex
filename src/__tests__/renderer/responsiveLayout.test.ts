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
const settingsStyles = readFileSync(resolve(root, 'src/renderer/styles/settings.css'), 'utf8')
const sourcePaneStyles = readFileSync(
  resolve(root, 'src/renderer/components/WorkspaceSourcePane.css'),
  'utf8'
)
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
    expect(responsiveStyles).toContain('.editor-main-content > .editor-pane')
    expect(responsiveStyles).not.toContain('has-terminal-pane')
    expect(settingsStyles).toContain('@media (max-width: 840px)')
    expect(settingsStyles).toContain('--settings-navigation-width: 208px')
    expect(settingsStyles).toContain('.settings-sidebar')
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

  it('gives a pinned research panel its own column and keeps the PDF laid out when stacked', () => {
    // Side by side: the editor and PDF split what the panel leaves them.
    expect(baseStyles).toMatch(
      /\.editor-main-content > \.research-panel--side\s*\{[^}]*flex:\s*0 0 auto;/s
    )
    expect(baseStyles).toMatch(/\.editor-main-content\s*\{[^}]*position:\s*relative;/s)
    expect(sourcePaneStyles).toMatch(
      /\.pdf-workspace > \.preview-pane\s*\{[^}]*width:\s*calc\(100% - var\(--research-reserved, 0px\)\) !important;/s
    )
    expect(loadingStyles).toMatch(
      /\.editor-main-content > \.loading-fallback--panel\s*\{[^}]*width:\s*var\(--research-reserved, 0px\);/s
    )
    // Stacked: the panel covers the PDF column below the tab strip, and the
    // inactive surface is hidden without losing its box.
    expect(baseStyles).toMatch(
      /\.research-layout-stacked > \.research-panel--stacked\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*var\(--preview-stack-tabs-height\) 0 0 var\(--preview-left, 0px\);/s
    )
    expect(baseStyles).toMatch(
      /\.research-layout-stacked\[data-stack-view='preview'\] > \.research-panel--stacked,\s*\.research-layout-stacked\[data-stack-view='research'\] > \.preview-pane > :not\(\.preview-stack-tabs\)\s*\{[^}]*visibility:\s*hidden;/s
    )
    expect(responsiveStyles).toMatch(
      /\.editor-main-content\.research-layout-stacked > \.research-panel--stacked\s*\{[^}]*inset:\s*calc\(50% \+ var\(--preview-stack-tabs-height\)\) 0 0 0;/s
    )
    // The toolbar no longer reserves a right margin for the panel.
    expect(baseStyles).not.toContain('--research-panel-width')
    expect(baseStyles).toMatch(
      /\.preview-pane\s*\{[^}]*position:\s*relative;[^}]*overflow:\s*hidden;/s
    )
  })

  it('keeps the auto-hide rail as an overlay inside the pane row', () => {
    expect(baseStyles).toMatch(
      /\.research-panel\.overlay\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0 0 0 auto;/s
    )
    expect(baseStyles).toMatch(
      /@media \(max-width: 1199px\)[\s\S]*\.research-panel\.overlay \.research-resize-handle\s*\{[^}]*display:\s*none;/
    )
  })

  it('leaves nothing but the grab rail on screen when the research panel auto-hides', () => {
    // The rail is the panel's own left edge, so its children have to be hidden
    // or the panel's padding and first control column stay visible.
    expect(baseStyles).toMatch(
      /\.research-panel\.overlay\.research-panel-auto-hide\.research-panel-entered > \*\s*\{[^}]*opacity:\s*0;/s
    )
    expect(baseStyles).toMatch(
      /\.research-panel\.overlay\.research-panel-auto-hide\.research-panel-entered:hover > \*\s*\{[^}]*opacity:\s*1;/s
    )
    expect(baseStyles).toMatch(
      /\.research-panel\.overlay\.research-panel-auto-hide\.research-panel-entered\s*\{[^}]*background:\s*transparent;/s
    )
  })

  it('lets a long file name truncate instead of pushing the row actions over it', () => {
    expect(baseStyles).toMatch(
      /\.file-tree-name\s*\{[^}]*min-width:\s*0;[^}]*white-space:\s*nowrap;/s
    )
    expect(baseStyles).toMatch(/\.file-tree-actions\s*\{[^}]*flex-shrink:\s*0;/s)
  })

  it('disables resize handles while compact CSS overrides stored pane sizes', () => {
    expect(responsiveStyles).toMatch(
      /\.sidebar-wrapper \.sidebar-resize-handle\s*\{\s*display: none;/
    )
    expect(responsiveStyles).toMatch(
      /\.editor-main-content > \.split-divider\s*\{\s*display: none;/
    )
    expect(responsiveStyles).toContain('.sidebar-drawer-backdrop')
    expect(responsiveStyles).toContain('.sidebar-drawer-backdrop-exiting')
  })

  it('keeps compact transitions and boundaries compatible with accessibility preferences', () => {
    expect(responsiveStyles).toContain('@media (prefers-reduced-motion: reduce)')
    expect(responsiveStyles).toContain('@media (forced-colors: active)')
    expect(responsiveStyles).toContain('forced-color-adjust: none')
  })
})
