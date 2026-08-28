import { useEffect } from 'react'
import { ICON_SIZE } from '../ui/IconSystem'
import { useTranslation } from 'react-i18next'
import {
  BookOpen,
  CircleHelp,
  FileCheck2,
  FilePenLine,
  Globe2,
  Library,
  ListTodo,
  ListTree,
  Search,
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
  'find-sources': Search,
  'submission-check': FileCheck2,
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
  const { t } = useTranslation()
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
      aria-label={t('researchPanel.chat.commandsLabel')}
    >
      {commands.map((command, index) => {
        const active = index === activeIndex
        const Icon = COMMAND_ICONS[command.id]
        // The manifest keeps the English syntax that `/`-matching searches on;
        // only the copy shown to the author is translated.
        const key = `researchPanel.chatCommands.${command.id}`

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
            <Icon
              className="research-chat-command-icon"
              size={ICON_SIZE.compact}
              aria-hidden="true"
            />
            <span className="research-chat-command-copy">
              <span className="research-chat-command-heading">
                <code>{command.command}</code>
                <span>{t(`${key}.label`, { defaultValue: command.label })}</span>
              </span>
              <span className="research-chat-command-description">
                {t(`${key}.description`, { defaultValue: command.description })}
              </span>
              <code className="research-chat-command-usage">
                {t(`${key}.usage`, { defaultValue: command.usage })}
              </code>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export default ResearchChatCommandMenu
