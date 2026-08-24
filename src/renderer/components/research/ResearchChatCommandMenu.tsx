import { useEffect } from 'react'
import {
  BookOpen,
  CircleHelp,
  FilePenLine,
  Globe2,
  Library,
  ListTodo,
  ListTree,
  ShieldCheck,
  type LucideIcon
} from 'lucide-react'
import type { ResearchChatCommandDefinition } from '../../services/researchChatCommands'
import './ResearchChatCommandMenu.css'

const COMMAND_ICONS: Record<ResearchChatCommandDefinition['id'], LucideIcon> = {
  help: CircleHelp,
  references: BookOpen,
  zotero: Library,
  online: Globe2,
  todo: ListTodo,
  outline: ListTree,
  draft: FilePenLine,
  'zotero-plan': ShieldCheck
}

export interface ResearchChatCommandMenuProps {
  commands: readonly ResearchChatCommandDefinition[]
  activeIndex: number
  listboxId: string
  onActiveIndexChange: (index: number) => void
  onSelect: (command: ResearchChatCommandDefinition) => void
}

export function ResearchChatCommandMenu({
  commands,
  activeIndex,
  listboxId,
  onActiveIndexChange,
  onSelect
}: ResearchChatCommandMenuProps) {
  useEffect(() => {
    if (!commands[activeIndex]) return

    const activeOption = document.getElementById(`${listboxId}-option-${activeIndex}`)
    if (activeOption && typeof activeOption.scrollIntoView === 'function') {
      activeOption.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex, commands, listboxId])

  return (
    <ul
      id={listboxId}
      className="research-chat-command-menu"
      role="listbox"
      aria-label="Chat commands"
    >
      {commands.map((command, index) => {
        const active = index === activeIndex
        const Icon = COMMAND_ICONS[command.id]

        return (
          <li
            id={`${listboxId}-option-${index}`}
            className={`research-chat-command-option${active ? ' active' : ''}`}
            role="option"
            aria-selected={active}
            key={command.id}
            onMouseMove={() => {
              if (!active) onActiveIndexChange(index)
            }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(command)}
          >
            <Icon className="research-chat-command-icon" size={15} aria-hidden="true" />
            <span className="research-chat-command-copy">
              <span className="research-chat-command-heading">
                <code>{command.command}</code>
                <span>{command.label}</span>
              </span>
              <span className="research-chat-command-description">{command.description}</span>
              <code className="research-chat-command-usage">{command.usage}</code>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export default ResearchChatCommandMenu
