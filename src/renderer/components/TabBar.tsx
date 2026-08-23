import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../store/useEditorStore'
import { closeEditorTab } from '../services/documentClose'

const TabBar = React.memo(function TabBar() {
  const { t } = useTranslation()
  const openFiles = useEditorStore((s) => s.openFiles)
  const activeFilePath = useEditorStore((s) => s.activeFilePath)

  const filePaths = Object.keys(openFiles)

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
    <div className="tab-bar" role="tablist" aria-label={t('toolbar.fileOperations')}>
      {filePaths.map((fp, index) => {
        const data = openFiles[fp]
        const name = fp.split(/[\\/]/).pop() || fp
        const isActive = fp === activeFilePath
        return (
          <div
            key={fp}
            className={`tab${isActive ? ' active' : ''}`}
            role="presentation"
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
              <span
                className="tab-close"
                aria-hidden="true"
                onClick={(event) => handleClose(event, fp)}
              >
                {'\u00D7'}
              </span>
            </button>
          </div>
        )
      })}
    </div>
  )
})

export default TabBar
