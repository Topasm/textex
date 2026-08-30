import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, Link2, PencilLine } from 'lucide-react'
import katex from 'katex'
import { documentRegistry } from '../models/documentRegistry'
import { useEditorStore } from '../store/useEditorStore'
import { useProjectStore } from '../store/useProjectStore'
import { proseAnchorFor, useUiStore } from '../store/useUiStore'
import { logError } from '../utils/errorMessage'
import { projectLatexToProse, type ProseBlock } from '../../shared/proseProjection'
import { proseTokensToText, tokenizeProse, type ProseToken } from '../../shared/proseRender'
import { latexProseToMarkdown } from '../../shared/proseInline'
import { ICON_SIZE } from './ui/IconSystem'
import 'katex/dist/katex.min.css'
import './ProsePreview.css'

/**
 * The rendered half of the prose view, in the slot the PDF normally occupies.
 *
 * Rendered from the projection's blocks rather than by parsing the Markdown
 * back: the projection already preserved citations, references and math as
 * themselves, and re-parsing would flatten them into plain text. Math goes
 * through the KaTeX the app already ships.
 */

function renderMath(tex: string, displayMode: boolean): { __html: string } {
  return {
    __html: katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      output: 'html'
    })
  }
}

function Inline({ tokens }: { tokens: readonly ProseToken[] }) {
  return (
    <>
      {tokens.map((token, index) => {
        switch (token.kind) {
          case 'text':
            return <Fragment key={index}>{token.text}</Fragment>
          case 'strong':
            return (
              <strong key={index}>
                <Inline tokens={token.children} />
              </strong>
            )
          case 'emphasis':
            return (
              <em key={index}>
                <Inline tokens={token.children} />
              </em>
            )
          case 'code':
            return (
              <code key={index}>
                <Inline tokens={token.children} />
              </code>
            )
          case 'citation':
            return (
              <span key={index} className="prose-chip prose-chip--cite" title={token.source}>
                {token.keys.join(', ')}
              </span>
            )
          case 'reference':
            return (
              <span key={index} className="prose-chip prose-chip--ref" title={token.source}>
                {token.target}
              </span>
            )
          case 'math':
            return (
              <span
                key={index}
                className="prose-math"
                title={token.source}
                dangerouslySetInnerHTML={renderMath(token.tex, false)}
              />
            )
          case 'raw':
            return (
              <code key={index} className="prose-raw">
                {token.source}
              </code>
            )
        }
      })}
    </>
  )
}

/** `\includegraphics[…]{path}` — the path, without any options. */
const INCLUDEGRAPHICS = /\\includegraphics\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/u
const CAPTION = /\\caption\s*\{([\s\S]*?)\}\s*(?:\n|$)/u

/** LaTeX lets the extension be omitted, so try the usual ones in turn. */
const GRAPHICS_EXTENSIONS = ['', '.png', '.jpg', '.jpeg', '.pdf', '.gif', '.webp', '.svg']

const imageCache = new Map<string, string>()

function joinPath(root: string, relative: string): string {
  const separator = root.includes('\\') && !root.includes('/') ? '\\' : '/'
  return `${root.replace(/[\\/]$/u, '')}${separator}${relative.replace(/^[\\/]/u, '')}`
}

/**
 * Resolves a figure's graphic against the project and reads it as a data URL.
 *
 * A paper's figures are half of what the author is checking, so the preview
 * shows the real image rather than the path that points at it.
 */
function useGraphic(reference: string | null): string | null {
  const projectRoot = useProjectStore((state) => state.projectRoot)
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!reference || !projectRoot) {
      setDataUrl(null)
      return
    }

    let cancelled = false
    const attempt = async (): Promise<void> => {
      for (const extension of GRAPHICS_EXTENSIONS) {
        const path = joinPath(projectRoot, `${reference}${extension}`)
        const cached = imageCache.get(path)
        if (cached) {
          if (!cancelled) setDataUrl(cached)
          return
        }
        try {
          const { data } = await window.api.readFileBase64(path)
          imageCache.set(path, data)
          if (!cancelled) setDataUrl(data)
          return
        } catch {
          // Try the next extension; a genuinely missing file falls through.
        }
      }
      if (!cancelled) setDataUrl(null)
    }

    void attempt().catch((error) => logError('ProsePreview:graphic', error))
    return () => {
      cancelled = true
    }
  }, [projectRoot, reference])

  return dataUrl
}

