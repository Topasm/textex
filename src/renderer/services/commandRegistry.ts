/**
 * VS Code-style command registry.
 * Maps keyboard shortcuts to named commands with handlers.
 */

import { HIDDEN_EDITOR_ACTIONS } from '../constants'
import type { ShortcutBinding } from '../../shared/appCommandManifest'

interface Command {
  id: string
  binding: ShortcutBinding
  handler: () => void
}

export class CommandRegistry {
  private commands: Command[] = []

  register(id: string, binding: ShortcutBinding, handler: () => void): void {
    this.commands = this.commands.filter((c) => c.id !== id)
    this.commands.push({ id, binding, handler })
  }

  handleKeyDown(e: KeyboardEvent): void {
    const mod = e.ctrlKey || e.metaKey
    for (const cmd of this.commands) {
      if (this.matches(e, cmd.binding, mod)) {
        e.preventDefault()
        cmd.handler()
        return
      }
    }
  }

  clear(): void {
    this.commands = []
  }

  private matches(e: KeyboardEvent, b: ShortcutBinding, mod: boolean): boolean {
    if (b.mod !== mod) return false

    // When mod is active, shift acts as an explicit discriminator
    if (b.mod) {
      if (b.shift && !e.shiftKey) return false
      if (!b.shift && e.shiftKey) return false
      if (b.alt && !e.altKey) return false
      if (!b.alt && e.altKey) return false
    } else {
      // For non-mod bindings, only check shift if explicitly required
      if (b.shift && !e.shiftKey) return false
      if (b.alt && !e.altKey) return false
    }

    const keys = Array.isArray(b.key) ? b.key : [b.key]
    return keys.some((key) => {
      if (key.length === 1 && e.key.length === 1) {
        return key.toLocaleLowerCase() === e.key.toLocaleLowerCase()
      }
      return key === e.key
    })
  }
}

export const commandRegistry = new CommandRegistry()

/**
 * Set of command IDs that should be hidden from the command palette.
 * Populated by registerHiddenCommands() during editor initialization.
 */
export const hiddenCommandIds = new Set<string>()

/**
 * Populates hiddenCommandIds from the HIDDEN_EDITOR_ACTIONS constant.
 * Call once after the Monaco editor is mounted so that palette filtering
 * can exclude irrelevant actions (go-to-definition, refactor, etc.).
 */
export function registerHiddenCommands(): void {
  hiddenCommandIds.clear()
  for (const id of HIDDEN_EDITOR_ACTIONS) {
    hiddenCommandIds.add(id)
  }
}
