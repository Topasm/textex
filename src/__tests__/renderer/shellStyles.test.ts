import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The app shell must be styled by stylesheets that are always present.
 *
 * `main.tsx` imports a fixed set of stylesheets; every other `.css` file rides
 * along with the component that imports it, so it is absent until that chunk is
 * fetched. v1.1.1 shipped `.editor-surface` in the lazily loaded prose view's
 * sheet, which left Monaco with no height for anyone who never opened the prose
 * view — that is, everyone.
 *
 * A class App renders may legitimately have no rule of its own, because CSS can
 * style it structurally (`.panel-tabs > button`). What must never happen is a
 * class that *is* defined, but only inside a lazily loaded stylesheet.
 */

const root = resolve(process.cwd(), 'src/renderer')

const eagerPaths = (() => {
  const main = readFileSync(resolve(root, 'main.tsx'), 'utf8')
  return [...main.matchAll(/^import '(\.\/styles\/[\w.-]+\.css)'$/gmu)].map((match) =>
    resolve(root, match[1])
  )
})()

function allStylesheets(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...allStylesheets(full))
    else if (full.endsWith('.css')) out.push(full)
  }
  return out
}

/** `startupShell.css` is linked from index.html, so it is eager too. */
const lazyPaths = allStylesheets(root).filter(
  (file) => !eagerPaths.includes(file) && !file.endsWith('startupShell.css')
)

/** Comments mention selectors without defining them. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//gu, '')
}

function readCss(file: string): string {
  return withoutComments(readFileSync(file, 'utf8'))
}

const eagerCss = eagerPaths.map(readCss).join('\n')
const appSource = readFileSync(resolve(root, 'App.tsx'), 'utf8')

function definesClass(css: string, name: string): boolean {
  return new RegExp(`\\.${name}(?![\\w-])`, 'u').test(css)
}

/** Static class names on markup App renders itself. */
function shellClassNames(): string[] {
  const names = new Set<string>()
  for (const match of appSource.matchAll(/className=(?:"([^"]+)"|\{`([^`]*)`\})/gu)) {
    const literal = match[1] ?? match[2] ?? ''
    // A `${…}` builds part of a name, so the fragment beside it is not one.
    if (/\$\{/u.test(literal)) {
      for (const token of literal
        .split(/\$\{[^}]*\}/u)
        .join(' ')
        .split(/\s+/)) {
        if (/^[a-z][\w-]*[\w]$/u.test(token)) names.add(token)
      }
      continue
    }
    for (const token of literal.split(/\s+/)) {
      if (/^[a-z][\w-]*$/u.test(token)) names.add(token)
    }
  }
  return [...names]
}

describe('app shell styles', () => {
  it('resolves the eagerly loaded stylesheets from main.tsx', () => {
    expect(eagerPaths.length).toBeGreaterThan(0)
    expect(eagerCss).toContain('.editor-pane')
  })

  it('never leaves a shell class defined only in a lazy stylesheet', () => {
    const stranded: string[] = []
    for (const name of shellClassNames()) {
      if (definesClass(eagerCss, name)) continue
      for (const file of lazyPaths) {
        if (definesClass(readCss(file), name)) {
          stranded.push(`.${name} is only in ${relative(process.cwd(), file)}`)
        }
      }
    }
    expect(stranded).toEqual([])
  })

  it('lets the prose rendering scroll inside the preview pane', () => {
    // `.preview-pane` sizes its child by height rather than as a flex item,
    // the way the PDF's own `.preview-container` is written. v1.2.0 gave the
    // prose rendering `flex: 1` instead, so it grew to the height of its
    // content: nothing overflowed it, nothing scrolled, and the pane clipped
    // whatever did not fit.
    const rule = /\.prose-preview\s*\{([^}]*)\}/u.exec(
      readCss(resolve(root, 'components/ProsePreview.css'))
    )?.[1]

    expect(rule).toBeDefined()
    expect(rule).toMatch(/height:\s*100%/u)
    expect(rule).toMatch(/overflow-y:\s*auto/u)
    expect(eagerCss).toMatch(/\.preview-container\s*\{[^}]*height:\s*100%/u)

    const sourceRule = /\.prose-pane__source\s*\{([^}]*)\}/u.exec(
      readCss(resolve(root, 'components/ProsePane.css'))
    )?.[1]
    expect(sourceRule).toMatch(/min-height:\s*0/u)
    expect(sourceRule).toMatch(/overflow-y:\s*auto/u)
  })

  it('keeps the editor height chain eager', () => {
    // The regression this file exists for.
    for (const selector of ['.editor-surface', '.editor-surface__tex']) {
      expect(eagerCss).toContain(selector)
    }
    expect(readCss(resolve(root, 'components/ProsePane.css'))).not.toContain('.editor-surface')
  })

  it('aligns the paired prose content below the source tab and preview chrome', () => {
    const sourceCss = readCss(resolve(root, 'components/ProsePane.css'))
    const previewCss = readCss(resolve(root, 'components/ProsePreview.css'))

    expect(eagerCss).toMatch(/html \.tab-bar\s*\{[^}]*height:\s*34px/u)
    expect(sourceCss).toMatch(/\.prose-pane__header\s*\{[^}]*height:\s*38px/u)
    expect(previewCss).toMatch(/\.prose-preview__header\s*\{[^}]*height:\s*72px/u)
  })

  it('animates the paired workspace together and respects reduced motion', () => {
    expect(eagerCss).toContain(".editor-surface[data-prose-mode='true'] > .prose-pane")
    expect(eagerCss).toContain(".preview-pane[data-workspace-view='prose'] > .prose-preview")
    expect(eagerCss).toContain('@keyframes workspace-paired-view-enter')
    expect(eagerCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.preview-pane\[data-workspace-view\] > \.prose-preview\s*\{[^}]*animation:\s*none/u
    )
  })
})