function Figure({ block }: { block: ProseBlock }) {
  const reference = INCLUDEGRAPHICS.exec(block.source)?.[1]?.trim() ?? null
  const raw = CAPTION.exec(block.source)?.[1]?.trim()
  // A caption is LaTeX prose, so it goes through the same projection the body
  // does before it is tokenized for display.
  const caption = raw ? tokenizeProse(latexProseToMarkdown(raw)) : null
  const dataUrl = useGraphic(reference)

  if (!dataUrl) {
    return (
      <figure className="prose-preview__protected">
        <figcaption>{block.protectedLabel}</figcaption>
        <pre>{block.source}</pre>
      </figure>
    )
  }

  return (
    <figure className="prose-preview__figure">
      <img src={dataUrl} alt={caption ? proseTokensToText(caption) : (reference ?? '')} />
      {caption && (
        <figcaption>
          <Inline tokens={caption} />
        </figcaption>
      )}
    </figure>
  )
}

const MATH_ENVIRONMENTS = new Set(['math', 'equation', 'equation*', 'align', 'align*', 'gather'])

/** Strips the environment or delimiters so KaTeX sees only the body. */
function mathBody(source: string): string {
  const environment = /^\s*\\begin\s*\{([^}]+)\}([\s\S]*?)\\end\s*\{\1\}\s*$/u.exec(source)
  if (environment) return environment[2].trim()
  return source
    .trim()
    .replace(/^\\\[|\\\]$/gu, '')
    .replace(/^\$\$|\$\$$/gu, '')
    .trim()
}

function Block({ block }: { block: ProseBlock }) {
  const { t } = useTranslation()

  if (block.kind === 'heading') {
    const level = Math.min(3, (block.level ?? 1) + 1)
    const Heading = `h${level}` as 'h1' | 'h2' | 'h3'
    return <Heading className="prose-preview__heading">{block.title || block.markdown}</Heading>
  }

  if (block.kind === 'prose') {
    return (
      <p className="prose-preview__paragraph">
        <Inline tokens={tokenizeProse(block.markdown)} />
      </p>
    )
  }

  if (block.kind !== 'protected') return null

  if (INCLUDEGRAPHICS.test(block.source)) return <Figure block={block} />

  if (MATH_ENVIRONMENTS.has(block.protectedLabel ?? '')) {
    return (
      <div
        className="prose-preview__math"
        aria-label={t('prosePane.mathBlock')}
        dangerouslySetInnerHTML={renderMath(mathBody(block.source), true)}
      />
    )
  }

  return (
    <figure className="prose-preview__protected">
      <figcaption>{block.protectedLabel}</figcaption>
      <pre>{block.source}</pre>
    </figure>
  )
}

