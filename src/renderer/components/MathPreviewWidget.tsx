import { useEffect, useRef, useState, useCallback } from 'react'
import type { MathPreviewData } from '../hooks/editor/useMathPreview'
import type { editor as monacoEditor } from 'monaco-editor'
import './MathPreviewWidget.css'

// Import MathLive - it registers the <math-field> web component globally
import 'mathlive'

interface MathPreviewWidgetProps {
    mathData: MathPreviewData
    editorRef: React.RefObject<monacoEditor.IStandaloneCodeEditor | null>
    onClose: () => void
}

export function MathPreviewWidget({ mathData, editorRef, onClose }: MathPreviewWidgetProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const mathFieldRef = useRef<HTMLElement | null>(null)
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
    const [editedLatex, setEditedLatex] = useState(mathData.latex)
    const hasChanges = editedLatex.trim() !== mathData.latex.trim()

    // Update edited latex when math data changes from outside
    useEffect(() => {
        setEditedLatex(mathData.latex)
    }, [mathData.latex])

    // Calculate position relative to the editor
    useEffect(() => {
        const editor = editorRef.current
        if (!editor) return

        const editorDom = editor.getDomNode()
        if (!editorDom) return

        const endLine = mathData.range.endLineNumber
        const scrolledPos = editor.getScrolledVisiblePosition({
            lineNumber: endLine,
            column: 1,
        })

        if (scrolledPos) {
            const editorRect = editorDom.getBoundingClientRect()
            setPosition({
                top: scrolledPos.top + scrolledPos.height + 4,
                left: Math.max(16, Math.min(scrolledPos.left, editorRect.width - 300)),
            })
        }
    }, [editorRef, mathData.range.endLineNumber])

    // Setup math-field event listener
    useEffect(() => {
        const mf = mathFieldRef.current
        if (!mf) return

        const handleInput = () => {
            const value = (mf as unknown as { value: string }).value
            setEditedLatex(value)
        }

        mf.addEventListener('input', handleInput)
        return () => {
            mf.removeEventListener('input', handleInput)
        }
    }, [])

    const handleApply = useCallback(() => {
        const editor = editorRef.current
        if (!editor || !hasChanges) return

        const model = editor.getModel()
        if (!model) return

        // Replace content range (excluding delimiters)
        const { contentRange } = mathData
        editor.executeEdits('math-preview', [{
            range: {
                startLineNumber: contentRange.startLineNumber,
                startColumn: contentRange.startColumn,
                endLineNumber: contentRange.endLineNumber,
                endColumn: contentRange.endColumn,
            },
            text: editedLatex,
            forceMoveMarkers: true,
        }])

        editor.focus()
    }, [editorRef, mathData, editedLatex, hasChanges])

    // Close on Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    if (!position) return null

    return (
        <div
            ref={containerRef}
            className="math-preview-widget"
            style={{ top: position.top, left: position.left }}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div className="math-preview-header">
                <span className="math-preview-label">
                    <span className="math-preview-label-icon">∑</span>
                    {mathData.isDisplay ? 'Display Math' : 'Inline Math'}
                </span>
                <div className="math-preview-actions">
                    {hasChanges && (
                        <button
                            className="math-preview-btn math-preview-btn-apply"
                            onClick={handleApply}
                            title="Apply changes to editor"
                        >
                            Apply
                        </button>
                    )}
                    <button
                        className="math-preview-btn"
                        onClick={onClose}
                        title="Close (Esc)"
                    >
                        ✕
                    </button>
                </div>
            </div>

            <div className="math-preview-body">
                <math-field
                    ref={mathFieldRef}
                    virtual-keyboard-mode="onfocus"
                >
                    {mathData.latex}
                </math-field>
            </div>

            <div className="math-preview-hint">
                Click to edit • Virtual keyboard available on focus
            </div>
        </div>
    )
}
