import type { BibEntry } from '../../shared/types'

interface CitationTooltipProps {
  entries: BibEntry[]
  x: number
  y: number
  containerRect: DOMRect
}

function CitationTooltip({ entries, x, y, containerRect }: CitationTooltipProps) {
  if (entries.length === 0) return null

  // Position above the hovered element by default; flip below if near top
  const spaceAbove = y
  const flipBelow = spaceAbove < 120

  const style: React.CSSProperties = {
    left: Math.min(x, containerRect.width - 360),
    ...(flipBelow ? { top: y + 24 } : { bottom: containerRect.height - y + 8 })
  }

  return (
    <div className="citation-tooltip" style={style}>
      {entries.map((entry) => (
        <div key={entry.key} className="citation-tooltip-entry">
          <div className="citation-tooltip-title">{entry.title || entry.key}</div>
          {entry.author && <div className="citation-tooltip-authors">{entry.author}</div>}
          <div className="citation-tooltip-meta">
            {[entry.year, entry.journal, entry.type].filter(Boolean).join(' · ')}
          </div>
        </div>
      ))}
    </div>
  )
}

export default CitationTooltip
