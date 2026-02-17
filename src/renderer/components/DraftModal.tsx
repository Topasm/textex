import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'

interface DraftModalProps {
  isOpen: boolean
  onClose: () => void
  onInsert: (latex: string) => void
  initialPrompt?: string
}

type Phase = 'input' | 'generating' | 'preview'

export const DraftModal: React.FC<DraftModalProps> = ({ isOpen, onClose, onInsert, initialPrompt }) => {
  const [phase, setPhase] = useState<Phase>('input')
  const [input, setInput] = useState('')
  const [generatedLatex, setGeneratedLatex] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const aiProvider = useAppStore((s) => s.settings.aiProvider)
  const aiModel = useAppStore((s) => s.settings.aiModel)

  useEffect(() => {
    if (isOpen) {
      setPhase('input')
      setInput(initialPrompt || '')
      setGeneratedLatex('')
      setError(null)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, initialPrompt])

  const handleGenerate = useCallback(async () => {
    if (!input.trim()) return
    if (!aiProvider) {
      setError('No AI provider configured. Go to Settings > Integrations to set up.')
      return
    }

    setPhase('generating')
    setError(null)

    try {
      const result = await window.api.aiGenerate(input, aiProvider, aiModel)
      setGeneratedLatex(result.latex)
      setPhase('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('input')
    }
  }, [input, aiProvider, aiModel])

  const handleInsert = useCallback(() => {
    if (generatedLatex.trim()) {
      onInsert(generatedLatex)
      onClose()
    }
  }, [generatedLatex, onInsert, onClose])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        if (phase === 'input') handleGenerate()
        else if (phase === 'preview') handleInsert()
      }
    },
    [onClose, phase, handleGenerate, handleInsert]
  )

  if (!isOpen) return null

  const providerLabel =
    aiProvider === 'openai' ? 'OpenAI' : aiProvider === 'anthropic' ? 'Anthropic' : aiProvider === 'gemini' ? 'Gemini' : 'Not configured'

  return (
    <div className="modal-overlay" onClick={onClose} onKeyDown={handleKeyDown}>
      <div className="modal-content draft-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>AI Draft</h2>
          <button className="close-button" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          {phase === 'input' && (
            <>
              <p className="draft-hint">
                Paste your markdown, notes, or outline below. The AI will generate a complete LaTeX
                document.
              </p>
              <textarea
                ref={inputRef}
                className="draft-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Example:\n# Introduction\nThis paper explores the effects of...\n\n## Methods\n- Experiment 1: ...\n- Experiment 2: ...\n\n## Results\nWe found that...`}
                onKeyDown={handleKeyDown}
              />
              {error && <div className="draft-error">{error}</div>}
            </>
          )}

          {phase === 'generating' && (
            <div className="draft-loading">
              <div className="preview-spinner" />
              <p>Generating LaTeX document...</p>
            </div>
          )}

          {phase === 'preview' && (
            <>
              <p className="draft-hint">
                Review and edit the generated LaTeX below, then insert into your editor.
              </p>
              <textarea
                className="draft-preview"
                value={generatedLatex}
                onChange={(e) => setGeneratedLatex(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </>
          )}
        </div>

        <div className="modal-footer">
          <span className="draft-provider-label">{providerLabel}</span>
          <div className="modal-actions">
            {phase === 'input' && (
              <button
                className="primary-button"
                onClick={handleGenerate}
                disabled={!input.trim() || !aiProvider}
              >
                Generate (Ctrl+Enter)
              </button>
            )}
            {phase === 'preview' && (
              <>
                <button
                  onClick={() => {
                    setPhase('input')
                    setError(null)
                  }}
                >
                  Back to Edit
                </button>
                <button className="primary-button" onClick={handleInsert}>
                  Insert into Editor
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
