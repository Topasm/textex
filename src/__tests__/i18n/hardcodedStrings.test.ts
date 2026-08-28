import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guards the renderer against user-facing English literals.
 *
 * Every locale is kept at full key parity by `translations.test.ts`, which only
 * proves the translations that exist are complete. This test proves components
 * actually go through them, so a new feature cannot ship a panel that stays
 * English in all seven languages.
 */

const root = resolve(process.cwd(), 'src/renderer')

/**
 * Literals that are correct as-is: proper nouns, technical identifiers that are
 * spelled the same in every supported language, and language names, which are
 * conventionally shown in their own language.
 */
const ALLOWED = new Set([
  'TextEx',
  'Ask',
  'DOI',
  'arXiv',
  'ORCID',
  'GitHub',
  'URL',
  'SSH URL',
  'Zotero',
  'LaTeX',
  'BibTeX',
  'BibLaTeX',
  'Claude Code',
  'Codex CLI',
  'AI Draft',
  'English (US)'
])

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
    } else if (full.endsWith('.tsx')) {
      out.push(full)
    }
  }
  return out
}

/** Prose, not a css class, id, url, format string, or single technical token. */
function looksLikeProse(value: string): boolean {
  if (ALLOWED.has(value)) return false
  if (!/^[A-Z]/u.test(value)) return false
  if (!/^[\p{L}\p{N}\s.,!?'’&()·:;/-]+$/u.test(value)) return false
  // A lone capitalized word is usually an identifier; prose has a space.
  return /\s/u.test(value) && /[a-z]/u.test(value)
}

const findings: string[] = []

for (const file of sourceFiles(root)) {
  const source = readFileSync(file, 'utf8')
  const lines = source.split('\n')
  for (const [index, line] of lines.entries()) {
    if (/^\s*(import|\/\/|\*|\/\*)/u.test(line)) continue
    const location = `${relative(process.cwd(), file)}:${index + 1}`

    for (const match of line.matchAll(/(aria-label|title|placeholder|alt)="([^"]+)"/gu)) {
      if (looksLikeProse(match[2])) findings.push(`${location} ${match[1]}="${match[2]}"`)
    }
    for (const match of line.matchAll(/>([^<>{}\n]+)</gu)) {
      const text = match[1].trim()
      if (looksLikeProse(text)) findings.push(`${location} text "${text}"`)
    }
  }
}

describe('renderer translation coverage', () => {
  it('routes every user-facing string through i18n', () => {
    expect(findings).toEqual([])
  })
})