export function ProsePreview() {
  const { t } = useTranslation()
  const filePath = useEditorStore((state) => state.filePath)
  const revision = useEditorStore((state) => state.revision)
  const proseAnchor = useUiStore((state) => proseAnchorFor(state, filePath))
  const previewRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLElement>(null)
  const scrollFrameRef = useRef<number | null>(null)
  const suppressScrollUntilRef = useRef(0)

  const blocks = useMemo(() => {
    // The store's revision is the signal that the buffer changed; the text
    // itself is read from the registry.
    void revision
    if (!filePath) return null
    const snapshot = documentRegistry.snapshot(filePath)
    if (!snapshot) return null
    const document = projectLatexToProse(snapshot.text)
    return document.hasBody
      ? document.blocks.filter(
          (block) =>
            block.kind === 'heading' || block.kind === 'prose' || block.kind === 'protected'
        )
      : null
  }, [filePath, revision])
  const activeBlock = useMemo(() => {
    if (!blocks || !proseAnchor) return null
    return (
      blocks.find(
        (block) => proseAnchor.line >= block.startLine && proseAnchor.line <= block.endLine
      ) ??
      [...blocks].reverse().find((block) => block.startLine <= proseAnchor.line) ??
      null
    )
  }, [blocks, proseAnchor])

  const navigateToBlock = useCallback(
    (block: ProseBlock): void => {
      if (!filePath) return
      const ui = useUiStore.getState()
      ui.setProseAnchor(filePath, block.startLine, 'preview')
      if (block.kind === 'protected') {
        ui.setProseMode(filePath, false)
        useEditorStore.getState().requestJumpToLine(block.startLine, 1)
      }
    },
    [filePath]
  )

  const publishScroll = useCallback(() => {
    if (Date.now() < suppressScrollUntilRef.current || scrollFrameRef.current !== null) return
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null
      if (Date.now() < suppressScrollUntilRef.current || !filePath) return
      const preview = previewRef.current
      const sheet = sheetRef.current
      if (!preview || !sheet) return

      const marker = preview.getBoundingClientRect().top + 84
      const candidates = [...sheet.querySelectorAll<HTMLElement>('[data-prose-line]')]
      let active = candidates[0]
      for (const candidate of candidates) {
        if (candidate.getBoundingClientRect().top > marker) break
        active = candidate
      }
      const line = Number(active?.dataset.proseLine)
      if (Number.isFinite(line)) {
        useUiStore.getState().setProseAnchor(filePath, line, 'preview', 'scroll')
      }
    })
  }, [filePath])

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current)
    },
    []
  )

  // Follow the caret in the Markdown source, and a switch back from TeX.
  useEffect(() => {
    if (!blocks || !proseAnchor || proseAnchor.origin === 'preview') return
    const targetBlock =
      blocks.find(
        (block) => proseAnchor.line >= block.startLine && proseAnchor.line <= block.endLine
      ) ?? [...blocks].reverse().find((block) => block.startLine <= proseAnchor.line)
    const target = targetBlock
      ? sheetRef.current?.querySelector(`[data-prose-line="${targetBlock.startLine}"]`)
      : null
    if (target && typeof target.scrollIntoView === 'function') {
      suppressScrollUntilRef.current = Date.now() + 120
      target.scrollIntoView({ block: proseAnchor.intent === 'scroll' ? 'start' : 'nearest' })
    }
  }, [blocks, proseAnchor])

  if (!blocks) {
    return <div className="prose-preview prose-preview--empty">{t('prosePane.noBody')}</div>
  }

  return (
    <div
      className="prose-preview"
      role="document"
      aria-label={t('prosePane.previewLabel')}
      ref={previewRef}
      onScroll={publishScroll}
    >
      <header className="prose-preview__header">
        <div className="prose-preview__header-primary">
          <span className="prose-preview__identity">
            <Eye size={ICON_SIZE.control} aria-hidden="true" />
            <span>{t('prosePane.livePreview')}</span>
          </span>
          {proseAnchor && (
            <span className="prose-preview__line">
              {t('prosePane.sourceLine', { line: proseAnchor.line })}
            </span>
          )}
        </div>
        <div className="prose-preview__header-secondary">
          <span className="prose-preview__following">
            <Link2 size={ICON_SIZE.micro} aria-hidden="true" />
            {t('prosePane.following')}
          </span>
        </div>
      </header>
      <article className="prose-preview__sheet" ref={sheetRef}>
        {blocks.map((block) => {
          const isActive = activeBlock?.startLine === block.startLine
          return (
            <div
              key={`${block.kind}-${block.startLine}`}
              data-prose-line={block.startLine}
              className={`prose-preview__block${isActive ? ' prose-preview__block--active' : ''}`}
              aria-current={isActive ? 'location' : undefined}
              // Clicking a passage puts the caret on it in the Markdown source,
              // which is how the author gets from reading to editing.
              onClick={() => navigateToBlock(block)}
            >
              <Block block={block} />
              <button
                type="button"
                className="prose-preview__edit"
                aria-label={t(
                  block.kind === 'protected' ? 'prosePane.editBlockTex' : 'prosePane.editBlock'
                )}
                title={t(
                  block.kind === 'protected' ? 'prosePane.editBlockTex' : 'prosePane.editBlock'
                )}
                onClick={(event) => {
                  event.stopPropagation()
                  navigateToBlock(block)
                }}
              >
                <PencilLine size={ICON_SIZE.compact} aria-hidden="true" />
              </button>
            </div>
          )
        })}
      </article>
    </div>
  )
}

export default ProsePreview
