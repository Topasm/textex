import { useCallback, useState } from 'react'
import { FileText, RotateCcw, Terminal } from 'lucide-react'
import { useEditorStore } from '../../store/useEditorStore'
import { useProjectStore } from '../../store/useProjectStore'
import { dirname } from '../../utils/path'

interface ResearchChatPanelProps {
  onAiDraft: () => void
}

export function ResearchChatPanel({ onAiDraft }: ResearchChatPanelProps) {
  const projectRoot = useProjectStore((state) => state.projectRoot)
  const filePath = useEditorStore((state) => state.filePath)
  const workDir = projectRoot || (filePath ? dirname(filePath) : '')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const launch = useCallback(
    async (provider: 'claude' | 'codex', resume: boolean) => {
      if (!workDir || busy) return
      setBusy(true)
      setStatus(`Checking ${provider === 'claude' ? 'Claude Code' : 'Codex CLI'}…`)
      try {
        const available =
          provider === 'claude' ? await window.api.aiCheckCli() : await window.api.aiCheckCodexCli()
        if (!available)
          throw new Error(`${provider === 'claude' ? 'Claude Code' : 'Codex CLI'} was not found.`)
        const result =
          provider === 'claude'
            ? await window.api.aiOpenClaudeTerminal({ workDir, resume })
            : await window.api.aiOpenCodexTerminal({ workDir, resume })
        setStatus(result.command)
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error))
      } finally {
        setBusy(false)
      }
    },
    [busy, workDir]
  )

  return (
    <div className="research-chat-panel">
      <div className="research-section-heading">AI workspace</div>
      <p className="research-muted">
        Generate a draft or continue an AI coding session in this project. Conversational research
        chat will build on this panel in a later release.
      </p>
      <button className="research-primary-action" onClick={onAiDraft}>
        <FileText size={16} />
        <span>
          <strong>AI Draft</strong>
          <small>Generate and insert LaTeX.</small>
        </span>
      </button>
      <div className="research-action-grid">
        <button disabled={!workDir || busy} onClick={() => launch('claude', false)}>
          <Terminal size={15} /> Claude Code
        </button>
        <button disabled={!workDir || busy} onClick={() => launch('claude', true)}>
          <RotateCcw size={15} /> Resume Claude
        </button>
        <button disabled={!workDir || busy} onClick={() => launch('codex', false)}>
          <Terminal size={15} /> Codex CLI
        </button>
        <button disabled={!workDir || busy} onClick={() => launch('codex', true)}>
          <RotateCcw size={15} /> Resume Codex
        </button>
      </div>
      {status && (
        <pre className="research-status" aria-live="polite">
          {status}
        </pre>
      )}
    </div>
  )
}
