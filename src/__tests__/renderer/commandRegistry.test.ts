import { describe, expect, it, vi } from 'vitest'
import { CommandRegistry } from '../../renderer/services/commandRegistry'

function keyboardEvent(
  key: string,
  opts: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {}
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, ...opts })
  Object.defineProperty(event, 'preventDefault', { value: vi.fn() })
  return event
}

describe('CommandRegistry', () => {
  it('distinguishes Alt-modified shortcuts from plain mod shortcuts', () => {
    const registry = new CommandRegistry()
    const plain = vi.fn()
    const alt = vi.fn()

    registry.register('plain', { key: '=', mod: true }, plain)
    registry.register('alt', { key: '=', mod: true, alt: true }, alt)

    registry.handleKeyDown(keyboardEvent('=', { ctrlKey: true }))
    expect(plain).toHaveBeenCalledOnce()
    expect(alt).not.toHaveBeenCalled()

    registry.handleKeyDown(keyboardEvent('=', { ctrlKey: true, altKey: true }))
    expect(plain).toHaveBeenCalledOnce()
    expect(alt).toHaveBeenCalledOnce()
  })
})
