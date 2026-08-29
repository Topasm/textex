import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import katex from 'katex'
import { Sigma, X } from 'lucide-react'
import type { editor as monacoEditor } from 'monaco-editor'
import type { MathPreviewData } from '../hooks/editor/useMathPreview'
import { ICON_SIZE } from './ui/IconSystem'
import 'katex/dist/katex.min.css'
import './MathPreviewWidget.css'

interface MathPreviewWidgetProps {
  mathData: MathPreviewData
  editorRef: React.RefObject<monacoEditor.IStandaloneCodeEditor | null>
  onClose: () => void
}

export function MathPreviewWidget({ mathData, editorRef, onClose }: MathPreviewWidgetProps) {
  const { t } = useTranslation()
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const renderedMath = useMemo(
    () =>
      katex.renderToString(mathData.latex, {
        displayMode: mathData.isDisplay,
        output: 'html',
        strict: false,
        throwOnError: false
      }),
    [mathData.isDisplay, mathData.latex]
  )

  useEffect(() => {
    const editor = editorRef.current
    const editorDom = editor?.getDomNode()
    if (!editor || !editorDom) return
    const scrolledPosition = editor.getScrolledVisiblePosition({
      lineNumber: mathData.range.endLineNumber,
      column: 1
    })
    if (!scrolledPosition) return
    const editorRect = editorDom.getBoundingClientRect()
    setPosition({
      top: scrolledPosition.top + scrolledPosition.height + 4,
      left: Math.max(16, Math.min(scrolledPosition.left, editorRect.width - 300))
    })
  }, [editorRef, mathData.range.endLineNumber])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!position) return null

  return (
    <div
      className="math-preview-widget"
      style={{ top: position.top, left: position.left }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="math-preview-header">
        <span className="math-preview-label">
          <span className="math-preview-label-icon">
            <Sigma size={ICON_SIZE.compact} />
          </span>
          {mathData.isDisplay ? t('mathPreview.displayMath') : t('mathPreview.inlineMath')}
        </span>
        <button
          type="button"
          className="math-preview-btn"
          onClick={onClose}
          title={t('mathPreview.close')}
          aria-label={t('mathPreview.close')}
        >
          <X size={ICON_SIZE.compact} />
        </button>
      </div>
      <div
        className={`math-preview-body${mathData.isDisplay ? ' math-preview-body--display' : ''}`}
        dangerouslySetInnerHTML={{ __html: renderedMath }}
      />
      <div className="math-preview-hint">{t('mathPreview.hint')}</div>
    </div>
  )
}
