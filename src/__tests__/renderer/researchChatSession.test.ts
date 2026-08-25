import { describe, expect, it } from 'vitest'
import {
  appendResearchChatSessionMessages,
  compactResearchChatMessageContent,
  compactResearchChatOnlineReference,
  compactResearchChatSession
} from '../../renderer/services/researchChatSession'

describe('Research Chat session compaction', () => {
  it('removes null bytes and truncates multibyte message content on UTF-8 boundaries', () => {
    const compacted = compactResearchChatMessageContent(`before\0${'😀'.repeat(20_000)}`)

    expect(compacted).not.toContain('\0')
    expect(new TextEncoder().encode(compacted).byteLength).toBeLessThanOrEqual(64 * 1024)
    expect(() =>
      new TextDecoder('utf-8', { fatal: true }).decode(new TextEncoder().encode(compacted))
    ).not.toThrow()
  })

  it('keeps the newest bounded messages and strips large online-only fields from persistence', () => {
    const onlineReference = compactResearchChatOnlineReference({
      source: 'crossref',
      id: 'paper',
      title: 'Paper',
      authors: ['Ada'],
      year: '2026',
      type: 'article',
      abstract: 'large abstract'
    })
    const messages = appendResearchChatSessionMessages(
      Array.from({ length: 45 }, (_, index) => ({
        role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
        content: `message ${index}`
      })),
      { role: 'assistant', content: 'newest' }
    )
    const session = compactResearchChatSession(
      [
        ...messages,
        {
          role: 'assistant' as const,
          content: 'model-tagged answer',
          execution: { provider: 'codex-cli' as const, model: 'gpt-5.6-sol' }
        }
      ],
      [
        {
          id: 'reference:online:paper',
          kind: 'reference',
          label: 'Paper',
          referenceSource: 'online',
          onlineReference
        }
      ],
      { provider: 'codex-cli', model: 'gpt-5.6-sol' }
    )

    expect(messages).toHaveLength(40)
    expect(messages.at(-1)?.content).toBe('newest')
    expect(session.execution).toEqual({ provider: 'codex-cli', model: 'gpt-5.6-sol' })
    expect(session.messages.at(-1)?.execution).toEqual({
      provider: 'codex-cli',
      model: 'gpt-5.6-sol'
    })
    expect(session.selectedContexts[0].onlineReference).not.toHaveProperty('abstract')
    expect(new TextEncoder().encode(JSON.stringify(session, null, 2)).byteLength).toBeLessThan(
      1024 * 1024
    )
  })
})
