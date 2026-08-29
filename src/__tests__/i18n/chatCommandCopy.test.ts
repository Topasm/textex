import { describe, expect, it } from 'vitest'
import { RESEARCH_CHAT_COMMANDS } from '../../renderer/services/researchChatCommands'
import en from '../../renderer/i18n/locales/en.json'

/**
 * `/`-matching searches the manifest's English label, description, and usage,
 * while the menu shows the translated copy. If the two English texts drift, a
 * user searching for the words they can see stops finding the command.
 */
describe('Research Chat command copy', () => {
  const copy = (en.researchPanel as Record<string, unknown>).chatCommands as Record<
    string,
    { label: string; description: string; usage: string }
  >

  it('has translated copy for every command', () => {
    const missing = RESEARCH_CHAT_COMMANDS.filter((command) => !copy[command.id]).map(
      (command) => command.id
    )
    expect(missing).toEqual([])
  })

  it('keeps the English copy identical to the searchable manifest', () => {
    const drift = RESEARCH_CHAT_COMMANDS.flatMap((command) => {
      const entry = copy[command.id]
      if (!entry) return []
      return (['label', 'description', 'usage'] as const)
        .filter((field) => entry[field] !== command[field])
        .map((field) => `${command.id}.${field}: "${entry[field]}" vs "${command[field]}"`)
    })
    expect(drift).toEqual([])
  })
})
