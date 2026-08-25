export type ResearchChatCommandId =
  | 'help'
  | 'references'
  | 'zotero'
  | 'online'
  | 'find-sources'
  | 'submission-check'
  | 'todo'
  | 'outline'
  | 'draft'
  | 'zotero-plan'

export interface ResearchChatCommandDefinition {
  readonly id: ResearchChatCommandId
  readonly command: `/${string}`
  readonly label: string
  readonly description: string
  readonly usage: string
  readonly keywords: readonly string[]
  readonly acceptsArguments: boolean
}

export interface ParsedResearchChatCommand {
  readonly command: ResearchChatCommandDefinition
  readonly argument: string
}

export const RESEARCH_CHAT_COMMANDS = [
  {
    id: 'help',
    command: '/help',
    label: 'Command help',
    description: 'Show the available Research Chat commands.',
    usage: '/help',
    keywords: ['commands', 'shortcuts', 'usage'],
    acceptsArguments: false
  },
  {
    id: 'references',
    command: '/refs',
    label: 'Project references',
    description: 'Search the project bibliography and attach a reference.',
    usage: '/refs <query or citekey>',
    keywords: ['references', 'citation', 'cite', 'bibliography', 'bib'],
    acceptsArguments: true
  },
  {
    id: 'zotero',
    command: '/zotero',
    label: 'Zotero references',
    description: 'Search the connected Zotero library and attach a reference.',
    usage: '/zotero <query>',
    keywords: ['references', 'citation', 'library', 'search'],
    acceptsArguments: true
  },
  {
    id: 'online',
    command: '/online',
    label: 'Online references',
    description: 'Search online scholarly sources and attach a reference.',
    usage: '/online <query>',
    keywords: ['crossref', 'arxiv', 'sources', 'papers', 'search'],
    acceptsArguments: true
  },
  {
    id: 'find-sources',
    command: '/find-sources',
    label: 'Find supporting sources',
    description: 'Search project and connected library sources together.',
    usage: '/find-sources <claim or topic>',
    keywords: ['evidence', 'papers', 'references', 'citation', 'local', 'search'],
    acceptsArguments: true
  },
  {
    id: 'submission-check',
    command: '/submission-check',
    label: 'Submission Check',
    description: 'Check the current paper for submission issues.',
    usage: '/submission-check',
    keywords: ['validate', 'paper', 'preflight', 'warnings', 'references'],
    acceptsArguments: false
  },
  {
    id: 'todo',
    command: '/todo',
    label: 'Project TODO',
    description: 'Open the project TODO panel.',
    usage: '/todo',
    keywords: ['tasks', 'notes', 'panel'],
    acceptsArguments: false
  },
  {
    id: 'outline',
    command: '/outline',
    label: 'Document outline',
    description: 'Open the current document outline.',
    usage: '/outline',
    keywords: ['sections', 'structure', 'headings', 'panel'],
    acceptsArguments: false
  },
  {
    id: 'draft',
    command: '/draft',
    label: 'AI Draft',
    description: 'Open the AI Draft workflow for the current document.',
    usage: '/draft',
    keywords: ['write', 'generate', 'document'],
    acceptsArguments: false
  },
  {
    id: 'zotero-plan',
    command: '/zotero-plan',
    label: 'Plan Zotero changes',
    description: 'Prepare a reviewable Zotero mutation plan without applying it.',
    usage: '/zotero-plan <requested changes>',
    keywords: ['collections', 'tags', 'organize', 'preview', 'mutation'],
    acceptsArguments: true
  }
] as const satisfies readonly ResearchChatCommandDefinition[]

const commandByToken = new Map<string, ResearchChatCommandDefinition>(
  RESEARCH_CHAT_COMMANDS.map((definition) => [definition.command, definition])
)
const referenceCommand = RESEARCH_CHAT_COMMANDS.find(
  (definition) => definition.id === 'references'
)!
commandByToken.set('/cite', referenceCommand)
commandByToken.set('/bib', referenceCommand)

const COMPLETE_COMMAND = /^\/[a-z][a-z0-9-]*(?:\s+([\s\S]*))?$/iu
const MENU_TOKEN = /^\/[a-z0-9-]*$/iu

/** Parses only an exact, complete command token at the start of the input. */
export function parseResearchChatCommand(input: string): ParsedResearchChatCommand | null {
  const match = COMPLETE_COMMAND.exec(input)
  if (!match) return null

  const tokenEnd = input.search(/\s/u)
  const token = (tokenEnd < 0 ? input : input.slice(0, tokenEnd)).toLocaleLowerCase('en-US')
  const command = commandByToken.get(token)
  if (!command) return null

  return { command, argument: (match[1] ?? '').trim() }
}

/** Returns menu candidates only while the composer contains one slash-prefixed token. */
export function matchResearchChatCommands(input: string): readonly ResearchChatCommandDefinition[] {
  if (!MENU_TOKEN.test(input)) return []
  const query = input.slice(1).toLocaleLowerCase('en-US')
  if (!query) return RESEARCH_CHAT_COMMANDS

  return RESEARCH_CHAT_COMMANDS.filter((definition) =>
    [
      definition.id,
      definition.command.slice(1),
      definition.label,
      definition.description,
      definition.usage,
      ...definition.keywords
    ].some((field) => field.toLocaleLowerCase('en-US').includes(query))
  )
}
