import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, RotateCcw, Sparkles, Terminal } from 'lucide-react'
import { useEditorStore } from '../store/useEditorStore'
import { useProjectStore } from '../store/useProjectStore'
import { errorMessage } from '../utils/errorMessage'
import { dirname } from '../utils/path'

interface AiAssistantModalProps {
  isOpen: boolean
  onClose: () => void
  onAiDraft: () => void
}

type LaunchState = 'idle' | 'checking' | 'opening' | 'opened' | 'error'

function quoteForDisplay(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function buildCommandPreview(workDir: string, resume: boolean): string {
  return `cd ${quoteForDisplay(workDir)} && claude${resume ? ' --resume' : ''}`
}

export const AiAssistantModal: React.FC<AiAssistantModalProps> = ({
  isOpen,
  onClose,
  onAiDraft
}) => {
  const projectRoot = useProjectStore((s) => s.projectRoot)
  const filePath = useEditorStore((s) => s.filePath)
  const isDirty = useEditorStore((s) => s.isDirty)
  const [launchState, setLaunchState] = useState<LaunchState>('idle')
  const [message, setMessage] = useState('')
  const [lastCommand, setLastCommand] = useState('')
  const [copied, setCopied] = useState(false)

  const workDir = useMemo(
    () => projectRoot || (filePath ? dirname(filePath) : ''),
    [filePath, projectRoot]
  )

  useEffect(() => {
    if (isOpen) {
      setLaunchState('idle')
      setMessage('')
      setLastCommand(workDir ? buildCommandPreview(workDir, false) : '')
      setCopied(false)
    }
  }, [isOpen, workDir])

  const openClaudeTerminal = useCallback(
    async (resume: boolean) => {
      if (!workDir) {
        setLaunchState('error')
        setMessage('Open a project or file before starting Claude Code.')
        return
      }

      const commandPreview = buildCommandPreview(workDir, resume)
      setLastCommand(commandPreview)
      setCopied(false)
      setLaunchState('checking')
      setMessage('Checking Claude Code CLI...')

      try {
        const available = await window.api.aiCheckCli()
        if (!available) {
          setLaunchState('error')
          setMessage('Claude Code CLI was not found. Install it, then run the command below.')
          return
        }

        setLaunchState('opening')
        setMessage('Opening terminal...')
        const result = await window.api.aiOpenClaudeTerminal({ workDir, resume })
        setLastCommand(result.command || commandPreview)
        setLaunchState('opened')
        setMessage('Claude Code opened in an external terminal.')
      } catch (err) {
        setLaunchState('error')
        setMessage(errorMessage(err))
      }
    },
    [workDir]
  )

  const handleCopyCommand = useCallback(async () => {
    if (!lastCommand) return
    await navigator.clipboard?.writeText(lastCommand)
    setCopied(true)
  }, [lastCommand])

  const handleDraft = useCallback(() => {
    onClose()
    onAiDraft()
  }, [onAiDraft, onClose])

  if (!isOpen) return null

  const isBusy = launchState === 'checking' || launchState === 'opening'
  const canLaunch = !!workDir && !isBusy

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content ai-assistant-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>AI Assistant</h2>
          <button className="close-button" onClick={onClose} aria-label="Close AI Assistant">
            &times;
          </button>
        </div>

        <div className="modal-body ai-assistant-body">
          <div className="ai-assistant-summary">
            <div>
              <span className="ai-assistant-label">Working directory</span>
              <code>{workDir || 'No project or file open'}</code>
            </div>
            {isDirty && (
              <span className="ai-assistant-dirty">
                Save first if Claude Code should see your latest editor changes.
              </span>
            )}
          </div>

          <div className="ai-assistant-actions">
            <button
              className="ai-assistant-action"
              onClick={() => openClaudeTerminal(false)}
              disabled={!canLaunch}
              aria-label="Open Claude Code"
            >
              <Terminal size={20} />
              <span>
                <strong>Claude Code</strong>
                <small>Open a terminal in this project.</small>
              </span>
            </button>

            <button
              className="ai-assistant-action"
              onClick={() => openClaudeTerminal(true)}
              disabled={!canLaunch}
              aria-label="Resume Claude Code"
            >
              <RotateCcw size={20} />
              <span>
                <strong>Resume</strong>
                <small>Run Claude Code with --resume.</small>
              </span>
            </button>

            <button
              className="ai-assistant-action"
              onClick={handleDraft}
              disabled={isBusy}
              aria-label="Open AI Draft"
            >
              <FileText size={20} />
              <span>
                <strong>AI Draft</strong>
                <small>Generate LaTeX with the configured AI provider.</small>
              </span>
            </button>
          </div>

          <div className={`ai-assistant-terminal ${launchState}`}>
            <div className="ai-assistant-terminal-header">
              <Sparkles size={15} />
              <span>{message || 'Claude Code will use this command.'}</span>
            </div>
            <pre>{lastCommand || 'claude'}</pre>
            <button onClick={handleCopyCommand} disabled={!lastCommand}>
              {copied ? 'Copied' : 'Copy command'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
