import { Fragment, useMemo, type ReactNode } from 'react'

/**
 * Minimal, dependency-free Markdown renderer for trusted-but-unverified text
 * (AI chat responses, reference metadata). It renders directly to React
 * elements — never `dangerouslySetInnerHTML` — so there is no HTML/script
 * injection surface regardless of what the source text contains.
 *
 * Supports the subset AI responses actually use: headings, paragraphs,
 * ordered/unordered lists, fenced code blocks, blockquotes, and inline
 * bold/italic/code/links. Anything else is shown as plain text.
 */

interface MarkdownTextProps {
  text: string
  className?: string
}

type Block =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'code'; code: string }
  | { kind: 'quote'; text: string }

const HEADING_RE = /^(#{1,6})\s+(.*)$/u
const ORDERED_ITEM_RE = /^\s{0,3}\d+[.)]\s+(.*)$/u
const UNORDERED_ITEM_RE = /^\s{0,3}[-*+]\s+(.*)$/u
const QUOTE_RE = /^\s{0,3}>\s?(.*)$/u
const FENCE_RE = /^\s{0,3}```/u
const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/gu, '\n').split('\n')
  const blocks: Block[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    blocks.push({ kind: 'paragraph', text: paragraph.join(' ').trim() })
    paragraph = []
  }
  const flushList = () => {
    if (!list) return
    blocks.push({ kind: 'list', ordered: list.ordered, items: list.items })
    list = null
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]

    if (FENCE_RE.test(line)) {
      flushParagraph()
      flushList()
      const code: string[] = []
      i += 1
      while (i < lines.length && !FENCE_RE.test(lines[i])) {
        code.push(lines[i])
        i += 1
      }
      blocks.push({ kind: 'code', code: code.join('\n') })
      continue
    }

    if (!line.trim()) {
      flushParagraph()
      flushList()
      continue
    }

    const heading = HEADING_RE.exec(line)
    if (heading) {
      flushParagraph()
      flushList()
      blocks.push({
        kind: 'heading',
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        text: heading[2].trim()
      })
      continue
    }

    const quote = QUOTE_RE.exec(line)
    if (quote) {
      flushParagraph()
      flushList()
      blocks.push({ kind: 'quote', text: quote[1] })
      continue
    }

    const ordered = ORDERED_ITEM_RE.exec(line)
    const unordered = ordered ? null : UNORDERED_ITEM_RE.exec(line)
    if (ordered || unordered) {
      flushParagraph()
      const isOrdered = Boolean(ordered)
      const itemText = (ordered ?? unordered)![1]
      if (!list || list.ordered !== isOrdered) {
        flushList()
        list = { ordered: isOrdered, items: [] }
      }
      list.items.push(itemText)
      continue
    }

    flushList()
    paragraph.push(line.trim())
  }
  flushParagraph()
  flushList()
  return blocks
}

type InlineToken =
  | { kind: 'text'; value: string }
  | { kind: 'bold'; value: string }
  | { kind: 'italic'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'link'; value: string; href: string }

const INLINE_RE = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*]+)\*|_([^_]+)_/gu
const SAFE_LINK_RE = /^(https?:|mailto:)/iu

function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  INLINE_RE.lastIndex = 0
  while ((match = INLINE_RE.exec(text))) {
    if (match.index > lastIndex)
      tokens.push({ kind: 'text', value: text.slice(lastIndex, match.index) })
    if (match[1] !== undefined) tokens.push({ kind: 'bold', value: match[1] })
    else if (match[2] !== undefined) tokens.push({ kind: 'code', value: match[2] })
    else if (match[3] !== undefined) tokens.push({ kind: 'link', value: match[3], href: match[4] })
    else if (match[5] !== undefined) tokens.push({ kind: 'italic', value: match[5] })
    else if (match[6] !== undefined) tokens.push({ kind: 'italic', value: match[6] })
    lastIndex = INLINE_RE.lastIndex
  }
  if (lastIndex < text.length) tokens.push({ kind: 'text', value: text.slice(lastIndex) })
  return tokens
}

/** Renders inline bold/italic/code/link spans. Exported for reuse by other
 * line-level markdown renderers (e.g. the Notes panel's live-preview lines)
 * that don't need MarkdownText's block parsing. */
export function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return parseInline(text).map((token, index) => {
    const key = `${keyPrefix}-${index}`
    switch (token.kind) {
      case 'bold':
        return <strong key={key}>{renderInline(token.value, key)}</strong>
      case 'italic':
        return <em key={key}>{renderInline(token.value, key)}</em>
      case 'code':
        return (
          <code key={key} className="markdown-inline-code">
            {token.value}
          </code>
        )
      case 'link': {
        if (!SAFE_LINK_RE.test(token.href.trim()))
          return <Fragment key={key}>{token.value}</Fragment>
        return (
          <button
            key={key}
            type="button"
            className="markdown-link"
            onClick={() => void window.api.openExternal(token.href)}
          >
            {token.value}
          </button>
        )
      }
      default:
        return <Fragment key={key}>{token.value}</Fragment>
    }
  })
}

export function MarkdownText({ text, className }: MarkdownTextProps) {
  const blocks = useMemo(() => parseBlocks(text), [text])
  return (
    <div className={className ? `markdown-text ${className}` : 'markdown-text'}>
      {blocks.map((block, index) => {
        const key = `block-${index}`
        switch (block.kind) {
          case 'heading': {
            const Tag = HEADING_TAGS[block.level - 1]
            return <Tag key={key}>{renderInline(block.text, key)}</Tag>
          }
          case 'quote':
            return <blockquote key={key}>{renderInline(block.text, key)}</blockquote>
          case 'code':
            return (
              <pre key={key} className="markdown-code-block">
                <code>{block.code}</code>
              </pre>
            )
          case 'list': {
            const ListTag = block.ordered ? 'ol' : 'ul'
            return (
              <ListTag key={key}>
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
                ))}
              </ListTag>
            )
          }
          case 'paragraph':
          default:
            return <p key={key}>{renderInline(block.text, key)}</p>
        }
      })}
    </div>
  )
}
