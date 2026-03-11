import { describe, expect, it, vi } from 'vitest'

describe('preload app command bridge', () => {
  it('exposes onAppCommand and forwards app:command events', async () => {
    vi.resetModules()

    let exposedApi: Record<string, unknown> | undefined
    const listeners = new Map<string, (_event: unknown, ...args: unknown[]) => void>()
    const removeListener = vi.fn((channel: string) => {
      listeners.delete(channel)
    })

    vi.doMock('electron', () => ({
      contextBridge: {
        exposeInMainWorld: vi.fn((_key: string, value: Record<string, unknown>) => {
          exposedApi = value
        })
      },
      ipcRenderer: {
        invoke: vi.fn(),
        on: vi.fn((channel: string, cb: (_event: unknown, ...args: unknown[]) => void) => {
          listeners.set(channel, cb)
        }),
        removeListener
      }
    }))

    await import('../../preload/index')

    const callback = vi.fn()
    const onAppCommand = exposedApi?.onAppCommand as ((cb: (command: string) => void) => void) | undefined
    const removeAppCommandListener = exposedApi?.removeAppCommandListener as (() => void) | undefined

    expect(onAppCommand).toBeTypeOf('function')
    expect(removeAppCommandListener).toBeTypeOf('function')

    onAppCommand?.(callback)
    listeners.get('app:command')?.({}, 'file.open')
    expect(callback).toHaveBeenCalledWith('file.open')

    removeAppCommandListener?.()
    expect(removeListener).toHaveBeenCalledWith('app:command', expect.any(Function))
  })
})
