import { describe, expect, it } from 'vitest'
import {
  RESEARCH_CHAT_COMMANDS,
  matchResearchChatCommands,
  parseResearchChatCommand
} from '../../renderer/services/researchChatCommands'

describe('Research Chat commands', () => {
  it('publishes the complete command registry with searchable metadata', () => {
    expect(RESEARCH_CHAT_COMMANDS.map(({ id, command }) => ({ id, command }))).toEqual([
      { id: 'help', command: '/help' },
      { id: 'references', command: '/refs' },
      { id: 'zotero', command: '/zotero' },
      { id: 'online', command: '/online' },
      { id: 'todo', command: '/todo' },
      { id: 'outline', command: '/outline' },
      { id: 'draft', command: '/draft' },
      { id: 'zotero-plan', command: '/zotero-plan' }
    ])
    for (const command of RESEARCH_CHAT_COMMANDS) {
      expect(command.label).not.toBe('')
      expect(command.description).not.toBe('')
      expect(command.usage.startsWith(command.command)).toBe(true)
      expect(command.keywords.length).toBeGreaterThan(0)
      expect(typeof command.acceptsArguments).toBe('boolean')
    }
  })

  it('opens the menu for one slash token and filters normalized searchable fields', () => {
    expect(matchResearchChatCommands('/')).toEqual(RESEARCH_CHAT_COMMANDS)
    expect(matchResearchChatCommands('/ZO').map((command) => command.id)).toEqual([
      'zotero',
      'zotero-plan'
    ])
    expect(matchResearchChatCommands('/bibliography').map((command) => command.id)).toEqual([
      'references'
    ])
    expect(matchResearchChatCommands('/sections').map((command) => command.id)).toEqual(['outline'])
  })

  it('closes the menu once whitespace, a newline, or non-token input appears', () => {
    expect(matchResearchChatCommands('/zo ')).toEqual([])
    expect(matchResearchChatCommands('/zo\n')).toEqual([])
    expect(matchResearchChatCommands(' /zo')).toEqual([])
    expect(matchResearchChatCommands('zotero')).toEqual([])
    expect(matchResearchChatCommands('/zo/query')).toEqual([])
  })

  it('parses exact command boundaries case-insensitively', () => {
    expect(parseResearchChatCommand('/REFS')).toEqual({
      command: RESEARCH_CHAT_COMMANDS[1],
      argument: ''
    })
    expect(parseResearchChatCommand('/refs-more')).toBeNull()
    expect(parseResearchChatCommand('/refs/query')).toBeNull()
    expect(parseResearchChatCommand('/refs:query')).toBeNull()
    expect(parseResearchChatCommand('/references')).toBeNull()
  })

  it('resolves citation aliases to the references command', () => {
    expect(parseResearchChatCommand('/cite Knuth1984')).toEqual({
      command: RESEARCH_CHAT_COMMANDS[1],
      argument: 'Knuth1984'
    })
    expect(parseResearchChatCommand('/BIB numerical methods')?.command.id).toBe('references')
  })

  it('trims command arguments without changing their internal text', () => {
    expect(
      parseResearchChatCommand('/zotero-plan  add tag theory\n  to selected papers  ')
    ).toEqual({
      command: RESEARCH_CHAT_COMMANDS[7],
      argument: 'add tag theory\n  to selected papers'
    })
    expect(parseResearchChatCommand('/zotero   diffusion policy   ')?.argument).toBe(
      'diffusion policy'
    )
  })

  it('rejects unknown commands and input without a leading command token', () => {
    expect(parseResearchChatCommand('/unknown query')).toBeNull()
    expect(parseResearchChatCommand('/')).toBeNull()
    expect(parseResearchChatCommand('ask /refs later')).toBeNull()
    expect(parseResearchChatCommand(' /refs')).toBeNull()
    expect(parseResearchChatCommand('')).toBeNull()
  })
})
