import { useEffect, useState } from 'react'
import ReactDOM from 'react-dom'
import './ImagePreviewTooltip.css'

// Module-level cache for base64 data URLs
const imageCache = new Map<string, string>()

interface ImagePreviewTooltipProps {
  filePath: string
  fileName: string
  anchorRect: DOMRect
}

export function ImagePreviewTooltip({ filePath, fileName, anchorRect }: ImagePreviewTooltipProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(imageCache.get(filePath) ?? null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (imageCache.has(filePath)) {
      setDataUrl(imageCache.get(filePath)!)
      return
    }

    let cancelled = false
    window.api
      .readFileBase64(filePath)
      .then(({ data }) => {
        if (!cancelled) {
          imageCache.set(filePath, data)
          setDataUrl(data)
        }
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })

    return () => {
      cancelled = true
    }
  }, [filePath])

  // Position to the right of the hovered item
  const top = anchorRect.top
  const left = anchorRect.right + 8

  // Adjust if it would overflow the bottom of the viewport
  const maxTop = window.innerHeight - 260
  const adjustedTop = Math.max(8, Math.min(top, maxTop))

  return ReactDOM.createPortal(
    <div className="image-preview-tooltip" style={{ top: adjustedTop, left }}>
      <div className="image-preview-tooltip-header">{fileName}</div>
      <div className="image-preview-tooltip-body">
        {error ? (
          <div className="image-preview-tooltip-loading">Failed to load</div>
        ) : dataUrl ? (
          <img src={dataUrl} alt={fileName} />
        ) : (
          <div className="image-preview-tooltip-loading">Loading...</div>
        )}
      </div>
    </div>,
    document.body
  )
}
