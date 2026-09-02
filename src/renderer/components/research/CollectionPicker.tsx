import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, FolderTree } from 'lucide-react'
import { ICON_SIZE } from '../ui/IconSystem'
import type { ZoteroCollection, ZoteroLibrary } from '../../../shared/types'
import type { ZoteroCollectionRow } from '../../services/zoteroCollectionTree'

interface CollectionPickerProps {
  library: ZoteroLibrary | null
  rows: ZoteroCollectionRow[]
  totalRowCount: number
  selectedKey: string | null
  activeKey: string | null
  expandedCollections: Set<string>
  libraryExpanded: boolean
  selectedName: string | null
  selectedCount: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectLibrary: () => void
  onToggleLibrary: () => void
  onSelectCollection: (
    collection: ZoteroCollection,
    row: ZoteroCollectionRow,
    index: number
  ) => void
  onShowMore: () => void
  onFocusCollection: (key: string) => void
  onLibraryKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void
  onCollectionKeyDown: (
    event: React.KeyboardEvent<HTMLButtonElement>,
    row: ZoteroCollectionRow,
    index: number
  ) => void
  registerRef: (key: string, element: HTMLButtonElement | null) => void
  emptyState: ReactNode
}

/**
 * The collection tree used to sit permanently above the list, capped at 136px
 * at the panel's default width — the library root plus about three rows. It is
 * a navigation control used a few times a session, so it now lives behind a
 * trigger and gives its vertical space back to the reference list.
 */
export function CollectionPicker({
  library,
  rows,
  totalRowCount,
  selectedKey,
  activeKey,
  expandedCollections,
  libraryExpanded,
  selectedName,
  selectedCount,
  open,
  onOpenChange,
  onSelectLibrary,
  onToggleLibrary,
  onSelectCollection,
  onShowMore,
  onFocusCollection,
  onLibraryKeyDown,
  onCollectionKeyDown,
  registerRef,
  emptyState
}: CollectionPickerProps) {
  const { t } = useTranslation()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popoverId = useId()

  useEffect(() => {
    if (!open) return
    const handleOutsideMouseDown = (event: MouseEvent): void => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        onOpenChange(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideMouseDown)
    return () => document.removeEventListener('mousedown', handleOutsideMouseDown)
  }, [onOpenChange, open])

  return (
    <div className="zotero-collection-picker" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="zotero-collection-trigger"
        aria-haspopup="tree"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        aria-label={t('researchPanel.zotero.collectionTrigger', {
          name: selectedName ?? t('researchPanel.zotero.noCollectionSelected')
        })}
        title={t('researchPanel.zotero.collectionsLabel')}
        onClick={() => onOpenChange(!open)}
      >
        <FolderTree size={ICON_SIZE.compact} aria-hidden="true" />
        <span className="zotero-collection-trigger-name">
          {selectedName ?? t('researchPanel.zotero.noCollectionSelected')}
        </span>
        {selectedCount !== null && <small>{selectedCount}</small>}
        <ChevronDown size={ICON_SIZE.micro} aria-hidden="true" />
      </button>

      {open && (
        <div
          id={popoverId}
          className="zotero-collection-popover"
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            onOpenChange(false)
            triggerRef.current?.focus()
          }}
        >
          <div
            className="zotero-collection-tree"
            role="tree"
            aria-label={t('researchPanel.zotero.collectionsLabel')}
          >
            {!library ? (
              emptyState
            ) : (
              <>
                <button
                  type="button"
                  role="treeitem"
                  aria-level={1}
                  aria-expanded={libraryExpanded}
                  aria-selected={selectedKey === library.key}
                  className={
                    selectedKey === library.key
                      ? 'zotero-library-root active'
                      : 'zotero-library-root'
                  }
                  tabIndex={activeKey === library.key ? 0 : -1}
                  ref={(element) => registerRef(library.key, element)}
                  onFocus={() => onFocusCollection(library.key)}
                  onKeyDown={onLibraryKeyDown}
                  onClick={() => {
                    if (selectedKey === library.key) onToggleLibrary()
                    else onSelectLibrary()
                  }}
                >
                  <ChevronRight
                    className={
                      libraryExpanded ? 'collection-chevron expanded' : 'collection-chevron'
                    }
                    size={ICON_SIZE.micro}
                    aria-hidden="true"
                  />
                  <FolderTree size={ICON_SIZE.micro} aria-hidden="true" />
                  <span>{library.name}</span>
                  <small>{library.itemCount ?? '…'}</small>
                </button>
                {rows.map((row, index) => (
                  <button
                    type="button"
                    draggable
                    role="treeitem"
                    aria-level={row.depth + 2}
                    aria-expanded={
                      row.hasChildren ? expandedCollections.has(row.collection.key) : undefined
                    }
                    aria-selected={selectedKey === row.collection.key}
                    className={selectedKey === row.collection.key ? 'active' : ''}
                    style={{ paddingLeft: 24 + row.depth * 16 }}
                    tabIndex={activeKey === row.collection.key ? 0 : -1}
                    key={row.collection.key}
                    ref={(element) => registerRef(row.collection.key, element)}
                    onFocus={() => onFocusCollection(row.collection.key)}
                    onKeyDown={(event) => onCollectionKeyDown(event, row, index)}
                    onClick={() => onSelectCollection(row.collection, row, index)}
                  >
                    <ChevronRight
                      className={
                        row.hasChildren && expandedCollections.has(row.collection.key)
                          ? 'collection-chevron expanded'
                          : 'collection-chevron'
                      }
                      size={ICON_SIZE.micro}
                      aria-hidden="true"
                    />
                    <span>{row.collection.name}</span>
                    <small>{row.collection.itemCount ?? '…'}</small>
                  </button>
                ))}
              </>
            )}
          </div>
          {totalRowCount > rows.length && (
            <button type="button" className="zotero-show-more" onClick={onShowMore}>
              {t('researchPanel.zotero.showMoreCollections', {
                count: totalRowCount - rows.length
              })}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
