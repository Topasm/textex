import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  FileText,
  LoaderCircle,
  Paperclip,
  Plus,
  Quote,
  RotateCcw,
  Send,
  ShieldCheck,
  Slash,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  Wrench,
  X
} from 'lucide-react'
import type {
  ResearchChatExecution,
  OnlineReference,
  ResearchChatContext,
  ResearchChatMessage,
  ResearchChatSessionContext,
  ResearchChatSessionScope,
  ResearchChatSessionSnapshot,
  ResearchProfile,
  ZoteroMutationPlan
} from '../../../shared/types'
import { getActiveEditorAdapter } from '../../editor/activeEditorAdapter'
import { documentRegistry, normalizeDocumentId } from '../../models/documentRegistry'
import {
  buildReferenceChatContext,
  mergeReferenceChatContexts
} from '../../services/referenceChatContext'
import {
  matchResearchChatCommands,
  parseResearchChatCommand,
  type ResearchChatCommandDefinition
} from '../../services/researchChatCommands'
import {
  buildPendingResearchChatDocumentEdit,
  buildResearchChatDocumentEditRequest,
  isResearchChatDocumentWithinEditLimit,
  unwrapResearchChatDocumentEdit,
  type PendingResearchChatDocumentEdit
} from '../../services/researchChatDocumentEdit'
import {
  appendResearchChatSessionMessages,
  compactResearchChatMessageContent,
  compactResearchChatSession,
  compactResearchChatSessionMessages,
  researchChatSessionScope
} from '../../services/researchChatSession'
import { invalidateZoteroInventory } from '../../services/zoteroInventoryCache'
import {
  authorContext,
  paperContext,
  persistedReference,
  referenceRequestContext,
  resourceMetadataContext,
  restoredReference,
  type SessionReferenceContextItem
} from '../../services/researchChatContext'
import {
  isLikelyZoteroMutation,
  zoteroOperationLabel
} from '../../services/zoteroMutationPresentation'
import { useEditorStore } from '../../store/useEditorStore'
import { useCompileStore } from '../../store/useCompileStore'
import { useProjectStore, type ResearchSelectionRequest } from '../../store/useProjectStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { dirname } from '../../utils/path'
import {
  addReferenceAtCursor,
  parseReferenceDragData,
  TEXTEX_REFERENCE_MIME,
  type ReferenceDragPayload
} from './referenceActions'
import { ResearchChatCommandMenu } from './ResearchChatCommandMenu'
import { ResearchChatModelSelector, researchChatExecutionLabel } from './ResearchChatModelSelector'

interface ResearchChatPanelProps {
  onAiDraft: () => void
  onCompile?: () => Promise<void>
  incomingSelection?: ResearchSelectionRequest | null
  onIncomingSelectionConsumed?: (token: number) => void
  incomingReference?: {
    token: number
    projectRoot: string
    payload: ReferenceDragPayload
  } | null
  onIncomingReferenceConsumed?: (token: number) => void
  incomingPrompt?: {
    token: number
    projectRoot: string
    prompt: string
  } | null
  onIncomingPromptConsumed?: (token: number) => void
}

interface ContextOption {
  id: string
  label: string
  context?: ResearchChatContext
  persisted?: ResearchChatSessionContext
}

interface SelectionChatContext {
  id: string
  label: string
  source: string
  content: string
}

const DOCUMENT_CONTEXT_LIMIT = 24_000
const HISTORY_LIMIT = 12
const REFERENCE_SEARCH_QUERY_LIMIT = 512
const PROMPT_QUEUE_LIMIT = 8

const CHAT_STARTERS = [
  {
    label: 'Summarize context',
    prompt: 'Summarize the selected research context and highlight the main contribution.'
  },
  {
    label: 'Review the argument',
    prompt: 'Review the current argument for gaps, weak evidence, and unclear claims.'
  },
  {
    label: 'Plan the next section',
    prompt: 'Suggest a focused outline for the next section based on the selected context.'
  }
] as const

function sourcePayload(
  source: ResearchChatSessionContext,
  zoteroPort: number
): ReferenceDragPayload | null {
  if (source.kind !== 'reference' || !source.referenceSource) return null
  if (source.referenceSource === 'online') {
    return source.onlineReference ? { source: 'online', reference: source.onlineReference } : null
  }
  if (!source.citekey) return null
  return source.referenceSource === 'zotero'
    ? { source: 'zotero', citekey: source.citekey, port: zoteroPort }
    : { source: 'project', citekey: source.citekey }
}

export { isLikelyZoteroMutation } from '../../services/zoteroMutationPresentation'

