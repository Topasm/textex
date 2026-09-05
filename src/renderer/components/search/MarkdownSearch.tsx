import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLocalSearchRequest } from '../../hooks/useLocalSearchRequest'
import { LocalSearchBar } from './LocalSearchBar'
import { ICON_SIZE } from '../ui/IconSystem'

export function MarkdownSearch({
  text,
  areaRef
}: {
  text: string
  areaRef: RefObject<HTMLTextAreaElement | null>
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  useLocalSearchRequest('document', () => {
    setOpen(true)
    inputRef.current?.focus()
    inputRef.current?.select()
    return true
  })
  const matches = useMemo(() => {
    if (!query) return []
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return [...text.matchAll(new RegExp(escaped, 'gi'))].map((match) => ({
      start: match.index,
      end: match.index + match[0].length
    }))
  }, [query, text])
  const current = Math.min(index, Math.max(0, matches.length - 1))
  useEffect(() => {
    setIndex(0)
  }, [query, text])
  useEffect(() => {
    const area = areaRef.current
    const match = matches[current]
    if (!open || !area || !match) return
    area.setSelectionRange(match.start, match.end)
    const lineHeight = parseFloat(getComputedStyle(area).lineHeight) || 22
    area.scrollTop = Math.max(0, (text.slice(0, match.start).split('\n').length - 2) * lineHeight)
  }, [open, matches, current, areaRef, text])
  if (!open)
    return (
      <button
        className="local-search-toggle"
        type="button"
        aria-label={t('localSearch.document')}
        onClick={() => setOpen(true)}
      >
        <Search size={ICON_SIZE.control} />
      </button>
    )
  return (
    <LocalSearchBar
      label={t('localSearch.document')}
      query={query}
      count={matches.length}
      index={current}
      inputRef={inputRef}
      onQuery={setQuery}
      onStep={(direction) => {
        if (matches.length) setIndex((current + direction + matches.length) % matches.length)
      }}
      onClose={() => {
        setOpen(false)
        areaRef.current?.focus()
      }}
    />
  )
}
