import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileText, RotateCcw, Send, Terminal } from 'lucide-react'
import type {
  ResearchChatContext,
  ResearchChatMessage,
  ResearchProfile,
  ResearchResource
} from '../../../shared/types'
import { documentRegistry } from '../../models/documentRegistry'
import { useEditorStore } from '../../store/useEditorStore'
import { useProjectStore } from '../../store/useProjectStore'
import { dirname } from '../../utils/path'

interface ResearchChatPanelProps {
  onAiDraft: () => void
}

const DOCUMENT_CONTEXT_LIMIT = 24_000
const HISTORY_LIMIT = 12

function paperContext(profile: ResearchProfile): ResearchChatContext | null {
  const paper = profile.paper
  const content = [
    paper.title && `Title: ${paper.title}`,
    paper.abstract && `Abstract: ${paper.abstract}`,
    paper.doi && `DOI: ${paper.doi}`,
    paper.arxiv && `arXiv: ${paper.arxiv}`,
    paper.venue && `Venue: ${paper.venue}`,
    paper.website && `Website: ${paper.website}`
  ]
    .filter(Boolean)
    .join('\n')
  return content ? { kind: 'paper', label: paper.title || 'Paper metadata', content } : null
}

function authorContext(profile: ResearchProfile): ResearchChatContext | null {
  if (profile.paper.authors.length === 0) return null
  return {
    kind: 'author',
    label: 'Paper authors',
    content: profile.paper.authors
      .map((author) =>
        [
          author.name,
          author.role && `role=${author.role}`,
          author.homepage && `homepage=${author.homepage}`,
          author.github && `github=${author.github}`,
          author.orcid && `orcid=${author.orcid}`
        ]
          .filter(Boolean)
          .join('; ')
      )
      .join('\n')
  }
}

function resourceMetadataContext(resource: ResearchResource): ResearchChatContext {
  const source = resource.url || resource.sshUrl || resource.localPath
  return {
    kind: resource.kind === 'git' ? 'repository' : 'website',
    resourceId: resource.id,
    label: resource.label || resource.id,
    source,
    content: [
      `Resource kind: ${resource.kind}`,
      resource.url && `URL: ${resource.url}`,
      resource.sshUrl && `SSH remote: ${resource.sshUrl}`,
      resource.localPath && `Local path: ${resource.localPath}`,
      resource.branch && `Branch: ${resource.branch}`
    ]
      .filter(Boolean)
      .join('\n')
  }
}

