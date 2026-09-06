import { useId, useRef } from 'react'
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLocalSearchRequest } from '../../hooks/useLocalSearchRequest'
import { usePdfStore } from '../../store/usePdfStore'
import type { PdfSearchState } from '../../hooks/preview/usePdfSearch'
import { LocalSearchBar } from './LocalSearchBar'
import { ICON_SIZE } from '../ui/IconSystem'

export function PdfSearchBar({ search }: { search: PdfSearchState }) {
  const { t } = useTranslation()
  const searchId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  useLocalSearchRequest('pdf', () => {
    usePdfStore.getState().setPdfSearchVisible(true)
    inputRef.current?.focus()
    inputRef.current?.select()
    return true
  })
  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className="local-search-toggle"
        aria-label={t('localSearch.pdf')}
        aria-expanded={search.searchVisible}
        aria-controls={search.searchVisible ? searchId : undefined}
        onClick={() =>
          search.searchVisible
            ? search.handleSearchClose()
            : usePdfStore.getState().setPdfSearchVisible(true)
        }
      >
        <Search size={ICON_SIZE.control} />
      </button>
      {search.searchVisible && (
        <LocalSearchBar
          id={searchId}
          label={t('localSearch.pdf')}
          busy={search.isSearching}
          statusText={
            search.isSearching
              ? t('localSearch.searching')
              : search.searchFailed
                ? t('localSearch.failed')
                : undefined
          }
          query={search.searchQuery}
          count={search.searchMatches.length}
          index={search.currentMatchIndex}
          inputRef={inputRef}
          onQuery={search.setSearchQuery}
          onStep={(direction) =>
            direction === 1 ? search.handleSearchNext() : search.handleSearchPrev()
          }
          onClose={() => {
            search.handleSearchClose()
            requestAnimationFrame(() => toggleRef.current?.focus())
          }}
        />
      )}
    </>
  )
}
