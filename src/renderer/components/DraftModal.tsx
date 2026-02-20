import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../store/useSettingsStore'

interface DraftModalProps {
  isOpen: boolean
  onClose: () => void
  onInsert: (latex: string) => void
  initialPrompt?: string
}

type Phase = 'input' | 'generating' | 'preview'

export const DraftModal: React.FC<DraftModalProps> = ({
  isOpen,
  onClose,
  onInsert,
  initialPrompt
}) => {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>('input')
  const [input, setInput] = useState('')
  const [generatedLatex, setGeneratedLatex] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const aiProvider = useSettingsStore((s) => s.settings.aiProvider)
  const aiModel = useSettingsStore((s) => s.settings.aiModel)

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
      setError(t('draftModal.noProvider'))
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
  }, [input, aiProvider, aiModel, t])

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

  const providerName =
    aiProvider === 'openai'
      ? 'OpenAI'
      : aiProvider === 'anthropic'
        ? 'Anthropic'
        : aiProvider === 'gemini'
          ? 'Gemini'
          : ''
  const providerLabel = providerName
    ? aiModel
      ? `${providerName} / ${aiModel}`
      : providerName
    : t('draftModal.notConfigured')

  return (
    <div className="modal-overlay" onClick={onClose} onKeyDown={handleKeyDown}>
      <div className="modal-content draft-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('draftModal.title')}</h2>
          <button className="close-button" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          {phase === 'input' && (
            <>
              <p className="draft-hint">{t('draftModal.hint')}</p>
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
              <p>{t('draftModal.generating')}</p>
            </div>
          )}

          {phase === 'preview' && (
            <>
              <p className="draft-hint">{t('draftModal.reviewHint')}</p>
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
                {t('draftModal.generate')}
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
                  {t('draftModal.backToEdit')}
                </button>
                <button className="primary-button" onClick={handleInsert}>
                  {t('draftModal.insertIntoEditor')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
