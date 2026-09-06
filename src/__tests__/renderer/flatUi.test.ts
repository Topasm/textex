import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const rendererEntry = readFileSync(resolve(root, 'src/renderer/main.tsx'), 'utf8')
const flatStyles = readFileSync(resolve(root, 'src/renderer/styles/flat.css'), 'utf8')

describe('flat renderer presentation contract', () => {
  it('loads the flat layer between base geometry and responsive overrides', () => {
    const baseImport = rendererEntry.indexOf("import './styles/index.css'")
    const flatImport = rendererEntry.indexOf("import './styles/flat.css'")
    const responsiveImport = rendererEntry.indexOf("import './styles/responsive.css'")

    expect(baseImport).toBeGreaterThan(-1)
    expect(flatImport).toBeGreaterThan(baseImport)
    expect(responsiveImport).toBeGreaterThan(flatImport)
  })

  it('keeps keyboard and forced-color cues visible without shadow-only focus', () => {
    expect(flatStyles).toContain('html .settings-input:focus-visible')
    expect(flatStyles).toContain('outline: 2px solid var(--ui-focus-ring)')
    expect(flatStyles).toContain('@media (forced-colors: active)')
    expect(flatStyles).toContain('outline-color: Highlight')
  })
})