export function ResearchChatPanel({ onAiDraft }: ResearchChatPanelProps) {
  const projectRoot = useProjectStore((state) => state.projectRoot)
  const filePath = useEditorStore((state) => state.filePath)
  const workDir = projectRoot || (filePath ? dirname(filePath) : '')
  const [profile, setProfile] = useState<ResearchProfile | null>(null)
  const [selectedContexts, setSelectedContexts] = useState<Set<string>>(new Set())
  const [messages, setMessages] = useState<ResearchChatMessage[]>([])
  const [prompt, setPrompt] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const loadGeneration = useRef(0)
  const requestGeneration = useRef(0)
  const requestInFlight = useRef(false)
  const previousFilePath = useRef(filePath)

  const isCurrentRequest = useCallback((generation: number, root: string) => {
    return (
      requestGeneration.current === generation && useProjectStore.getState().projectRoot === root
    )
  }, [])

  useEffect(() => {
    const generation = ++loadGeneration.current
    const root = projectRoot
    requestGeneration.current += 1
    requestInFlight.current = false
    setProfile(null)
    setSelectedContexts(new Set())
    setMessages([])
    setPrompt('')
    setStatus('')
    setBusy(false)
    if (!projectRoot) return
    void window.api
      .researchProfileLoad()
      .then((loaded) => {
        if (
          loadGeneration.current !== generation ||
          useProjectStore.getState().projectRoot !== root
        )
          return
        setProfile(loaded)
        const currentFilePath = useEditorStore.getState().filePath
        setSelectedContexts(
          new Set([
            'paper',
            'authors',
            ...(currentFilePath ? ['document'] : []),
            ...loaded.resources
              .filter((resource) => resource.chatAccess !== 'none')
              .map((resource) => `resource:${resource.id}`)
          ])
        )
      })
      .catch((error: unknown) => {
        if (
          loadGeneration.current === generation &&
          useProjectStore.getState().projectRoot === root
        )
          setStatus(error instanceof Error ? error.message : String(error))
      })
  }, [projectRoot])

  useEffect(() => {
    const hadDocument = Boolean(previousFilePath.current)
    previousFilePath.current = filePath
    setSelectedContexts((current) => {
      const hasDocument = current.has('document')
      if ((!filePath && !hasDocument) || (filePath && (hadDocument || hasDocument))) return current
      const next = new Set(current)
      if (filePath) next.add('document')
      else next.delete('document')
      return next
    })
  }, [filePath])

  const contextChips = useMemo(
    () => [
      ...(profile && paperContext(profile) ? [{ id: 'paper', label: 'Paper' }] : []),
      ...(profile?.paper.authors.length ? [{ id: 'authors', label: 'Authors' }] : []),
      ...(filePath ? [{ id: 'document', label: 'Current document' }] : []),
      ...(profile?.resources
        .filter((resource) => resource.chatAccess !== 'none')
        .map((resource) => ({ id: `resource:${resource.id}`, label: resource.label })) ?? [])
    ],
    [filePath, profile]
  )

  const toggleContext = (id: string) => {
    setSelectedContexts((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const buildContexts = useCallback(
    async (generation: number, root: string): Promise<ResearchChatContext[] | null> => {
      if (!profile || !isCurrentRequest(generation, root)) return null
      const contexts: ResearchChatContext[] = []
      if (selectedContexts.has('paper')) {
        const context = paperContext(profile)
        if (context) contexts.push(context)
      }
      if (selectedContexts.has('authors')) {
        const context = authorContext(profile)
        if (context) contexts.push(context)
      }
      if (selectedContexts.has('document') && filePath) {
        const content = documentRegistry.snapshot(filePath)?.text ?? ''
        if (content.trim()) {
          contexts.push({
            kind: 'document',
            label: filePath.split(/[\\/]/u).at(-1) || 'Current document',
            source: filePath,
            content: content.slice(0, DOCUMENT_CONTEXT_LIMIT)
          })
        }
      }

      for (const resource of profile.resources) {
        if (!isCurrentRequest(generation, root)) return null
        if (!selectedContexts.has(`resource:${resource.id}`) || resource.chatAccess === 'none')
          continue
        // Native chat assembly resolves the saved resource by id and applies its access policy.
        // Renderer context deliberately carries metadata only, never fetched or indexed content.
        contexts.push(resourceMetadataContext(resource))
      }
      return isCurrentRequest(generation, root) ? contexts : null
    },
    [filePath, isCurrentRequest, profile, selectedContexts]
  )

  const send = useCallback(async () => {
    const question = prompt.trim()
    if (!question || !projectRoot || !profile || requestInFlight.current) return
    const root = projectRoot
    const generation = ++requestGeneration.current
    requestInFlight.current = true
    setBusy(true)
    setStatus('Gathering selected research context…')
    try {
      const contexts = await buildContexts(generation, root)
      if (!contexts || !isCurrentRequest(generation, root)) return
      const history = messages.slice(-HISTORY_LIMIT)
      setMessages((current) => [...current, { role: 'user', content: question }])
      setPrompt('')
      setStatus('Thinking…')
      const answer = await window.api.aiResearchChat({
        message: question,
        history,
        contexts,
        instructions: profile.instructions
      })
      if (!isCurrentRequest(generation, root)) return
      setMessages((current) => [...current, { role: 'assistant', content: answer }])
      setStatus('')
    } catch (error) {
      if (isCurrentRequest(generation, root)) {
        setStatus(error instanceof Error ? error.message : String(error))
      }
    } finally {
      if (isCurrentRequest(generation, root)) {
        requestInFlight.current = false
        setBusy(false)
      }
    }
  }, [buildContexts, isCurrentRequest, messages, profile, projectRoot, prompt])

  const launch = useCallback(
    async (provider: 'claude' | 'codex', resume: boolean) => {
      if (!workDir || !projectRoot || requestInFlight.current) return
      const root = projectRoot
      const generation = ++requestGeneration.current
      requestInFlight.current = true
      setBusy(true)
      setStatus(`Checking ${provider === 'claude' ? 'Claude Code' : 'Codex CLI'}…`)
      try {
        const available =
          provider === 'claude' ? await window.api.aiCheckCli() : await window.api.aiCheckCodexCli()
        if (!isCurrentRequest(generation, root)) return
        if (!available)
          throw new Error(`${provider === 'claude' ? 'Claude Code' : 'Codex CLI'} was not found.`)
        const result =
          provider === 'claude'
            ? await window.api.aiOpenClaudeTerminal({ workDir, resume })
            : await window.api.aiOpenCodexTerminal({ workDir, resume })
        if (isCurrentRequest(generation, root)) setStatus(result.command)
      } catch (error) {
        if (isCurrentRequest(generation, root)) {
          setStatus(error instanceof Error ? error.message : String(error))
        }
      } finally {
        if (isCurrentRequest(generation, root)) {
          requestInFlight.current = false
          setBusy(false)
        }
      }
    },
    [isCurrentRequest, projectRoot, workDir]
  )

  if (!projectRoot)
    return <div className="research-empty">Open a project to use Research Chat.</div>

  return (
    <div className="research-chat-panel">
      <div className="research-section-heading">Research Chat</div>
      <div className="research-chat-messages" aria-live="polite">
        {messages.length === 0 ? (
          <p className="research-empty">Ask about the paper, current document, or indexed code.</p>
        ) : (
          messages.map((message, index) => (
            <div
              className={`research-chat-message ${message.role}`}
              key={`${message.role}-${index}`}
            >
              <strong>{message.role === 'user' ? 'You' : 'Research Chat'}</strong>
              <p>{message.content}</p>
            </div>
          ))
        )}
      </div>

      <div className="research-chat-composer">
        <div className="research-subheading">Context</div>
        <div className="research-context-chips">
          {contextChips.map((chip) => (
            <button
              type="button"
              className={selectedContexts.has(chip.id) ? 'active' : ''}
              aria-pressed={selectedContexts.has(chip.id)}
              onClick={() => toggleContext(chip.id)}
              key={chip.id}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <textarea
          aria-label="Research question"
          value={prompt}
          placeholder="Ask about this paper or its source code…"
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void send()
            }
          }}
        />
        <button
          className="research-chat-send"
          type="button"
          disabled={!prompt.trim() || !profile || busy}
          onClick={() => void send()}
        >
          <Send size={14} /> {busy ? 'Working…' : 'Send'}
        </button>
        {status && (
          <div className="research-status" role="status">
            {status}
          </div>
        )}
      </div>

      <details className="research-chat-tools">
        <summary>Draft and CLI tools</summary>
        <button className="research-primary-action" onClick={onAiDraft}>
          <FileText size={16} /> AI Draft
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
      </details>
    </div>
  )
}
