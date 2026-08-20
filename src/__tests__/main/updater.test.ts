import { beforeEach, describe, expect, it, vi } from 'vitest'

const updaterMock = vi.hoisted(() => {
  const listeners = new Map<string, (...args: unknown[]) => void>()
  const autoUpdater = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      listeners.set(event, listener)
    }),
    checkForUpdates: vi.fn().mockResolvedValue(null),
    downloadUpdate: vi.fn().mockResolvedValue([]),
    quitAndInstall: vi.fn()
  }

  return { autoUpdater, listeners }
})

vi.mock('electron', () => ({ app: { isPackaged: true } }))
vi.mock('electron-updater', () => ({ autoUpdater: updaterMock.autoUpdater }))

import { checkForAppUpdates } from '../../main/updater'

describe('application updater', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes once and forwards normalized update events', async () => {
    const send = vi.fn()
    const getWindow = () =>
      ({
        isDestroyed: () => false,
        webContents: { send }
      }) as never

    await expect(checkForAppUpdates(getWindow)).resolves.toEqual({ success: true })
    await expect(checkForAppUpdates(getWindow)).resolves.toEqual({ success: true })

    expect(updaterMock.autoUpdater.autoDownload).toBe(false)
    expect(updaterMock.autoUpdater.autoInstallOnAppQuit).toBe(true)
    expect(updaterMock.autoUpdater.on).toHaveBeenCalledTimes(6)
    expect(updaterMock.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2)

    updaterMock.listeners.get('update-available')?.({ version: '2.0.0' })
    updaterMock.listeners.get('download-progress')?.({ percent: 125 })
    updaterMock.listeners.get('update-downloaded')?.({ version: '2.0.0' })

    expect(send).toHaveBeenNthCalledWith(1, 'update:available', '2.0.0')
    expect(send).toHaveBeenNthCalledWith(2, 'update:download-progress', 100)
    expect(send).toHaveBeenNthCalledWith(3, 'update:downloaded', '2.0.0')
  })
})
