import { useCallback, useMemo, useState } from 'react'
import { Copy, RotateCcw, Terminal, X } from 'lucide-react'
import { useEditorStore } from '../store/useEditorStore'
import { useProjectStore } from '../store/useProjectStore'
import { useUiStore } from '../store/useUiStore'
import { errorMessage } from '../utils/errorMessage'

type LaunchState = 'idle' | 'checking' | 'opening' | 'opened' | 'error'

function dirname(filePath: string): string {
  const index = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return index > 0 ? filePath.slice(0, index) : filePath
}

function quoteForDisplay(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function buildCommandPreview(workDir: string, resume: boolean): string {
  return `cd ${quoteForDisplay(workDir)} && claude${resume ? ' --resume' : ''}`
}

export function TerminalPane() {
  const projectRoot = useProjectStore((s) => s.projectRoot)
  const filePath = useEditorStore((s) => s.filePath)
  const isDirty = useEditorStore((s) => s.isDirty)
  const setTerminalPaneOpen = useUiStore((s) => s.setTerminalPaneOpen)
  const [launchState, setLaunchState] = useState<LaunchState>('idle')
  const [message, setMessage] = useState('Ready')
  const [copied, setCopied] = useState(false)

  const workDir = useMemo(
    () => projectRoot || (filePath ? dirname(filePath) : ''),
    [filePath, projectRoot]
  )
  const commandPreview = workDir ? buildCommandPreview(workDir, false) : 'claude'

  const openClaudeTerminal = useCallback(
    async (resume: boolean) => {
      if (!workDir) {
        setLaunchState('error')
        setMessage('Open a project or file first.')
        return
      }

      setCopied(false)
      setLaunchState('checking')
      setMessage('Checking Claude Code...')

      try {
        const available = await window.api.aiCheckCli()
        if (!available) {
          setLaunchState('error')
          setMessage('Claude Code CLI was not found.')
          return
        }

        setLaunchState('opening')
        setMessage('Opening terminal...')
        await window.api.aiOpenClaudeTerminal({ workDir, resume })
        setLaunchState('opened')
        setMessage(resume ? 'Resume session opened.' : 'Claude Code opened.')
      } catch (err) {
        setLaunchState('error')
        setMessage(errorMessage(err))
      }
    },
    [workDir]
  )

  const copyCommand = useCallback(async () => {
    if (!workDir) return
    await navigator.clipboard?.writeText(commandPreview)
    setCopied(true)
  }, [commandPreview, workDir])

  return (
    <div className="terminal-pane-surface">
      <div className="terminal-pane-header">
        <div className="terminal-pane-title">
          <Terminal size={15} />
          <span>Terminal</span>
        </div>
        <button
          className="terminal-pane-icon-btn"
          onClick={() => setTerminalPaneOpen(false)}
          title="Close terminal pane"
          aria-label="Close terminal pane"
        >
          <X size={15} />
        </button>
      </div>

      <div className="terminal-pane-body">
        <div className="terminal-pane-workdir">
          <span>cwd</span>
          <code>{workDir || 'No project or file open'}</code>
        </div>

        {isDirty && (
          <div className="terminal-pane-warning">
            Save the editor buffer before asking Claude Code to modify files.
          </div>
        )}

        <div className="terminal-pane-actions">
          <button onClick={() => openClaudeTerminal(false)} disabled={!workDir}>
            <Terminal size={15} />
            <span>Claude Code</span>
          </button>
          <button onClick={() => openClaudeTerminal(true)} disabled={!workDir}>
            <RotateCcw size={15} />
            <span>Resume</span>
          </button>
        </div>

        <div className={`terminal-pane-console ${launchState}`}>
          <div className="terminal-pane-console-status">{message}</div>
          <pre>{commandPreview}</pre>
          <button onClick={copyCommand} disabled={!workDir}>
            <Copy size={14} />
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
