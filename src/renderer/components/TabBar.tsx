import React, { useCallback } from 'react'
import { useEditorStore } from '../store/useEditorStore'

const TabBar = React.memo(function TabBar() {
  const openFiles = useEditorStore((s) => s.openFiles)
  const activeFilePath = useEditorStore((s) => s.activeFilePath)

  const filePaths = Object.keys(openFiles)

  const handleClose = useCallback((e: React.MouseEvent, filePath: string) => {
    e.stopPropagation()
    useEditorStore.getState().closeTab(filePath)
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent, filePath: string) => {
    if (e.button === 1) {
      e.preventDefault()
      useEditorStore.getState().closeTab(filePath)
    }
  }, [])

  if (filePaths.length === 0) return <></>

  return (
    <div className="tab-bar">
      {filePaths.map((fp) => {
        const data = openFiles[fp]
        const name = fp.split(/[\\/]/).pop() || fp
        const isActive = fp === activeFilePath
        return (
          <div
            key={fp}
            className={`tab${isActive ? ' active' : ''}`}
            onClick={() => useEditorStore.getState().setActiveTab(fp)}
            onMouseDown={(e) => handleMouseDown(e, fp)}
            title={fp}
          >
            {data.isDirty && <span className="tab-dirty" />}
            <span>{name}</span>
            <span className="tab-close" onClick={(e) => handleClose(e, fp)}>
              {'\u00D7'}
            </span>
          </div>
        )
      })}
    </div>
  )
})

export default TabBar
