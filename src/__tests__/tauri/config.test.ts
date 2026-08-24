import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface TauriConfig {
  app?: {
    windows?: Array<{
      decorations?: unknown
      hiddenTitle?: unknown
      titleBarStyle?: unknown
      trafficLightPosition?: unknown
    }>
  }
  plugins?: {
    updater?: {
      pubkey?: unknown
    }
  }
}

describe('Tauri configuration', () => {
  it('provides the updater pubkey field required before builder overrides are applied', () => {
    const configPath = resolve(process.cwd(), 'src-tauri/tauri.conf.json')
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as TauriConfig

    expect(config.plugins?.updater).toEqual({ pubkey: '' })
    expect(typeof config.plugins?.updater?.pubkey).toBe('string')
  })

  it('uses an overlay-ready native title bar for macOS custom toolbar integration', () => {
    const configPath = resolve(process.cwd(), 'src-tauri/tauri.conf.json')
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as TauriConfig
    const mainWindow = config.app?.windows?.[0]

    expect(mainWindow).toMatchObject({
      decorations: true,
      hiddenTitle: true,
      titleBarStyle: 'Overlay',
      trafficLightPosition: { x: 18, y: 19 }
    })
  })

  it('keeps native menus on macOS and installs frameless chrome on Windows and Linux', () => {
    const libSource = readFileSync(resolve(process.cwd(), 'src-tauri/src/lib.rs'), 'utf8')

    expect(libSource).toContain('#[cfg(any(target_os = "linux", target_os = "windows"))]')
    expect(libSource).toContain('window.set_decorations(false)?')
    expect(libSource).toContain('#[cfg(target_os = "macos")]\n    let builder = builder')
    expect(libSource).toContain('.menu(services::menu::build)')
  })
})
