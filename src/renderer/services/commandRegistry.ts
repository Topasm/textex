/**
 * VS Code-style command registry.
 * Maps keyboard shortcuts to named commands with handlers.
 */

import { HIDDEN_EDITOR_ACTIONS } from '../constants'

interface KeyBinding {
  /** The key to match (e.g. 's', 'Enter', 'Tab') */
  key: string | string[]
  /** Requires Ctrl (or Cmd on macOS) */
  mod: boolean
  /** Requires Shift. When `mod` is true and `shift` is false, the binding
   *  only fires when Shift is NOT held (prevents collisions like Ctrl+S vs Ctrl+Shift+S). */
  shift?: boolean
}

interface Command {
  id: string
  binding: KeyBinding
  handler: () => void
}

export class CommandRegistry {
  private commands: Command[] = []

  register(id: string, binding: KeyBinding, handler: () => void): void {
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

  private matches(e: KeyboardEvent, b: KeyBinding, mod: boolean): boolean {
    if (b.mod !== mod) return false

    // When mod is active, shift acts as an explicit discriminator
    if (b.mod) {
      if (b.shift && !e.shiftKey) return false
      if (!b.shift && e.shiftKey) return false
    } else {
      // For non-mod bindings, only check shift if explicitly required
      if (b.shift && !e.shiftKey) return false
    }

    const keys = Array.isArray(b.key) ? b.key : [b.key]
    return keys.includes(e.key)
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
