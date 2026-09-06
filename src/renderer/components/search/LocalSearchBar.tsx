import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ICON_SIZE } from '../ui/IconSystem'

interface Props {
  id?: string
  label: string
  statusText?: string
  busy?: boolean
  query: string
  count: number
  index: number
  onQuery: (query: string) => void
  onStep: (direction: 1 | -1) => void
  onClose: () => void
  inputRef?: RefObject<HTMLInputElement | null>
}

export function LocalSearchBar({
  id,
  label,
  statusText,
  busy = false,
  query,
  count,
  index,
  onQuery,
  onStep,
  onClose,
  inputRef
}: Props) {
  const { t } = useTranslation()
  const ownRef = useRef<HTMLInputElement>(null)
  const ref = inputRef ?? ownRef
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [ref])
  return (
    <div
      id={id}
      className="local-search-bar"
      role="search"
      aria-label={label}
      aria-busy={busy}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return
        if (event.key === 'Escape' || event.key === 'Enter') {
          event.preventDefault()
          event.stopPropagation()
          if (event.key === 'Escape') onClose()
          else onStep(event.shiftKey ? -1 : 1)
        }
      }}
    >
      <input
        ref={ref}
        aria-label={label}
        placeholder={label}
        value={query}
        onChange={(event) => onQuery(event.target.value)}
      />
      <span role="status" aria-live="polite">
        {statusText ??
          (query ? t('localSearch.matches', { current: count ? index + 1 : 0, total: count }) : '')}
      </span>
      <button
        type="button"
        disabled={!count}
        aria-label={t('localSearch.previous')}
        onClick={() => onStep(-1)}
      >
        <ChevronUp size={ICON_SIZE.compact} />
      </button>
      <button
        type="button"
        disabled={!count}
        aria-label={t('localSearch.next')}
        onClick={() => onStep(1)}
      >
        <ChevronDown size={ICON_SIZE.compact} />
      </button>
      <button type="button" aria-label={t('localSearch.close')} onClick={onClose}>
        <X size={ICON_SIZE.compact} />
      </button>
    </div>
  )
}
