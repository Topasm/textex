import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { CONTEXT_MENU_EVENT, CONTEXT_MENU_ID_PREFIX } from '../../shared/contextMenu'

const native = vi.hoisted(() => ({
  newMenu: vi.fn(),
  popup: vi.fn(),
  close: vi.fn(),
  listen: vi.fn(),
  event: (_: { payload: string }) => {}
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), Channel: class {} }))
vi.mock('@tauri-apps/api/event', () => ({ listen: native.listen }))
vi.mock('@tauri-apps/api/menu', () => ({ Menu: { new: native.newMenu } }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ label: 'main' }) }))

const request = {
  x: 24,
  y: 48,
  items: [
    { id: 'rename', label: 'Rename & move' },
    { id: 'delete', label: 'Delete', disabled: true }
  ]
}
async function api() {
  return (await import('../../renderer/platform/tauriApi')).createTauriApi()
}

beforeEach(() => {
  vi.resetModules()
  native.newMenu.mockReset().mockResolvedValue({ popup: native.popup, close: native.close })
  native.popup.mockReset().mockResolvedValue(undefined)
  native.close.mockReset().mockResolvedValue(undefined)
  native.listen.mockReset().mockImplementation(async (_event, callback) => {
    native.event = callback
    return () => {}
  })
})

describe('native context menu adapter', () => {
  it('uses logical coordinates, releases the menu, and accepts a delayed activation once', async () => {
    const bridge = await api()
    const select = vi.fn()
    await bridge.showContextMenu(request, select)
    expect(native.listen).toHaveBeenCalledWith(CONTEXT_MENU_EVENT, expect.any(Function))
    expect(native.popup).toHaveBeenCalledWith(expect.objectContaining({ x: 24, y: 48 }), {
      label: 'main'
    })
    expect(native.close).toHaveBeenCalledOnce()
    const options = native.newMenu.mock.calls[0][0]
    expect(options.items[0]).toMatchObject({ text: 'Rename && move', enabled: true })
    expect(options.items[1].enabled).toBe(false)
    expect(options.items[0]).not.toHaveProperty('action')
    native.event({ payload: options.items[1].id })
    native.event({ payload: 'app.quit' })
    native.event({ payload: options.items[0].id })
    native.event({ payload: options.items[0].id })
    expect(select).toHaveBeenCalledExactlyOnceWith('rename')
  })

  it('never dispatches an older menu choice against the next target', async () => {
    const bridge = await api()
    const oldSelect = vi.fn(),
      nextSelect = vi.fn()
    await bridge.showContextMenu(request, oldSelect)
    const oldId = native.newMenu.mock.calls[0][0].items[0].id
    await bridge.showContextMenu(request, nextSelect)
    const nextId = native.newMenu.mock.calls[1][0].items[0].id
    expect(nextId).not.toBe(oldId)
    expect(native.listen).toHaveBeenCalledTimes(1)
    native.event({ payload: oldId })
    expect(oldSelect).not.toHaveBeenCalled()
    expect(nextSelect).not.toHaveBeenCalled()
    native.event({ payload: nextId })
    expect(nextSelect).toHaveBeenCalledExactlyOnceWith('rename')
  })

  it('does not pop up after its owner disappears during creation', async () => {
    const bridge = await api()
    let finish!: (value: unknown) => void
    native.newMenu.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    const controller = new AbortController()
    const select = vi.fn()
    const pending = bridge.showContextMenu(request, select, controller.signal)
    await vi.waitFor(() => expect(native.newMenu).toHaveBeenCalled())
    controller.abort()
    finish({ popup: native.popup, close: native.close })
    await pending
    expect(native.popup).not.toHaveBeenCalled()
    expect(native.close).toHaveBeenCalledOnce()
    native.event({ payload: native.newMenu.mock.calls[0][0].items[0].id })
    expect(select).not.toHaveBeenCalled()
  })

  it('releases resources on popup failure and allows the next menu to open', async () => {
    const bridge = await api()
    native.popup.mockRejectedValueOnce(new Error('popup failed'))
    await expect(bridge.showContextMenu(request, vi.fn())).rejects.toThrow('popup failed')
    expect(native.close).toHaveBeenCalledOnce()
    await bridge.showContextMenu(request, vi.fn())
    expect(native.popup).toHaveBeenCalledTimes(2)
  })

  it('keeps native event routing and least-privilege capabilities aligned', () => {
    const service = readFileSync('src-tauri/src/services/context_menu.rs', 'utf8')
    expect(service).toContain(`"${CONTEXT_MENU_EVENT}"`)
    expect(service).toContain(`"${CONTEXT_MENU_ID_PREFIX}"`)
    const capabilities = JSON.parse(readFileSync('src-tauri/capabilities/main-window.json', 'utf8'))
    expect(capabilities.permissions).toEqual(
      expect.arrayContaining([
        'core:menu:allow-new',
        'core:menu:allow-popup',
        'core:resources:allow-close'
      ])
    )
    expect(capabilities.permissions).not.toContain('core:menu:default')
  })
})
