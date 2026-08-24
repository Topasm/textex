import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createDefaultUserSettings } from '../../shared/defaultSettings'

const mocks = vi.hoisted(() => ({
  createRoot: vi.fn(),
  hydrateSettingsFromNative: vi.fn(),
  installDesktopApi: vi.fn(),
  installRendererSessionBridge: vi.fn(),
  installRuntimePerformance: vi.fn(),
  loadNativeSettingsSnapshot: vi.fn(),
  render: vi.fn(),
  showStartupError: vi.fn()
}))

vi.mock('react-dom/client', () => ({
  default: { createRoot: mocks.createRoot }
}))

vi.mock('../../renderer/App', () => ({ default: () => null }))
vi.mock('../../renderer/components/ErrorBoundary', () => ({
  default: ({ children }: { children: ReactNode }) => children
}))
vi.mock('../../renderer/platform/desktopApi', () => ({
  installDesktopApi: mocks.installDesktopApi
}))
vi.mock('../../renderer/services/rendererSession', () => ({
  installRendererSessionBridge: mocks.installRendererSessionBridge
}))
vi.mock('../../renderer/services/runtimePerformance', () => ({
  installRuntimePerformance: mocks.installRuntimePerformance
}))
vi.mock('../../renderer/services/startupSurface', () => ({
  showStartupError: mocks.showStartupError
}))
vi.mock('../../renderer/store/useSettingsStore', () => ({
  hydrateSettingsFromNative: mocks.hydrateSettingsFromNative,
  loadNativeSettingsSnapshot: mocks.loadNativeSettingsSnapshot
}))

describe('renderer startup hydration', () => {
  it('loads once, fans out one snapshot, and waits for both hydrators before mounting', async () => {
    document.body.innerHTML = '<div id="root"><span>Starting</span></div>'
    const nativeSettings = { ...createDefaultUserSettings(), theme: 'dark' as const }
    vi.mocked(window.api.loadSettings).mockReset().mockResolvedValue(nativeSettings)
    mocks.installDesktopApi.mockResolvedValue(undefined)
    mocks.loadNativeSettingsSnapshot.mockImplementation(() => window.api.loadSettings())
    mocks.createRoot.mockReturnValue({ render: mocks.render })

    let finishSession!: () => void
    let finishSettings!: () => void
    mocks.installRendererSessionBridge.mockReturnValue(
      new Promise<void>((resolve) => {
        finishSession = resolve
      })
    )
    mocks.hydrateSettingsFromNative.mockReturnValue(
      new Promise<void>((resolve) => {
        finishSettings = resolve
      })
    )

    await import('../../renderer/main')
    await vi.waitFor(() => {
      expect(mocks.installRendererSessionBridge).toHaveBeenCalledWith(nativeSettings)
      expect(mocks.hydrateSettingsFromNative).toHaveBeenCalledWith(nativeSettings)
    })

    expect(window.api.loadSettings).toHaveBeenCalledTimes(1)
    expect(mocks.render).not.toHaveBeenCalled()

    finishSession()
    await Promise.resolve()
    expect(mocks.render).not.toHaveBeenCalled()

    finishSettings()
    await vi.waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(1))
    expect(mocks.installRuntimePerformance).toHaveBeenCalledTimes(1)
    expect(mocks.showStartupError).not.toHaveBeenCalled()
  })
})
