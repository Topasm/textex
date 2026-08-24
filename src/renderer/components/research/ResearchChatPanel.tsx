import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { FileText, Plus, RotateCcw, Send, ShieldCheck, Terminal, Trash2, X } from 'lucide-react'
import type {
  OnlineReference,
  ResearchChatContext,
  ResearchChatMessage,
  ResearchChatSession,
  ResearchChatSessionContext,
  ResearchChatSessionScope,
  ResearchChatSessionSnapshot,
  ResearchProfile,
  ResearchResource,
  ZoteroMutationOperation,
  ZoteroMutationPlan
} from '../../../shared/types'
import { documentRegistry } from '../../models/documentRegistry'
import {
  buildReferenceChatContext,
  mergeReferenceChatContexts,
  type ReferenceChatContextItem
} from '../../services/referenceChatContext'
import {
  matchResearchChatCommands,
  parseResearchChatCommand,
  type ResearchChatCommandDefinition
} from '../../services/researchChatCommands'
import { useEditorStore } from '../../store/useEditorStore'
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

interface ResearchChatPanelProps {
  onAiDraft: () => void
  incomingSelection?: ResearchSelectionRequest | null
  onIncomingSelectionConsumed?: (token: number) => void
  incomingReference?: {
    token: number
    projectRoot: string
    payload: ReferenceDragPayload
  } | null
  onIncomingReferenceConsumed?: (token: number) => void
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

type SessionReferenceContextItem = ReferenceChatContextItem & {
  /** Preserve a restored project/Zotero card summary across subsequent saves. */
  persistedSource?: string
}

const DOCUMENT_CONTEXT_LIMIT = 24_000
const HISTORY_LIMIT = 12
const SESSION_MESSAGE_LIMIT = 40
const CHAT_MESSAGE_MAX_BYTES = 64 * 1024
const CHAT_HISTORY_MAX_BYTES = 512 * 1024
const CHAT_SESSION_FILE_BUDGET_BYTES = 1000 * 1024
const PERSISTED_LABEL_MAX_BYTES = 2 * 1024
const PERSISTED_SOURCE_MAX_BYTES = 4 * 1024
const REFERENCE_SEARCH_QUERY_LIMIT = 512

const utf8Encoder = new TextEncoder()
const utf8Decoder = new TextDecoder()

export function isLikelyZoteroMutation(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (normalized.startsWith('/zotero ')) return true
  const namesZoteroObject = /(zotero|collection|컬렉션|tag|태그)/iu.test(normalized)
  const requestsMutation =
    /(create|make|move|rename|add|remove|change|organize|생성|만들|옮|이동|이름|추가|제거|삭제|변경|정리)/iu.test(
      normalized
    )
  return namesZoteroObject && requestsMutation
}

function zoteroOperationLabel(operation: ZoteroMutationOperation): string {
  switch (operation.kind) {
    case 'createCollection':
      return `Create “${operation.name}” in ${operation.parentLabel}`
    case 'moveCollection':
      return `Move “${operation.path}” to ${operation.parentLabel}`
    case 'renameCollection':
      return `Rename “${operation.path}” to “${operation.newName}”`
    case 'updateItem': {
      const changes = [
        operation.addTags.length > 0 && `add ${operation.addTags.join(', ')}`,
        operation.removeTags.length > 0 && `remove ${operation.removeTags.join(', ')}`,
        operation.addCollections.length > 0 &&
          `add to ${operation.addCollections.map((collection) => collection.path).join(', ')}`,
        operation.removeCollections.length > 0 &&
          `remove from ${operation.removeCollections.map((collection) => collection.path).join(', ')}`
      ]
        .filter(Boolean)
        .join('; ')
      return `${operation.title}: ${changes}`
    }
  }
}

function utf8ByteLength(value: string): number {
  return utf8Encoder.encode(value).byteLength
}

function truncateUtf8(value: string, maxBytes: number): string {
  const bytes = utf8Encoder.encode(value)
  if (bytes.byteLength <= maxBytes) return value
  let end = maxBytes
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end -= 1
  return utf8Decoder.decode(bytes.subarray(0, end))
}

function compactMessageContent(content: string): string {
  const safe = content.replaceAll('\0', '')
  return truncateUtf8(safe, CHAT_MESSAGE_MAX_BYTES)
}

function compactOnlineReference(reference: OnlineReference): OnlineReference {
  return {
    source: reference.source,
    id: truncateUtf8(reference.id, 2 * 1024),
    title: truncateUtf8(reference.title, 2 * 1024),
    authors: reference.authors.slice(0, 16).map((author) => truncateUtf8(author, 256)),
    year: truncateUtf8(reference.year, 32),
    type: truncateUtf8(reference.type, 128),
    ...(reference.doi ? { doi: truncateUtf8(reference.doi, 2 * 1024) } : {}),
    ...(reference.arxivId ? { arxivId: truncateUtf8(reference.arxivId, 2 * 1024) } : {}),
    ...(reference.url ? { url: reference.url } : {})
  }
}

function compactSessionContext(context: ResearchChatSessionContext): ResearchChatSessionContext {
  return {
    ...context,
    label: truncateUtf8(context.label, PERSISTED_LABEL_MAX_BYTES),
    ...(context.source ? { source: truncateUtf8(context.source, PERSISTED_SOURCE_MAX_BYTES) } : {}),
    ...(context.onlineReference
      ? { onlineReference: compactOnlineReference(context.onlineReference) }
      : {})
  }
}

function compactSessionMessages(messages: ResearchChatMessage[]): ResearchChatMessage[] {
  const compacted = messages.slice(-SESSION_MESSAGE_LIMIT).map((message) => ({
    role: message.role,
    content: compactMessageContent(message.content),
    ...(message.sources?.length
      ? { sources: message.sources.slice(0, 12).map(compactSessionContext) }
      : {})
  }))
  const newest: ResearchChatMessage[] = []
  let historyBytes = 0
  for (let index = compacted.length - 1; index >= 0; index -= 1) {
    const messageBytes = utf8ByteLength(compacted[index].content)
    if (historyBytes + messageBytes > CHAT_HISTORY_MAX_BYTES) break
    newest.push(compacted[index])
    historyBytes += messageBytes
  }
  return newest.reverse()
}

function compactSessionPayload(
  messages: ResearchChatMessage[],
  selectedContexts: ResearchChatSessionContext[]
) {
  const session = {
    version: 1 as const,
    messages: compactSessionMessages(messages),
    selectedContexts: selectedContexts.map(compactSessionContext)
  }
  const serializedBytes = () => utf8ByteLength(JSON.stringify(session, null, 2))
  while (serializedBytes() > CHAT_SESSION_FILE_BUDGET_BYTES) {
    const sourceIndex = session.messages.findIndex((message) => message.sources?.length)
    if (sourceIndex >= 0) {
      const message = session.messages[sourceIndex]
      session.messages[sourceIndex] = { role: message.role, content: message.content }
      continue
    }
    if (session.messages.length > 0) {
      session.messages.shift()
      continue
    }
    if (session.selectedContexts.length > 0) {
      session.selectedContexts.pop()
      continue
    }
    break
  }
  return session
}

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

function persistedReference(item: SessionReferenceContextItem): ResearchChatSessionContext {
  const descriptor = item.descriptor
  if (descriptor.source === 'online') {
    return {
      id: item.id,
      kind: 'reference',
      label: item.label,
      source: item.display.url,
      referenceSource: 'online',
      onlineReference: compactOnlineReference(descriptor.reference)
    }
  }
  const summary =
    item.persistedSource ??
    [item.display.authors?.join(', '), item.display.year].filter(Boolean).join(' · ')
  return {
    id: item.id,
    kind: 'reference',
    label: item.label,
    ...(summary ? { source: summary } : {}),
    citekey: descriptor.citekey,
    referenceSource: descriptor.source
  }
}

function restoredReference(
  context: ResearchChatSessionContext
): SessionReferenceContextItem | null {
  if (context.kind !== 'reference' || !context.referenceSource) return null
  if (context.referenceSource === 'online') {
    if (!context.onlineReference) return null
    const restored = buildReferenceChatContext({
      source: 'online',
      reference: context.onlineReference
    })
    return { ...restored, id: context.id, label: context.label }
  }
  if (!context.citekey) return null
  return {
    id: context.id,
    label: context.label,
    descriptor: { source: context.referenceSource, citekey: context.citekey },
    display: {},
    ...(context.source ? { persistedSource: context.source } : {})
  }
}

function referenceRequestContext(item: ReferenceChatContextItem): ResearchChatContext {
  if (item.descriptor.source === 'online') {
    return {
      kind: 'reference',
      label: item.label,
      reference: { source: 'online', onlineReference: item.descriptor.reference }
    }
  }
  return {
    kind: 'reference',
    label: item.label,
    reference: { source: item.descriptor.source, citekey: item.descriptor.citekey }
  }
}

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

function appendSessionMessages(
  current: ResearchChatMessage[],
  ...incoming: ResearchChatMessage[]
): ResearchChatMessage[] {
  return compactSessionMessages([...current, ...incoming])
}

function snapshotScope(snapshot: ResearchChatSessionSnapshot): ResearchChatSessionScope {
  return {
    projectRoot: snapshot.projectRoot,
    projectEpoch: snapshot.projectEpoch,
    revision: snapshot.revision
  }
}

export function ResearchChatPanel({
  onAiDraft,
  incomingSelection = null,
  onIncomingSelectionConsumed,
  incomingReference = null,
  onIncomingReferenceConsumed
}: ResearchChatPanelProps) {
  const projectRoot = useProjectStore((state) => state.projectRoot)
  const filePath = useEditorStore((state) => state.filePath)
  const workDir = projectRoot || (filePath ? dirname(filePath) : '')
  const [profile, setProfile] = useState<ResearchProfile | null>(null)
  const [selectedContexts, setSelectedContexts] = useState<Set<string>>(new Set())
  const [referenceContexts, setReferenceContexts] = useState<SessionReferenceContextItem[]>([])
  const [selectionContext, setSelectionContext] = useState<SelectionChatContext | null>(null)
  const [messages, setMessages] = useState<ResearchChatMessage[]>([])
  const [prompt, setPrompt] = useState('')
  const [commandMenuDismissed, setCommandMenuDismissed] = useState(false)
  const [activeCommandIndex, setActiveCommandIndex] = useState(0)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionBusy, setActionBusy] = useState('')
  const [pendingZoteroPlan, setPendingZoteroPlan] = useState<ZoteroMutationPlan | null>(null)
  const [dropActive, setDropActive] = useState(false)
  const [sessionReadyRoot, setSessionReadyRoot] = useState<string | null>(null)
  const loadGeneration = useRef(0)
  const requestGeneration = useRef(0)
  const requestInFlight = useRef(false)
  const actionInFlight = useRef(false)
  const referenceContextsRef = useRef<SessionReferenceContextItem[]>([])
  const sessionScopeRef = useRef<ResearchChatSessionScope | null>(null)
  const sessionMutationQueue = useRef<Promise<void>>(Promise.resolve())
  const composerInputRef = useRef<HTMLTextAreaElement>(null)
  const messageEndRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)
  const previousFilePath = useRef(filePath)
  const consumedIncomingToken = useRef<number | null>(null)
  const consumedSelectionToken = useRef<number | null>(null)
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

  const fillComposer = useCallback((value: string) => {
    setPrompt(value)
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
    if (
      (messages.length === 0 && !busy && !pendingZoteroPlan) ||
      !shouldAutoScrollRef.current
    )
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
        sessionScopeRef.current = snapshotScope(snapshot)
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
    const generation = ++loadGeneration.current
    const root = projectRoot
    requestGeneration.current += 1
    requestInFlight.current = false
    actionInFlight.current = false
    referenceContextsRef.current = []
    sessionScopeRef.current = null
    setProfile(null)
    setSelectedContexts(new Set())
    setReferenceContexts([])
    setSelectionContext(null)
    setMessages([])
    setPrompt('')
    setCommandMenuDismissed(false)
    setActiveCommandIndex(0)
    setStatus('')
    setBusy(false)
    setActionBusy('')
    setPendingZoteroPlan(null)
    setDropActive(false)
    setSessionReadyRoot(null)
    consumedIncomingToken.current = null
    consumedSelectionToken.current = null
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
        sessionScopeRef.current = snapshotScope(snapshot)
        const hasSavedState = session.messages.length > 0 || session.selectedContexts.length > 0
        setMessages(session.messages.slice(-SESSION_MESSAGE_LIMIT))
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
    const session: ResearchChatSession = compactSessionPayload(messages, selectedSessionContexts)
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

  const send = useCallback(async () => {
    const question = compactMessageContent(prompt.trim())
    if (!question || !projectRoot || requestInFlight.current || pendingZoteroPlan) return
    const parsedCommand = parseResearchChatCommand(question)
    if (parsedCommand && runLocalSlashCommand(parsedCommand.command, parsedCommand.argument)) return
    if (!profile) return
    const zoteroPlanRequest =
      parsedCommand?.command.id === 'zotero-plan' ? parsedCommand.argument : null
    if (parsedCommand?.command.id === 'zotero-plan' && !zoteroPlanRequest) {
      setPrompt('/zotero-plan ')
      setStatus('Describe the Zotero changes to preview before sending.')
      return
    }
    const root = projectRoot
    const generation = ++requestGeneration.current
    requestInFlight.current = true
    setBusy(true)
    setStatus('Gathering selected research context…')
    try {
      const contexts = await buildContexts(generation, root)
      if (!contexts || !isCurrentRequest(generation, root)) return
      const history = compactSessionMessages(messages.slice(-HISTORY_LIMIT)).map(
        ({ role, content }) => ({ role, content })
      )
      const answerSources = selectedSessionContexts.filter(
        (context) => context.kind === 'reference'
      )
      setMessages((current) => appendSessionMessages(current, { role: 'user', content: question }))
      setPrompt('')
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
        message: question,
        history,
        contexts,
        instructions: profile.instructions
      })
      if (!isCurrentRequest(generation, root)) return
      const compactAnswer = compactMessageContent(answer)
      setMessages((current) =>
        appendSessionMessages(current, {
          role: 'assistant',
          content: compactAnswer.trim() ? compactAnswer : 'The provider returned an empty answer.',
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
        requestInFlight.current = false
        setBusy(false)
      }
    }
  }, [
    buildContexts,
    isCurrentRequest,
    messages,
    profile,
    projectRoot,
    prompt,
    selectedSessionContexts,
    pendingZoteroPlan,
    runLocalSlashCommand
  ])

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
      setPendingZoteroPlan(null)
      setMessages((current) =>
        appendSessionMessages(current, {
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
      appendSessionMessages(current, {
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

  const insertAnswer = useCallback((content: string) => {
    const editor = useEditorStore.getState()
    if (!editor.activeFilePath) return
    editor.requestInsertAtCursor(content)
    setStatus('Inserted the answer at the editor cursor.')
  }, [])

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
      setMessages([])
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

  return (
    <div className="research-chat-panel">
      <div className="research-chat-heading">
        <h2 className="research-section-heading">Research Chat</h2>
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
      </div>
      <div className="research-chat-messages" aria-live="polite" aria-busy={busy}>
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
              {message.sources && message.sources.length > 0 && (
                <div className="research-chat-sources" aria-label="Attached references">
                  <span>Attached references</span>
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
                            {actionBusy === citeKey ? 'Citing…' : 'Cite'}
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
              {message.role === 'assistant' && (
                <button
                  className="research-chat-insert-answer"
                  type="button"
                  disabled={!filePath}
                  onClick={() => insertAnswer(message.content)}
                >
                  Insert answer
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {pendingZoteroPlan && (
        <section className="research-zotero-plan" aria-label="Zotero change preview">
          <div className="research-zotero-plan-heading">
            <div>
              <strong>Zotero change preview</strong>
              <span>No changes occur until you approve.</span>
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
        <div className="research-subheading">Context · drop a reference here</div>
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
            aria-label="Research question"
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-expanded={commandMenuOpen}
            aria-controls={commandMenuOpen ? commandListboxId : undefined}
            aria-activedescendant={activeCommandId}
            value={prompt}
            placeholder="Ask about this paper or its source code… Type / for commands."
            onChange={(event) => {
              setPrompt(event.target.value)
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
                if (event.key === 'Enter') {
                  event.preventDefault()
                  if ((event.metaKey || event.ctrlKey) && exactPromptCommand) {
                    setCommandMenuDismissed(true)
                    void send()
                    return
                  }
                  const selectedCommand = commandSuggestions[activeCommandIndex]
                  if (selectedCommand) selectCommandSuggestion(selectedCommand)
                  return
                }
              }
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                void send()
              }
            }}
          />
          <span className="research-chat-command-status" aria-live="polite">
            {commandMenuOpen ? `${commandSuggestions.length} Chat commands available.` : ''}
          </span>
        </div>
        <button
          className="research-chat-send"
          type="button"
          disabled={
            !prompt.trim() ||
            !profile ||
            busy ||
            Boolean(pendingZoteroPlan) ||
            (commandMenuOpen && !exactPromptCommand)
          }
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
        <button className="research-primary-action" type="button" onClick={onAiDraft}>
          <FileText size={16} /> AI Draft
        </button>
        <div className="research-action-grid">
          <button type="button" disabled={!workDir || busy} onClick={() => launch('claude', false)}>
            <Terminal size={15} /> Claude Code
          </button>
          <button type="button" disabled={!workDir || busy} onClick={() => launch('claude', true)}>
            <RotateCcw size={15} /> Resume Claude
          </button>
          <button type="button" disabled={!workDir || busy} onClick={() => launch('codex', false)}>
            <Terminal size={15} /> Codex CLI
          </button>
          <button type="button" disabled={!workDir || busy} onClick={() => launch('codex', true)}>
            <RotateCcw size={15} /> Resume Codex
          </button>
        </div>
      </details>
    </div>
  )
}