export function ResearchChatPanel({
  onAiDraft,
  onCompile,
  incomingSelection = null,
  onIncomingSelectionConsumed,
  incomingReference = null,
  onIncomingReferenceConsumed,
  incomingPrompt = null,
  onIncomingPromptConsumed
}: ResearchChatPanelProps) {
  const projectRoot = useProjectStore((state) => state.projectRoot)
  const filePath = useEditorStore((state) => state.filePath)
  const workDir = projectRoot || (filePath ? dirname(filePath) : '')
  const defaultAiProvider = useSettingsStore((state) => state.settings.aiProvider)
  const defaultAiModel = useSettingsStore((state) => state.settings.aiModel)
  const [profile, setProfile] = useState<ResearchProfile | null>(null)
  const [selectedContexts, setSelectedContexts] = useState<Set<string>>(new Set())
  const [referenceContexts, setReferenceContexts] = useState<SessionReferenceContextItem[]>([])
  const [selectionContext, setSelectionContext] = useState<SelectionChatContext | null>(null)
  const [messages, setMessages] = useState<ResearchChatMessage[]>([])
  const [executionOverride, setExecutionOverride] = useState<ResearchChatExecution | null>(null)
  const [prompt, setPrompt] = useState('')
  const [queuedPrompts, setQueuedPrompts] = useState<string[]>([])
  const [commandMenuDismissed, setCommandMenuDismissed] = useState(false)
  const [activeCommandIndex, setActiveCommandIndex] = useState(0)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionBusy, setActionBusy] = useState('')
  const [pendingZoteroPlan, setPendingZoteroPlan] = useState<ZoteroMutationPlan | null>(null)
  const [pendingDocumentEdit, setPendingDocumentEdit] =
    useState<PendingResearchChatDocumentEdit | null>(null)
  const [dropActive, setDropActive] = useState(false)
  const [sessionReadyRoot, setSessionReadyRoot] = useState<string | null>(null)
  const loadGeneration = useRef(0)
  const requestGeneration = useRef(0)
  const requestSerial = useRef(0)
  const requestInFlight = useRef(false)
  const activeRequestId = useRef<string | null>(null)
  const actionInFlight = useRef(false)
  const messagesRef = useRef<ResearchChatMessage[]>([])
  const queuedPromptsRef = useRef<string[]>([])
  const historyIndexRef = useRef<number | null>(null)
  const historyDraftRef = useRef('')
  const referenceContextsRef = useRef<SessionReferenceContextItem[]>([])
  const sessionScopeRef = useRef<ResearchChatSessionScope | null>(null)
  const sessionMutationQueue = useRef<Promise<void>>(Promise.resolve())
  const composerInputRef = useRef<HTMLTextAreaElement>(null)
  const messageEndRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)
  const previousFilePath = useRef(filePath)
  const consumedIncomingToken = useRef<number | null>(null)
  const consumedSelectionToken = useRef<number | null>(null)
  const consumedPromptToken = useRef<number | null>(null)
  const generatedCommandListboxId = useId().replace(/:/gu, '')
  const commandListboxId = `research-chat-commands-${generatedCommandListboxId}`
  const commandHintId = `research-chat-command-hint-${generatedCommandListboxId}`
  const zoteroPlanHeadingId = `research-zotero-plan-heading-${generatedCommandListboxId}`
  const zoteroPlanDescriptionId = `research-zotero-plan-description-${generatedCommandListboxId}`
  const commandSuggestions = useMemo(
    () => (commandMenuDismissed ? [] : [...matchResearchChatCommands(prompt)]),
    [commandMenuDismissed, prompt]
  )
  const commandMenuOpen = commandSuggestions.length > 0
  const exactPromptCommand = useMemo(() => parseResearchChatCommand(prompt.trim()), [prompt])
  const activeCommandId = commandMenuOpen
    ? `${commandListboxId}-option-${activeCommandIndex}`
    : undefined

  const inputHistory = useMemo(
    () => messages.filter((message) => message.role === 'user').map((message) => message.content),
    [messages]
  )

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(
    () => () => {
      const requestToCancel = activeRequestId.current
      activeRequestId.current = null
      requestGeneration.current += 1
      requestInFlight.current = false
      if (requestToCancel) {
        void window.api.aiCancelResearchChat(requestToCancel).catch(() => false)
      }
    },
    []
  )

  useEffect(() => {
    queuedPromptsRef.current = queuedPrompts
  }, [queuedPrompts])

  const fillComposer = useCallback((value: string) => {
    setPrompt(value)
    historyIndexRef.current = null
    historyDraftRef.current = value
    setCommandMenuDismissed(false)
    setActiveCommandIndex(0)
    composerInputRef.current?.focus()
  }, [])

  const openCommandMenu = useCallback(() => {
    if (prompt.trim() && !prompt.trimStart().startsWith('/')) {
      setStatus('Clear the current draft before choosing a slash command.')
      composerInputRef.current?.focus()
      return
    }
    fillComposer(prompt || '/')
  }, [fillComposer, prompt])

  useEffect(() => {
    const input = composerInputRef.current
    if (!input) return
    input.style.height = '0px'
    input.style.height = `${Math.min(Math.max(input.scrollHeight, 56), 120)}px`
  }, [prompt])

  useEffect(() => {
    if ((messages.length === 0 && !busy && !pendingZoteroPlan) || !shouldAutoScrollRef.current)
      return
    const end = messageEndRef.current
    if (end && typeof end.scrollIntoView === 'function') {
      end.scrollIntoView({ block: 'end', behavior: 'smooth' })
    }
  }, [busy, messages.length, pendingZoteroPlan])

  useEffect(() => {
    if (activeCommandIndex < commandSuggestions.length) return
    setActiveCommandIndex(Math.max(0, commandSuggestions.length - 1))
  }, [activeCommandIndex, commandSuggestions.length])

  const selectCommandSuggestion = useCallback((command: ResearchChatCommandDefinition) => {
    setPrompt(`${command.command}${command.acceptsArguments ? ' ' : ''}`)
    setCommandMenuDismissed(!command.acceptsArguments)
    setActiveCommandIndex(0)
  }, [])

  const attachReference = useCallback((payload: ReferenceDragPayload) => {
    const item: SessionReferenceContextItem = buildReferenceChatContext(payload)
    const current = referenceContextsRef.current
    const alreadyAttached = current.some((entry) => entry.id === item.id)
    const next = mergeReferenceChatContexts(current, item)
    if (!alreadyAttached && !next.some((entry) => entry.id === item.id)) {
      setStatus('Chat supports up to 12 attached references.')
      return 'limit' as const
    }
    referenceContextsRef.current = next
    setReferenceContexts(next)
    setSelectedContexts((selected) => new Set(selected).add(item.id))
    setStatus(
      alreadyAttached
        ? `“${item.label}” is already attached to Chat.`
        : `Added “${item.label}” to Chat context.`
    )
    return alreadyAttached ? ('duplicate' as const) : ('added' as const)
  }, [])

  const isCurrentRequest = useCallback((generation: number, root: string) => {
    return (
      requestGeneration.current === generation && useProjectStore.getState().projectRoot === root
    )
  }, [])

  const isCurrentAction = useCallback((generation: number, root: string) => {
    return loadGeneration.current === generation && useProjectStore.getState().projectRoot === root
  }, [])

  const enqueueSessionMutation = useCallback(
    <T extends ResearchChatSessionSnapshot>(
      generation: number,
      root: string,
      mutate: (scope: ResearchChatSessionScope) => Promise<T>
    ): Promise<T | null> => {
      const operation = sessionMutationQueue.current.then(async () => {
        if (!isCurrentAction(generation, root)) return null
        const scope = sessionScopeRef.current
        if (!scope || scope.projectRoot !== root) return null
        const snapshot = await mutate(scope)
        if (!isCurrentAction(generation, root)) return null
        sessionScopeRef.current = researchChatSessionScope(snapshot)
        return snapshot
      })
      sessionMutationQueue.current = operation.then(
        () => undefined,
        () => undefined
      )
      return operation
    },
    [isCurrentAction]
  )

  useEffect(() => {
    const requestToCancel = activeRequestId.current
    if (requestToCancel) void window.api.aiCancelResearchChat(requestToCancel).catch(() => false)
    activeRequestId.current = null
    const generation = ++loadGeneration.current
    const root = projectRoot
    requestGeneration.current += 1
    requestInFlight.current = false
    actionInFlight.current = false
    shouldAutoScrollRef.current = true
    referenceContextsRef.current = []
    sessionScopeRef.current = null
    setProfile(null)
    setSelectedContexts(new Set())
    setReferenceContexts([])
    setSelectionContext(null)
    setMessages([])
    messagesRef.current = []
    setExecutionOverride(null)
    setPrompt('')
    setQueuedPrompts([])
    queuedPromptsRef.current = []
    historyIndexRef.current = null
    historyDraftRef.current = ''
    setCommandMenuDismissed(false)
    setActiveCommandIndex(0)
    setStatus('')
    setBusy(false)
    setActionBusy('')
    setPendingZoteroPlan(null)
    setPendingDocumentEdit(null)
    setDropActive(false)
    setSessionReadyRoot(null)
    consumedIncomingToken.current = null
    consumedSelectionToken.current = null
    consumedPromptToken.current = null
    if (!root) return

    void Promise.allSettled([
      window.api.researchProfileLoad(),
      window.api.researchChatSessionLoad()
    ]).then(([profileResult, sessionResult]) => {
      if (loadGeneration.current !== generation || useProjectStore.getState().projectRoot !== root)
        return
      if (profileResult.status === 'rejected') {
        setStatus(
          profileResult.reason instanceof Error
            ? profileResult.reason.message
            : String(profileResult.reason)
        )
        return
      }

      const loadedProfile = profileResult.value
      setProfile(loadedProfile)
      const defaultIds = new Set([
        'paper',
        'authors',
        ...(useEditorStore.getState().filePath ? ['document'] : []),
        ...loadedProfile.resources
          .filter((resource) => resource.chatAccess !== 'none')
          .map((resource) => `resource:${resource.id}`)
      ])
      if (sessionResult.status === 'fulfilled') {
        const snapshot = sessionResult.value
        const session = snapshot.session
        sessionScopeRef.current = researchChatSessionScope(snapshot)
        const hasSavedState = session.messages.length > 0 || session.selectedContexts.length > 0
        setMessages(compactResearchChatSessionMessages(session.messages))
        setExecutionOverride(session.execution ?? null)
        const restoredReferences = session.selectedContexts
          .map(restoredReference)
          .filter((item): item is SessionReferenceContextItem => item !== null)
        referenceContextsRef.current = restoredReferences
        setReferenceContexts(restoredReferences)
        setSelectedContexts(
          hasSavedState
            ? new Set(session.selectedContexts.map((context) => context.id))
            : defaultIds
        )
      } else {
        setSelectedContexts(defaultIds)
        setStatus(
          sessionResult.reason instanceof Error
            ? sessionResult.reason.message
            : String(sessionResult.reason)
        )
      }
      setSessionReadyRoot(root)
    })
  }, [projectRoot])

  useEffect(() => {
    if (
      !incomingSelection ||
      incomingSelection.projectRoot !== projectRoot ||
      sessionReadyRoot !== projectRoot ||
      consumedSelectionToken.current === incomingSelection.token
    ) {
      return
    }
    consumedSelectionToken.current = incomingSelection.token
    const fileName = incomingSelection.filePath.split(/[\\/]/u).at(-1) || 'document'
    const lineLabel =
      incomingSelection.startLine === incomingSelection.endLine
        ? `L${incomingSelection.startLine}`
        : `L${incomingSelection.startLine}–${incomingSelection.endLine}`
    const id = `selection:${incomingSelection.token}`
    setSelectionContext({
      id,
      label: `Selection · ${fileName}:${lineLabel}`,
      source: `${incomingSelection.filePath}#${lineLabel}`,
      content: incomingSelection.content
    })
    setSelectedContexts((current) => new Set(current).add(id))
    setStatus('Added the editor selection to Chat context.')
    onIncomingSelectionConsumed?.(incomingSelection.token)
  }, [incomingSelection, onIncomingSelectionConsumed, projectRoot, sessionReadyRoot])

  useEffect(() => {
    if (
      !incomingReference ||
      incomingReference.projectRoot !== projectRoot ||
      sessionReadyRoot !== projectRoot ||
      consumedIncomingToken.current === incomingReference.token
    ) {
      return
    }
    consumedIncomingToken.current = incomingReference.token
    attachReference(incomingReference.payload)
    onIncomingReferenceConsumed?.(incomingReference.token)
  }, [
    attachReference,
    incomingReference,
    onIncomingReferenceConsumed,
    projectRoot,
    sessionReadyRoot
  ])

  useEffect(() => {
    if (
      !incomingPrompt ||
      incomingPrompt.projectRoot !== projectRoot ||
      sessionReadyRoot !== projectRoot ||
      consumedPromptToken.current === incomingPrompt.token
    ) {
      return
    }
    consumedPromptToken.current = incomingPrompt.token
    fillComposer(incomingPrompt.prompt)
    setStatus('Added the compilation problems to the Chat composer. Review and send when ready.')
    onIncomingPromptConsumed?.(incomingPrompt.token)
  }, [fillComposer, incomingPrompt, onIncomingPromptConsumed, projectRoot, sessionReadyRoot])

  useEffect(() => {
    const hadDocument = Boolean(previousFilePath.current)
    if (previousFilePath.current !== filePath) setPendingDocumentEdit(null)
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

  const contextOptions = useMemo<ContextOption[]>(() => {
    const referenceOptions = referenceContexts.map((item) => ({
      id: item.id,
      label: item.label,
      context: referenceRequestContext(item),
      persisted: persistedReference(item)
    }))
    const selectionOptions: ContextOption[] = selectionContext
      ? [
          {
            id: selectionContext.id,
            label: selectionContext.label,
            context: {
              kind: 'document',
              label: selectionContext.label,
              source: selectionContext.source,
              content: selectionContext.content
            }
          }
        ]
      : []
    if (!profile) {
      return [
        ...(filePath
          ? [
              {
                id: 'document',
                label: 'Current document',
                persisted: {
                  id: 'document',
                  kind: 'document' as const,
                  label: 'Current document',
                  source: filePath
                }
              }
            ]
          : []),
        ...selectionOptions,
        ...referenceOptions
      ]
    }
    const paper = paperContext(profile)
    const authors = authorContext(profile)
    return [
      ...(paper
        ? [
            {
              id: 'paper',
              label: 'Paper',
              context: paper,
              persisted: { id: 'paper', kind: 'paper' as const, label: paper.label }
            }
          ]
        : []),
      ...(authors
        ? [
            {
              id: 'authors',
              label: 'Authors',
              context: authors,
              persisted: { id: 'authors', kind: 'author' as const, label: authors.label }
            }
          ]
        : []),
      ...(filePath
        ? [
            {
              id: 'document',
              label: 'Current document',
              persisted: {
                id: 'document',
                kind: 'document' as const,
                label: filePath.split(/[\\/]/u).at(-1) || 'Current document',
                source: filePath
              }
            }
          ]
        : []),
      ...profile.resources
        .filter((resource) => resource.chatAccess !== 'none')
        .map((resource) => {
          const context = resourceMetadataContext(resource)
          return {
            id: `resource:${resource.id}`,
            label: resource.label || resource.id,
            context,
            persisted: {
              id: `resource:${resource.id}`,
              kind: context.kind,
              label: context.label,
              source: context.source,
              resourceId: resource.id
            }
          }
        }),
      ...selectionOptions,
      ...referenceOptions
    ]
  }, [filePath, profile, referenceContexts, selectionContext])

  const selectedSessionContexts = useMemo(
    () =>
      contextOptions
        .filter((option) => selectedContexts.has(option.id))
        .flatMap((option) => (option.persisted ? [option.persisted] : [])),
    [contextOptions, selectedContexts]
  )
  const selectedContextCount = contextOptions.reduce(
    (count, option) => count + (selectedContexts.has(option.id) ? 1 : 0),
    0
  )

  useEffect(() => {
    if (!projectRoot || sessionReadyRoot !== projectRoot || !profile) return
    const root = projectRoot
    const generation = loadGeneration.current
    const session = compactResearchChatSession(messages, selectedSessionContexts, executionOverride)
    void enqueueSessionMutation(generation, root, (scope) =>
      window.api.researchChatSessionSave(scope, session)
    ).catch((error: unknown) => {
      if (isCurrentAction(generation, root)) {
        setStatus(error instanceof Error ? error.message : String(error))
      }
    })
  }, [
    enqueueSessionMutation,
    isCurrentAction,
    messages,
    executionOverride,
    profile,
    projectRoot,
    selectedSessionContexts,
    sessionReadyRoot
  ])

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
      for (const option of contextOptions) {
        if (!isCurrentRequest(generation, root)) return null
        if (!selectedContexts.has(option.id)) continue
        if (option.id === 'document') {
          if (!filePath) continue
          const content = documentRegistry.snapshot(filePath)?.text ?? ''
          if (content.trim()) {
            contexts.push({
              kind: 'document',
              label: filePath.split(/[\\/]/u).at(-1) || 'Current document',
              source: filePath,
              content: content.slice(0, DOCUMENT_CONTEXT_LIMIT)
            })
          }
        } else if (option.context) {
          contexts.push(option.context)
        }
      }
      return isCurrentRequest(generation, root) ? contexts : null
    },
    [contextOptions, filePath, isCurrentRequest, profile, selectedContexts]
  )

  const runLocalSlashCommand = useCallback(
    (command: ResearchChatCommandDefinition, argument: string): boolean => {
      const projectStore = useProjectStore.getState()
      const query = argument.replace(/\s+/gu, ' ').trim().slice(0, REFERENCE_SEARCH_QUERY_LIMIT)
      switch (command.id) {
        case 'help':
          setPrompt('/')
          setCommandMenuDismissed(false)
          setActiveCommandIndex(0)
          setStatus('Choose a command from the menu. App actions are not sent to the AI.')
          return true
        case 'references':
          projectStore.setResearchSearchQuery(query)
          projectStore.setResearchReferenceSource('project')
          projectStore.openResearchPanel('references')
          setPrompt('')
          return true
        case 'zotero':
          projectStore.setResearchSearchQuery(query)
          projectStore.setResearchReferenceSource('zotero')
          projectStore.openResearchPanel('references')
          setPrompt('')
          return true
        case 'online':
          projectStore.setResearchSearchQuery(query)
          projectStore.setResearchReferenceSource('online')
          projectStore.openResearchPanel('references')
          setPrompt('')
          return true
        case 'find-sources':
          projectStore.setResearchSearchQuery(query)
          projectStore.setResearchReferenceSource('project')
          projectStore.openResearchPanel('references')
          setPrompt('')
          return true
        case 'submission-check':
          projectStore.setResearchReferenceSource('submission')
          projectStore.openResearchPanel('references')
          setPrompt('')
          return true
        case 'todo':
        case 'outline':
          projectStore.setSidebarView(command.id)
          if (!projectStore.isSidebarOpen) projectStore.toggleSidebar()
          setPrompt('')
          setStatus(
            command.id === 'todo'
              ? 'Opened the project TODO panel.'
              : 'Opened the current document outline.'
          )
          return true
        case 'draft':
          setPrompt('')
          onAiDraft()
          return true
        case 'zotero-plan':
          return false
      }
    },
    [onAiDraft]
  )

  const enqueuePrompt = useCallback((question: string) => {
    const current = queuedPromptsRef.current
    if (current.length >= PROMPT_QUEUE_LIMIT) {
      setStatus(`Chat queue supports up to ${PROMPT_QUEUE_LIMIT} messages.`)
      return false
    }
    const next = [...current, question]
    queuedPromptsRef.current = next
    setQueuedPrompts(next)
    setPrompt('')
    historyIndexRef.current = null
    historyDraftRef.current = ''
    setStatus(`${next.length} message${next.length === 1 ? '' : 's'} queued.`)
    return true
  }, [])

  const send = useCallback(
    async (queuedQuestion?: string) => {
      const question = compactResearchChatMessageContent((queuedQuestion ?? prompt).trim())
      if (!question || !projectRoot) return
      if (requestInFlight.current || pendingZoteroPlan) {
        enqueuePrompt(question)
        return
      }
      const parsedCommand = parseResearchChatCommand(question)
      if (parsedCommand && runLocalSlashCommand(parsedCommand.command, parsedCommand.argument))
        return
      if (!profile) return
      const zoteroPlanRequest =
        parsedCommand?.command.id === 'zotero-plan' ? parsedCommand.argument : null
      if (parsedCommand?.command.id === 'zotero-plan' && !zoteroPlanRequest) {
        setPrompt('/zotero-plan ')
        setStatus('Describe the Zotero changes to preview before sending.')
        return
      }
      if (queuedQuestion === undefined) setPrompt('')
      historyIndexRef.current = null
      historyDraftRef.current = ''
      const root = projectRoot
      const generation = ++requestGeneration.current
      requestSerial.current += 1
      const requestId = `research-${Date.now()}-${requestSerial.current}`
      activeRequestId.current = requestId
      requestInFlight.current = true
      setBusy(true)
      setStatus('Gathering selected research context…')
      const history = compactResearchChatSessionMessages(
        messagesRef.current.slice(-HISTORY_LIMIT)
      ).map(({ role, content }) => ({ role, content }))
      setMessages((current) =>
        appendResearchChatSessionMessages(current, { role: 'user', content: question })
      )
      try {
        const contexts = await buildContexts(generation, root)
        if (!contexts || !isCurrentRequest(generation, root)) return
        const answerSources = selectedSessionContexts.filter(
          (context) => context.kind === 'reference'
        )
        if (zoteroPlanRequest || isLikelyZoteroMutation(question)) {
          setStatus('Preparing a read-only Zotero change preview…')
          const port = useSettingsStore.getState().settings.zoteroPort
          const plan = await window.api.aiPlanZotero(
            { message: zoteroPlanRequest || question, history },
            port
          )
          if (!isCurrentRequest(generation, root)) return
          setPendingZoteroPlan(plan)
          setStatus('Review the Zotero changes below. Nothing has been changed yet.')
          return
        }
        setStatus('Thinking…')
        const answer = await window.api.aiResearchChat({
          requestId,
          message: question,
          history,
          contexts,
          instructions: profile.instructions,
          ...(executionOverride ? { execution: executionOverride } : {})
        })
        if (!isCurrentRequest(generation, root)) return
        const compactAnswer = compactResearchChatMessageContent(answer.content)
        setMessages((current) =>
          appendResearchChatSessionMessages(current, {
            role: 'assistant',
            content: compactAnswer.trim()
              ? compactAnswer
              : 'The provider returned an empty answer.',
            execution: answer.execution,
            ...(answerSources.length > 0 ? { sources: answerSources } : {})
          })
        )
        setStatus('')
      } catch (error) {
        if (isCurrentRequest(generation, root)) {
          setStatus(error instanceof Error ? error.message : String(error))
        }
      } finally {
        if (isCurrentRequest(generation, root)) {
          if (activeRequestId.current === requestId) activeRequestId.current = null
          requestInFlight.current = false
          setBusy(false)
        }
      }
    },
    [
      buildContexts,
      enqueuePrompt,
      executionOverride,
      isCurrentRequest,
      pendingZoteroPlan,
      profile,
      projectRoot,
      prompt,
      runLocalSlashCommand,
      selectedSessionContexts
    ]
  )

  const stopRequest = useCallback(async () => {
    if (!requestInFlight.current) return
    const requestId = activeRequestId.current
    activeRequestId.current = null
    requestGeneration.current += 1
    requestInFlight.current = false
    setBusy(false)
    setStatus('Stopping the current Chat request…')
    if (requestId) {
      await window.api.aiCancelResearchChat(requestId).catch(() => false)
    }
    setStatus('Chat request stopped. Queued messages were preserved.')
  }, [])

  useEffect(() => {
    if (
      busy ||
      requestInFlight.current ||
      pendingZoteroPlan ||
      !profile ||
      !projectRoot ||
      queuedPrompts.length === 0
    ) {
      return
    }
    const [nextQuestion, ...remaining] = queuedPrompts
    queuedPromptsRef.current = remaining
    setQueuedPrompts(remaining)
    void send(nextQuestion)
  }, [busy, pendingZoteroPlan, profile, projectRoot, queuedPrompts, send])

  const applyZoteroPlan = useCallback(async () => {
    if (!pendingZoteroPlan || !projectRoot || actionInFlight.current) return
    const root = projectRoot
    const generation = loadGeneration.current
    const plan = pendingZoteroPlan
    actionInFlight.current = true
    setActionBusy('zotero-plan')
    setStatus('Waiting for Zotero authorization…')
    try {
      const result = await window.api.zoteroApplyMutationPlan(plan)
      if (!isCurrentAction(generation, root)) return
      invalidateZoteroInventory(useSettingsStore.getState().settings.zoteroPort)
      setPendingZoteroPlan(null)
      setMessages((current) =>
        appendResearchChatSessionMessages(current, {
          role: 'assistant',
          content: `${result.summary} ${result.collectionChanges} collection change(s), ${result.itemChanges} item change(s).`
        })
      )
      setStatus('Zotero changes applied.')
    } catch (error) {
      if (isCurrentAction(generation, root)) {
        setStatus(error instanceof Error ? error.message : String(error))
      }
    } finally {
      if (isCurrentAction(generation, root)) {
        actionInFlight.current = false
        setActionBusy('')
      }
    }
  }, [isCurrentAction, pendingZoteroPlan, projectRoot])

  const cancelZoteroPlan = useCallback(() => {
    if (!pendingZoteroPlan || actionInFlight.current) return
    setPendingZoteroPlan(null)
    setMessages((current) =>
      appendResearchChatSessionMessages(current, {
        role: 'assistant',
        content: 'Cancelled the Zotero changes. Nothing was modified.'
      })
    )
    setStatus('Zotero changes cancelled.')
  }, [pendingZoteroPlan])

  const dropReference = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      setDropActive(false)
      const payload = parseReferenceDragData(event.dataTransfer.getData(TEXTEX_REFERENCE_MIME))
      if (!payload) {
        setStatus('This item is not a valid TextEx reference.')
        return
      }
      attachReference(payload)
    },
    [attachReference]
  )

  const citeSource = useCallback(
    async (source: ResearchChatSessionContext, key: string) => {
      const port = useSettingsStore.getState().settings.zoteroPort
      const payload = sourcePayload(source, port)
      if (!payload || !projectRoot || actionInFlight.current) return
      const root = projectRoot
      const generation = loadGeneration.current
      actionInFlight.current = true
      setActionBusy(key)
      try {
        const inserted = await addReferenceAtCursor(payload)
        if (isCurrentAction(generation, root)) {
          setStatus(
            inserted
              ? `Inserted citation for “${source.label}”.`
              : `Added “${source.label}”, but the editor changed before citation insertion.`
          )
        }
      } catch (error) {
        if (isCurrentAction(generation, root)) {
          setStatus(error instanceof Error ? error.message : String(error))
        }
      } finally {
        if (isCurrentAction(generation, root)) {
          actionInFlight.current = false
          setActionBusy('')
        }
      }
    },
    [isCurrentAction, projectRoot]
  )

  const saveOnlineSource = useCallback(
    async (reference: OnlineReference, key: string) => {
      if (!projectRoot || actionInFlight.current) return
      const root = projectRoot
      const generation = loadGeneration.current
      actionInFlight.current = true
      setActionBusy(key)
      try {
        const port = useSettingsStore.getState().settings.zoteroPort
        const result = await window.api.zoteroSaveOnline(reference, port)
        if (isCurrentAction(generation, root)) {
          invalidateZoteroInventory(port)
          setStatus(result.duplicate ? 'Already saved in Zotero.' : 'Saved to Zotero.')
        }
      } catch (error) {
        if (isCurrentAction(generation, root)) {
          setStatus(error instanceof Error ? error.message : String(error))
        }
      } finally {
        if (isCurrentAction(generation, root)) {
          actionInFlight.current = false
          setActionBusy('')
        }
      }
    },
    [isCurrentAction, projectRoot]
  )

  const prepareDocumentEdit = useCallback(
    async (content: string, key: string) => {
      const editor = useEditorStore.getState()
      const activePath = editor.activeFilePath
      if (!activePath || !projectRoot || actionInFlight.current) return
      const snapshot = documentRegistry.snapshot(activePath)
      const model = documentRegistry.getModel(activePath)
      if (!snapshot || !model) {
        setStatus('The active document is not available for editing.')
        return
      }
      if (!isResearchChatDocumentWithinEditLimit(snapshot.text)) {
        setStatus('This document is too large for a Chat-generated edit.')
        return
      }

      const root = projectRoot
      const generation = loadGeneration.current
      const request = buildResearchChatDocumentEditRequest(content, activePath, snapshot)

      actionInFlight.current = true
      setActionBusy(key)
      setStatus('Preparing a document change preview…')
      try {
        const response = await window.api.aiProcessCustom(request)
        if (!isCurrentAction(generation, root)) return
        const currentEditor = useEditorStore.getState()
        if (
          currentEditor.activeFilePath !== activePath ||
          !documentRegistry.getModel(activePath)?.isCurrent(snapshot)
        ) {
          setStatus('The document changed while the edit was being prepared. Try again.')
          return
        }
        const proposedText = unwrapResearchChatDocumentEdit(response)
        if (!proposedText.trim()) {
          setStatus('The provider returned an empty document edit.')
          return
        }
        if (proposedText === snapshot.text) {
          setStatus('The recommendation does not require a source change.')
          return
        }
        setPendingDocumentEdit(
          buildPendingResearchChatDocumentEdit(activePath, snapshot, proposedText)
        )
        setStatus('Review the proposed source change before applying it.')
      } catch (error) {
        if (isCurrentAction(generation, root)) {
          setStatus(error instanceof Error ? error.message : String(error))
        }
      } finally {
        if (isCurrentAction(generation, root)) {
          actionInFlight.current = false
          setActionBusy('')
        }
      }
    },
    [isCurrentAction, projectRoot]
  )

  const discardDocumentEdit = useCallback(() => {
    setPendingDocumentEdit(null)
    setStatus('Document edit discarded. The source was not changed.')
  }, [])

  const applyDocumentEdit = useCallback(
    async (compileAfterApply: boolean) => {
      if (!pendingDocumentEdit) return
      const editor = useEditorStore.getState()
      const model = documentRegistry.getModel(pendingDocumentEdit.filePath)
      if (
        editor.activeFilePath !== pendingDocumentEdit.filePath ||
        !model?.isCurrent(pendingDocumentEdit.snapshot)
      ) {
        setPendingDocumentEdit(null)
        setStatus('The document changed after this preview was created. Prepare the edit again.')
        return
      }

      const adapter = getActiveEditorAdapter()
      const adapterMatches =
        adapter?.getDocumentId() != null &&
        normalizeDocumentId(adapter.getDocumentId()!) ===
          normalizeDocumentId(pendingDocumentEdit.filePath)
      if (adapter && adapterMatches) {
        const lastLine = Math.max(1, adapter.getLineCount())
        const applied = adapter.applyEdits('research-chat-document-edit', [
          {
            range: {
              start: { line: 1, column: 1 },
              end: { line: lastLine, column: adapter.getLineMaxColumn(lastLine) }
            },
            text: pendingDocumentEdit.proposedText,
            forceMoveMarkers: true
          }
        ])
        if (!applied) {
          setStatus('The editor could not apply this change. Prepare the edit again.')
          return
        }
        adapter.focus()
      } else {
        const updated = editor.updateActiveDocument(
          pendingDocumentEdit.proposedText,
          'programmatic'
        )
        if (!updated) {
          setStatus('The editor could not apply this change. Prepare the edit again.')
          return
        }
      }

      const fileName = pendingDocumentEdit.filePath.split(/[\\/]/u).at(-1) || 'document'
      setPendingDocumentEdit(null)
      if (compileAfterApply && onCompile) {
        setActionBusy('document-compile')
        setStatus(`Applied the proposed change to ${fileName}. Compiling…`)
        try {
          await onCompile()
          const compileStatus = useCompileStore.getState().compileStatus
          setStatus(
            compileStatus === 'success'
              ? `Applied and compiled ${fileName} successfully.`
              : compileStatus === 'error'
                ? `Applied ${fileName}, but compilation still reports problems. Review the Problems panel.`
                : `Applied ${fileName}. Compilation did not produce a current result.`
          )
        } finally {
          setActionBusy('')
        }
        return
      }
      setStatus(`Applied the proposed change to ${fileName}. Review and compile before saving.`)
    },
    [onCompile, pendingDocumentEdit]
  )

  const navigatePromptHistory = useCallback(
    (direction: 'previous' | 'next'): boolean => {
      if (inputHistory.length === 0) return false
      const currentIndex = historyIndexRef.current
      if (direction === 'previous') {
        if (currentIndex === null) historyDraftRef.current = prompt
        const nextIndex =
          currentIndex === null ? inputHistory.length - 1 : Math.max(0, currentIndex - 1)
        historyIndexRef.current = nextIndex
        setPrompt(inputHistory[nextIndex])
      } else {
        if (currentIndex === null) return false
        const nextIndex = currentIndex + 1
        if (nextIndex >= inputHistory.length) {
          historyIndexRef.current = null
          setPrompt(historyDraftRef.current)
        } else {
          historyIndexRef.current = nextIndex
          setPrompt(inputHistory[nextIndex])
        }
      }
      setCommandMenuDismissed(true)
      setActiveCommandIndex(0)
      return true
    },
    [inputHistory, prompt]
  )

  const clearChat = useCallback(async () => {
    if (!profile || !projectRoot || busy || actionInFlight.current) return
    const root = projectRoot
    const generation = loadGeneration.current
    actionInFlight.current = true
    setActionBusy('clear-chat')
    try {
      const cleared = await enqueueSessionMutation(generation, root, (scope) =>
        window.api.researchChatSessionClear(scope)
      )
      if (!cleared) return
      shouldAutoScrollRef.current = true
      setMessages([])
      messagesRef.current = []
      setExecutionOverride(null)
      setQueuedPrompts([])
      queuedPromptsRef.current = []
      historyIndexRef.current = null
      historyDraftRef.current = ''
      setPendingDocumentEdit(null)
      referenceContextsRef.current = []
      setReferenceContexts([])
      setSelectedContexts(
        new Set([
          'paper',
          'authors',
          ...(useEditorStore.getState().filePath ? ['document'] : []),
          ...profile.resources
            .filter((resource) => resource.chatAccess !== 'none')
            .map((resource) => `resource:${resource.id}`)
        ])
      )
      setStatus('Chat history cleared.')
    } catch (error) {
      if (isCurrentAction(generation, root)) {
        setStatus(error instanceof Error ? error.message : String(error))
      }
    } finally {
      if (isCurrentAction(generation, root)) {
        actionInFlight.current = false
        setActionBusy('')
      }
    }
  }, [busy, enqueueSessionMutation, isCurrentAction, profile, projectRoot])

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

  const headerStatus = !profile
    ? status
      ? 'Research context unavailable'
      : 'Loading research context…'
    : busy
      ? 'Working with selected context…'
      : `${selectedContextCount} of ${contextOptions.length} contexts selected`

  return (
    <div className="research-chat-panel">
      <header className="research-chat-heading">
        <div className="research-chat-heading-copy">
          <span className="research-chat-brand-icon" aria-hidden="true">
            <Sparkles size={15} />
          </span>
          <div>
            <h2 className="research-section-heading">Research Chat</h2>
            <span className="research-chat-subtitle">{headerStatus}</span>
          </div>
        </div>
        <button
          type="button"
          className="research-icon-button"
          aria-label="Clear chat history"
          title="Clear chat history"
          disabled={messages.length === 0 || busy || Boolean(actionBusy)}
          onClick={() => void clearChat()}
        >
          <Trash2 size={14} />
        </button>
      </header>

      <div
        className="research-chat-messages"
        role="log"
        aria-label="Research Chat messages"
        aria-live="polite"
        aria-relevant="additions text"
        aria-atomic="false"
        aria-busy={busy}
        onScroll={(event) => {
          const element = event.currentTarget
          shouldAutoScrollRef.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 72
        }}
      >
        {messages.length === 0 ? (
          profile ? (
            <section className="research-chat-empty" aria-label="Start a Research Chat">
              <span className="research-chat-empty-icon" aria-hidden="true">
                <Sparkles size={22} />
              </span>
              <h3>Explore your research</h3>
              <p>Ask about the paper, current document, attached references, or indexed code.</p>
              <div className="research-chat-starters" aria-label="Suggested questions">
                {CHAT_STARTERS.map((starter) => (
                  <button
                    type="button"
                    key={starter.label}
                    onClick={() => fillComposer(starter.prompt)}
                  >
                    {starter.label}
                  </button>
                ))}
              </div>
            </section>
          ) : status ? (
            <section className="research-chat-empty" aria-label="Research Chat unavailable">
              <span className="research-chat-empty-icon" aria-hidden="true">
                <Sparkles size={21} />
              </span>
              <h3>Research Chat unavailable</h3>
              <p>{status}</p>
            </section>
          ) : (
            <section className="research-chat-empty" aria-label="Loading Research Chat">
              <LoaderCircle className="spin" size={21} aria-hidden="true" />
              <h3>Preparing research context</h3>
              <p>Loading the project profile and saved conversation.</p>
            </section>
          )
        ) : (
          messages.map((message, index) => (
            <div
              className={`research-chat-message ${message.role}`}
              key={`${message.role}-${index}`}
              role="group"
              aria-label={message.role === 'user' ? 'Your message' : 'Research Chat message'}
            >
              <div className="research-chat-message-content">
                {message.role === 'assistant' && (
                  <div className="research-chat-message-author">
                    <Sparkles size={13} aria-hidden="true" />
                    <strong>Research Chat</strong>
                    {message.execution && (
                      <span>{researchChatExecutionLabel(message.execution)}</span>
                    )}
                  </div>
                )}
                <p className="research-chat-message-text">{message.content}</p>
                {message.sources && message.sources.length > 0 && (
                  <div className="research-chat-sources" aria-label="Attached references">
                    <span>
                      <Paperclip size={11} aria-hidden="true" /> Attached references
                    </span>
                    {message.sources.map((source, sourceIndex) => {
                      const citeKey = `${index}:${source.id}:cite`
                      const saveKey = `${index}:${source.id}:save`
                      return (
                        <article
                          className="research-chat-source-card"
                          key={`${source.id}-${sourceIndex}`}
                        >
                          <div>
                            <b>{source.label}</b>
                            <small>{source.citekey ? `@${source.citekey}` : source.source}</small>
                          </div>
                          <div className="research-chat-source-actions">
                            {source.referenceSource === 'online' && source.onlineReference && (
                              <button
                                type="button"
                                disabled={Boolean(actionBusy)}
                                onClick={() =>
                                  void saveOnlineSource(source.onlineReference!, saveKey)
                                }
                              >
                                <Plus size={12} />
                                {actionBusy === saveKey ? 'Saving…' : 'Save to library'}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={!filePath || Boolean(actionBusy)}
                              onClick={() => void citeSource(source, citeKey)}
                            >
                              <Quote size={11} aria-hidden="true" />
                              {actionBusy === citeKey ? 'Citing…' : 'Cite'}
                            </button>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                )}
                {message.role === 'assistant' && (
                  <div className="research-chat-message-actions">
                    <button
                      className="research-chat-insert-answer"
                      type="button"
                      disabled={!filePath || Boolean(actionBusy)}
                      onClick={() =>
                        void prepareDocumentEdit(message.content, `document-edit:${index}`)
                      }
                    >
                      <FileText size={12} aria-hidden="true" />
                      {actionBusy === `document-edit:${index}`
                        ? 'Preparing edit…'
                        : 'Prepare document edit'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {busy && messages.length > 0 && (
          <div className="research-chat-thinking" aria-hidden="true">
            <Sparkles size={13} />
            <span>Working</span>
            <span className="research-chat-thinking-dots">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
        <div className="research-chat-message-end" ref={messageEndRef} aria-hidden="true" />
      </div>

      {pendingDocumentEdit && (
        <section className="research-document-edit" aria-label="Document change preview">
          <div className="research-document-edit-heading">
            <div>
              <strong>Document change preview</strong>
              <span>
                {pendingDocumentEdit.filePath.split(/[\\/]/u).at(-1)} · line{' '}
                {pendingDocumentEdit.startLine} · −{pendingDocumentEdit.removedLines} +
                {pendingDocumentEdit.addedLines}
              </span>
            </div>
            <ShieldCheck size={18} aria-hidden="true" />
          </div>
          <p>The source stays unchanged until you approve this edit.</p>
          <pre>
            {pendingDocumentEdit.excerpt}
            {pendingDocumentEdit.excerptTruncated ? '\n…' : ''}
          </pre>
          <div className="research-document-edit-actions">
            <button type="button" onClick={discardDocumentEdit}>
              <X size={13} /> Discard
            </button>
            <button
              className="primary"
              type="button"
              disabled={Boolean(actionBusy)}
              onClick={() => void applyDocumentEdit(false)}
            >
              <ShieldCheck size={13} /> Apply changes
            </button>
            {onCompile && (
              <button
                className="primary"
                type="button"
                disabled={Boolean(actionBusy)}
                onClick={() => void applyDocumentEdit(true)}
              >
                {actionBusy === 'document-compile' ? (
                  <LoaderCircle className="spin" size={13} />
                ) : (
                  <FileText size={13} />
                )}{' '}
                Apply &amp; compile
              </button>
            )}
          </div>
        </section>
      )}

      {pendingZoteroPlan && (
        <section
          className="research-zotero-plan"
          aria-labelledby={zoteroPlanHeadingId}
          aria-describedby={zoteroPlanDescriptionId}
        >
          <div className="research-zotero-plan-heading">
            <div>
              <strong id={zoteroPlanHeadingId}>Zotero change preview</strong>
              <span id={zoteroPlanDescriptionId}>No changes occur until you approve.</span>
            </div>
            <ShieldCheck size={18} aria-hidden="true" />
          </div>
          <p>{pendingZoteroPlan.summary}</p>
          <ol>
            {pendingZoteroPlan.operations.map((operation, index) => (
              <li key={`${operation.kind}-${operation.key}-${index}`}>
                {zoteroOperationLabel(operation)}
              </li>
            ))}
          </ol>
          <div className="research-zotero-plan-actions">
            <button type="button" disabled={Boolean(actionBusy)} onClick={cancelZoteroPlan}>
              <X size={13} /> Cancel
            </button>
            <button
              className="primary"
              type="button"
              disabled={Boolean(actionBusy)}
              onClick={() => void applyZoteroPlan()}
            >
              <ShieldCheck size={13} />
              {actionBusy === 'zotero-plan' ? 'Applying…' : 'Approve in Zotero'}
            </button>
          </div>
        </section>
      )}

      <div
        className={`research-chat-composer${dropActive ? ' drop-active' : ''}`}
        aria-label="Research Chat composer"
        onDragEnter={(event) => {
          if (event.dataTransfer.types.includes(TEXTEX_REFERENCE_MIME)) {
            event.preventDefault()
            setDropActive(true)
          }
        }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes(TEXTEX_REFERENCE_MIME)) {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'copy'
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setDropActive(false)
        }}
        onDrop={dropReference}
      >
        <div className="research-chat-context-bar">
          <span>
            <Paperclip size={12} aria-hidden="true" /> Context
          </span>
          <small>{selectedContextCount} selected · drop a reference here</small>
        </div>
        <div className="research-context-chips">
          {contextOptions.map((chip) => (
            <button
              type="button"
              className={selectedContexts.has(chip.id) ? 'active' : ''}
              aria-pressed={selectedContexts.has(chip.id)}
              onClick={() => toggleContext(chip.id)}
              key={chip.id}
              title={chip.persisted?.kind === 'reference' ? 'Toggle reference context' : undefined}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {queuedPrompts.length > 0 && (
          <div className="research-chat-queue" aria-label="Queued Chat messages">
            <div>
              <strong>
                {queuedPrompts.length} queued message{queuedPrompts.length === 1 ? '' : 's'}
              </strong>
              <span>{queuedPrompts[0]}</span>
            </div>
            <button
              type="button"
              aria-label="Clear queued messages"
              title="Clear queued messages"
              onClick={() => {
                queuedPromptsRef.current = []
                setQueuedPrompts([])
                setStatus('Queued messages cleared.')
              }}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="research-chat-composer-shell">
          <div className="research-chat-command-input-wrapper">
            {commandMenuOpen && (
              <ResearchChatCommandMenu
                commands={commandSuggestions}
                activeIndex={activeCommandIndex}
                listboxId={commandListboxId}
                onActiveIndexChange={setActiveCommandIndex}
                onSelect={selectCommandSuggestion}
              />
            )}
            <textarea
              ref={composerInputRef}
              rows={2}
              aria-label="Research question"
              aria-describedby={commandHintId}
              aria-autocomplete="list"
              aria-haspopup="listbox"
              aria-expanded={commandMenuOpen}
              aria-controls={commandMenuOpen ? commandListboxId : undefined}
              aria-activedescendant={activeCommandId}
              value={prompt}
              placeholder="Ask about this paper or its source code…"
              onChange={(event) => {
                setPrompt(event.target.value)
                historyIndexRef.current = null
                historyDraftRef.current = event.target.value
                setCommandMenuDismissed(false)
                setActiveCommandIndex(0)
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return
                if (commandMenuOpen) {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    setActiveCommandIndex((index) => (index + 1) % commandSuggestions.length)
                    return
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    setActiveCommandIndex(
                      (index) => (index - 1 + commandSuggestions.length) % commandSuggestions.length
                    )
                    return
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    event.stopPropagation()
                    setCommandMenuDismissed(true)
                    return
                  }
                  if (event.key === 'Tab') {
                    setCommandMenuDismissed(true)
                    return
                  }
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    if (exactPromptCommand) {
                      setCommandMenuDismissed(true)
                      void send()
                      return
                    }
                    const selectedCommand = commandSuggestions[activeCommandIndex]
                    if (selectedCommand) selectCommandSuggestion(selectedCommand)
                    return
                  }
                }
                if (
                  event.key === 'ArrowUp' &&
                  !event.altKey &&
                  !event.ctrlKey &&
                  !event.metaKey &&
                  (historyIndexRef.current !== null || event.currentTarget.selectionStart === 0)
                ) {
                  if (navigatePromptHistory('previous')) event.preventDefault()
                  return
                }
                if (
                  event.key === 'ArrowDown' &&
                  !event.altKey &&
                  !event.ctrlKey &&
                  !event.metaKey &&
                  historyIndexRef.current !== null
                ) {
                  if (navigatePromptHistory('next')) event.preventDefault()
                  return
                }
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void send()
                }
              }}
            />
            <span className="research-chat-command-status" id={commandHintId}>
              {commandMenuOpen
                ? `${commandSuggestions.length} commands available. Use arrow keys to choose.`
                : 'Enter sends · Shift+Enter adds a line · Up/Down recalls prompts.'}
            </span>
          </div>

          <div className="research-chat-execution-bar">
            <ResearchChatModelSelector
              defaultProvider={defaultAiProvider}
              defaultModel={defaultAiModel}
              execution={executionOverride}
              disabled={busy || Boolean(pendingZoteroPlan)}
              onChange={setExecutionOverride}
            />
            <span className="research-chat-mode" title="Answers without changing files">
              Ask
            </span>
            {busy && (
              <button
                className="research-chat-stop"
                type="button"
                aria-label="Stop current Chat request"
                title="Stop current Chat request"
                onClick={() => void stopRequest()}
              >
                <Square size={12} aria-hidden="true" />
              </button>
            )}
            <button
              className="research-chat-send"
              type="button"
              aria-label="Send"
              title={busy || pendingZoteroPlan ? 'Queue message · Enter' : 'Send · Enter'}
              disabled={!prompt.trim() || !profile || (commandMenuOpen && !exactPromptCommand)}
              onClick={() => void send()}
            >
              <Send size={14} aria-hidden="true" />
            </button>
          </div>

          <div className="research-chat-composer-footer">
            <div className="research-chat-footer-actions">
              <button
                className="research-chat-footer-button"
                type="button"
                disabled={busy || Boolean(pendingZoteroPlan)}
                onClick={openCommandMenu}
              >
                <Slash size={13} aria-hidden="true" /> Commands
              </button>
              <details className="research-chat-tools">
                <summary>
                  <Wrench size={13} aria-hidden="true" /> Tools
                </summary>
                <div className="research-chat-tools-popover">
                  <strong>Draft and CLI tools</strong>
                  <button className="research-primary-action" type="button" onClick={onAiDraft}>
                    <FileText size={16} /> AI Draft
                  </button>
                  <div className="research-action-grid">
                    <button
                      type="button"
                      disabled={!workDir || busy}
                      onClick={() => launch('claude', false)}
                    >
                      <Terminal size={15} /> Claude Code
                    </button>
                    <button
                      type="button"
                      disabled={!workDir || busy}
                      onClick={() => launch('claude', true)}
                    >
                      <RotateCcw size={15} /> Resume Claude
                    </button>
                    <button
                      type="button"
                      disabled={!workDir || busy}
                      onClick={() => launch('codex', false)}
                    >
                      <Terminal size={15} /> Codex CLI
                    </button>
                    <button
                      type="button"
                      disabled={!workDir || busy}
                      onClick={() => launch('codex', true)}
                    >
                      <RotateCcw size={15} /> Resume Codex
                    </button>
                  </div>
                </div>
              </details>
            </div>

            <span className="research-chat-shortcut" aria-hidden="true">
              Enter
            </span>
          </div>
        </div>

        {status && (
          <div className="research-status research-chat-status" role="status">
            {(busy || Boolean(actionBusy)) && (
              <LoaderCircle className="spin" size={12} aria-hidden="true" />
            )}
            <span>{status}</span>
          </div>
        )}
      </div>
    </div>
  )
}
