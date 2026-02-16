import { useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'

function TabBar(): JSX.Element {
  const openFiles = useAppStore((s) => s.openFiles)
  const activeFilePath = useAppStore((s) => s.activeFilePath)
  const setActiveTab = useAppStore((s) => s.setActiveTab)
  const closeTab = useAppStore((s) => s.closeTab)

  const filePaths = Object.keys(openFiles)

  const handleClose = useCallback(
    (e: React.MouseEvent, filePath: string) => {
      e.stopPropagation()
      closeTab(filePath)
    },
    [closeTab]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, filePath: string) => {
      // Middle-click to close
      if (e.button === 1) {
        e.preventDefault()
        closeTab(filePath)
      }
    },
    [closeTab]
  )

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
            onClick={() => setActiveTab(fp)}
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
}

export default TabBar
