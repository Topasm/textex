import { useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { usePdfStore } from '../store/usePdfStore'
import { useClickOutside } from '../hooks/useClickOutside'
import { ZOOM_PRESETS } from '../constants'

function PdfZoomDropdown() {
  const { t } = useTranslation()
  const zoomLevel = usePdfStore((s) => s.zoomLevel)
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setIsOpen(false), [])
  useClickOutside(dropdownRef, close, isOpen)

  const handlePreset = useCallback((level: number) => {
    usePdfStore.getState().setZoomLevel(level)
    setIsOpen(false)
  }, [])

  const handleFit = useCallback((mode: 'width' | 'height') => {
    usePdfStore.getState().requestFit(mode)
    setIsOpen(false)
  }, [])

  return (
    <div className="menu-dropdown zoom-dropdown" ref={dropdownRef}>
      <button
        className="toolbar-compact-btn toolbar-zoom-label"
        onClick={() => setIsOpen(!isOpen)}
        title={t('toolbar.zoomPreset')}
        aria-label={t('toolbar.zoomPreset')}
      >
        {zoomLevel}%
      </button>
      {isOpen && (
        <div className="menu-dropdown-content zoom-dropdown-content">
          {ZOOM_PRESETS.map((preset) => (
            <button
              key={preset}
              onClick={() => handlePreset(preset)}
              className={zoomLevel === preset ? 'zoom-preset-active' : undefined}
            >
              {preset}%
            </button>
          ))}
          <div className="toolbar-separator toolbar-separator-line" />
          <button onClick={() => handleFit('width')}>{t('toolbar.fitWidth')}</button>
          <button onClick={() => handleFit('height')}>{t('toolbar.fitHeight')}</button>
        </div>
      )}
    </div>
  )
}

export default PdfZoomDropdown
