import { useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { DirectoryEntry } from '../../../shared/types'
import { ContextMenu, type ContextMenuAnchor, type ContextMenuItem } from './ContextMenu'

/** Shared by indexed and directory-backed tree rows. */
export function useFileTreeMenu(
  entry: DirectoryEntry,
  actions: {
    create: (kind: 'file' | 'folder') => void
    rename: () => void
    delete: () => void | Promise<void>
    activate: () => void | Promise<void>
  }
) {
  const { t } = useTranslation()
  const [anchor, setAnchor] = useState<ContextMenuAnchor | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => setAnchor(null), [entry.path])
  const items: ContextMenuItem[] = [
    ...(entry.type === 'directory'
      ? [
          { id: 'new-file', label: t('fileTree.newFile'), run: () => actions.create('file') },
          { id: 'new-folder', label: t('fileTree.newFolder'), run: () => actions.create('folder') }
        ]
      : []),
    { id: 'rename', label: t('fileTree.rename'), run: actions.rename },
    { id: 'delete', label: t('fileTree.delete'), run: actions.delete }
  ]
  return {
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      event.preventDefault()
      event.stopPropagation()
      opener.current = event.currentTarget
      setAnchor({ x: event.clientX, y: event.clientY })
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
        event.preventDefault()
        event.stopPropagation()
        opener.current = event.currentTarget
        const rect = event.currentTarget.getBoundingClientRect()
        setAnchor({ x: rect.left + 8, y: rect.bottom })
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        void actions.activate()
      }
    },
    menu: anchor && (
      <ContextMenu
        anchor={anchor}
        items={items}
        label={t('fileTree.actionsFor', { name: entry.name })}
        onClose={(restoreFocus) => {
          setAnchor(null)
          if (restoreFocus) opener.current?.focus()
        }}
      />
    )
  }
}
