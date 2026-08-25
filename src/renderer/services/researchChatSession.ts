import type {
  OnlineReference,
  ResearchChatExecution,
  ResearchChatMessage,
  ResearchChatSession,
  ResearchChatSessionContext,
  ResearchChatSessionScope,
  ResearchChatSessionSnapshot
} from '../../shared/types'

const SESSION_MESSAGE_LIMIT = 40
const CHAT_MESSAGE_MAX_BYTES = 64 * 1024
const CHAT_HISTORY_MAX_BYTES = 512 * 1024
const CHAT_SESSION_FILE_BUDGET_BYTES = 1000 * 1024
const PERSISTED_LABEL_MAX_BYTES = 2 * 1024
const PERSISTED_SOURCE_MAX_BYTES = 4 * 1024

const utf8Encoder = new TextEncoder()
const utf8Decoder = new TextDecoder()

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

export function compactResearchChatMessageContent(content: string): string {
  return truncateUtf8(content.replaceAll('\0', ''), CHAT_MESSAGE_MAX_BYTES)
}

export function compactResearchChatOnlineReference(reference: OnlineReference): OnlineReference {
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
      ? { onlineReference: compactResearchChatOnlineReference(context.onlineReference) }
      : {})
  }
}

export function compactResearchChatSessionMessages(
  messages: ResearchChatMessage[]
): ResearchChatMessage[] {
  const compacted = messages.slice(-SESSION_MESSAGE_LIMIT).map((message) => ({
    role: message.role,
    content: compactResearchChatMessageContent(message.content),
    ...(message.execution ? { execution: message.execution } : {}),
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

export function compactResearchChatSession(
  messages: ResearchChatMessage[],
  selectedContexts: ResearchChatSessionContext[],
  execution?: ResearchChatExecution | null
): ResearchChatSession {
  const session: ResearchChatSession = {
    version: 1,
    messages: compactResearchChatSessionMessages(messages),
    selectedContexts: selectedContexts.map(compactSessionContext),
    ...(execution ? { execution } : {})
  }
  const serializedBytes = () => utf8ByteLength(JSON.stringify(session, null, 2))
  while (serializedBytes() > CHAT_SESSION_FILE_BUDGET_BYTES) {
    const sourceIndex = session.messages.findIndex((message) => message.sources?.length)
    if (sourceIndex >= 0) {
      const message = session.messages[sourceIndex]
      session.messages[sourceIndex] = {
        role: message.role,
        content: message.content,
        ...(message.execution ? { execution: message.execution } : {})
      }
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

export function appendResearchChatSessionMessages(
  current: ResearchChatMessage[],
  ...incoming: ResearchChatMessage[]
): ResearchChatMessage[] {
  return compactResearchChatSessionMessages([...current, ...incoming])
}

export function researchChatSessionScope(
  snapshot: ResearchChatSessionSnapshot
): ResearchChatSessionScope {
  return {
    projectRoot: snapshot.projectRoot,
    projectEpoch: snapshot.projectEpoch,
    revision: snapshot.revision
  }
}
