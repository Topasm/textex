import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Holds the geometry scale.
 *
 * Type sizes and corner radii used to drift a pixel at a time — thirteen radii
 * and twelve font sizes across the renderer — because every rule was free to
 * invent its own. They now come from `flat.css`, and this keeps them there.
 */

const styleRoot = resolve(process.cwd(), 'src/renderer')

/**
 * `startupShell.css` paints before the bundle, so the tokens do not exist yet;
 * its lengths are literal on purpose. `flat.css` is where the tokens live.
 */
const SELF_CONTAINED = new Set(['startupShell.css'])

function styleSheets(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...styleSheets(full))
    else if (full.endsWith('.css')) out.push(full)
  }
  return out
}

const tokenDefinitions = readFileSync(join(styleRoot, 'styles/flat.css'), 'utf8')

function definedTokens(prefix: string): string[] {
  return [...tokenDefinitions.matchAll(new RegExp(`(${prefix}[a-z0-9-]*): `, 'gu'))].map(
    (match) => match[1]
  )
}

describe('design tokens', () => {
  it('defines a complete, ordered spacing grid', () => {
    const values = definedTokens('--space-').map((token) => Number(token.replace('--space-', '')))
    expect(values).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 32])
  })

  it('defines the type and radius scales', () => {
    expect(definedTokens('--font-')).toEqual([
      '--font-2xs',
      '--font-xs',
      '--font-sm',
      '--font-md',
      '--font-base',
      '--font-lg',
      '--font-xl',
      '--font-2xl',
      '--font-3xl',
      '--font-4xl'
    ])
    expect(definedTokens('--ui-radius-')).toEqual([
      '--ui-radius-subtle',
      '--ui-radius-control',
      '--ui-radius-panel',
      '--ui-radius-large',
      '--ui-radius-pill'
    ])
  })

  it('keeps every type size and corner radius on its scale', () => {
    const offScale: string[] = []
    for (const file of styleSheets(styleRoot)) {
      if (SELF_CONTAINED.has(file.split('/').pop()!)) continue
      const source = readFileSync(file, 'utf8')
      for (const [index, line] of source.split('\n').entries()) {
        const location = `${relative(process.cwd(), file)}:${index + 1}`
        if (/font-size: [\d.]+(px|rem|em)/u.test(line) && !line.includes('clamp(')) {
          offScale.push(`${location} ${line.trim()}`)
        }
        // `0` and `50%` are shapes, not scale steps.
        if (/border-radius: \d+px/u.test(line)) {
          offScale.push(`${location} ${line.trim()}`)
        }
      }
    }
    expect(offScale).toEqual([])
  })

  it('mirrors the icon scale that IconSystem exposes to components', () => {
    for (const [token, size] of [
      ['--ui-icon-size-micro', '12px'],
      ['--ui-icon-size-compact', '14px'],
      ['--ui-icon-size-control', '16px'],
      ['--ui-icon-size-feature', '18px'],
      ['--ui-icon-size-prominent', '22px'],
      ['--ui-icon-size-empty-state', '28px']
    ] as const) {
      expect(tokenDefinitions).toContain(`${token}: ${size};`)
    }
  })
})
