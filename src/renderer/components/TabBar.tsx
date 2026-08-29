import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { useEditorStore } from '../store/useEditorStore'
import { closeEditorTab } from '../services/documentClose'
import { ICON_SIZE } from './ui/IconSystem'
import { disambiguateFileLabels } from '../utils/path'

const TabBar = React.memo(function TabBar() {
  const { t } = useTranslation()
  const openFiles = useEditorStore((s) => s.openFiles)
  const activeFilePath = useEditorStore((s) => s.activeFilePath)

  const filePaths = useMemo(() => Object.keys(openFiles), [openFiles])
  const labels = useMemo(() => disambiguateFileLabels(filePaths), [filePaths])
  const barRef = useRef<HTMLDivElement>(null)

  // Ctrl+Tab moves the selection without moving focus, so nothing would scroll
  // the newly active tab back into view on its own.
  useEffect(() => {
    if (!activeFilePath) return
    const tab = barRef.current?.querySelector(`[data-tab-path="${CSS.escape(activeFilePath)}"]`)
    if (tab && typeof tab.scrollIntoView === 'function') {
      tab.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [activeFilePath])

  const handleClose = useCallback((e: React.MouseEvent, filePath: string) => {
    e.stopPropagation()
    closeEditorTab(filePath)
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent, filePath: string) => {
    if (e.button === 1) {
      e.preventDefault()
      closeEditorTab(filePath)
    }
  }, [])

  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number, filePath: string) => {
      if (event.key === 'Delete') {
        event.preventDefault()
        closeEditorTab(filePath)
        return
      }

      let nextIndex: number | null = null
      if (event.key === 'ArrowLeft') {
        nextIndex = (index - 1 + filePaths.length) % filePaths.length
      } else if (event.key === 'ArrowRight') {
        nextIndex = (index + 1) % filePaths.length
      } else if (event.key === 'Home') {
        nextIndex = 0
      } else if (event.key === 'End') {
        nextIndex = filePaths.length - 1
      }

      if (nextIndex === null) return

      event.preventDefault()
      const nextPath = filePaths[nextIndex]
      if (!nextPath) return

      useEditorStore.getState().setActiveTab(nextPath)
      const tabs = event.currentTarget
        .closest('[role="tablist"]')
        ?.querySelectorAll<HTMLElement>('[role="tab"]')
      tabs?.[nextIndex]?.focus()
    },
    [filePaths]
  )

  if (filePaths.length === 0) return <></>

  return (
    <div className="tab-bar" role="tablist" aria-label={t('toolbar.fileOperations')} ref={barRef}>
      {filePaths.map((fp, index) => {
        const data = openFiles[fp]
        const name = labels.get(fp) ?? fp
        const isActive = fp === activeFilePath
        return (
          <div
            key={fp}
            className={`tab${isActive ? ' active' : ''}`}
            role="presentation"
            data-tab-path={fp}
            onMouseDown={(e) => handleMouseDown(e, fp)}
          >
            <button
              type="button"
              className="tab-select"
              role="tab"
              aria-selected={isActive}
              aria-label={data.isDirty ? t('toolbar.unsaved', { name }) : name}
              tabIndex={isActive ? 0 : -1}
              title={fp}
              onClick={() => useEditorStore.getState().setActiveTab(fp)}
              onKeyDown={(event) => handleTabKeyDown(event, index, fp)}
            >
              {data.isDirty && <span className="tab-dirty" aria-hidden="true" />}
              <span>{name}</span>
            </button>
            {/* A sibling, not a child of the tab: nesting one button inside
                another is invalid, and the close control has to be reachable
                on its own. */}
            <button
              type="button"
              className="tab-close"
              aria-label={t('toolbar.closeTab', { name })}
              title={t('toolbar.closeTab', { name })}
              tabIndex={-1}
              onClick={(event) => handleClose(event, fp)}
            >
              <X size={ICON_SIZE.micro} />
            </button>
          </div>
        )
      })}
    </div>
  )
})

export default TabBar
