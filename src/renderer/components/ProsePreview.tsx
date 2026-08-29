import { Fragment, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import katex from 'katex'
import { documentRegistry } from '../models/documentRegistry'
import { useEditorStore } from '../store/useEditorStore'
import { projectLatexToProse, type ProseBlock } from '../../shared/proseProjection'
import { tokenizeProse, type ProseToken } from '../../shared/proseRender'
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

  const blocks = useMemo(() => {
    // The store's revision is the signal that the buffer changed; the text
    // itself is read from the registry.
    void revision
    if (!filePath) return null
    const snapshot = documentRegistry.snapshot(filePath)
    if (!snapshot) return null
    const document = projectLatexToProse(snapshot.text)
    return document.hasBody ? document.blocks : null
  }, [filePath, revision])

  if (!blocks) {
    return <div className="prose-preview prose-preview--empty">{t('prosePane.noBody')}</div>
  }

  return (
    <div className="prose-preview" role="document" aria-label={t('prosePane.previewLabel')}>
      <article className="prose-preview__sheet">
        {blocks.map((block) => (
          <Block key={`${block.kind}-${block.startLine}`} block={block} />
        ))}
      </article>
    </div>
  )
}

export default ProsePreview
