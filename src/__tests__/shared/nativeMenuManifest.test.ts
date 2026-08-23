import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { APP_COMMAND_MANIFEST } from '../../shared/appCommandManifest'
import { getDesktopCapabilities } from '../../renderer/platform/capabilities'

const menuSource = readFileSync(resolve(process.cwd(), 'src-tauri/src/services/menu.rs'), 'utf8')
const mainWindowCapability = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src-tauri/capabilities/main-window.json'), 'utf8')
) as { permissions: string[] }

function nativeRendererCommands(): string[] {
  const block = menuSource.match(/const RENDERER_COMMANDS: &\[&str\] = &\[(.*?)\];/s)?.[1] ?? ''
  return [...block.matchAll(/"([a-zA-Z]+(?:\.[a-zA-Z]+)+)"/g)].map((match) => match[1])
}

describe('native application menu', () => {
  it('keeps its renderer command allowlist aligned with the shared manifest', () => {
    expect(nativeRendererCommands().sort()).toEqual(APP_COMMAND_MANIFEST.map(({ id }) => id).sort())
  })

  it('provides the expected desktop menu groups and internal window actions', () => {
    for (const label of ['File', 'Edit', 'View', 'PDF', 'Compile', 'AI', 'Window', 'Help']) {
      expect(menuSource).toContain(`SubmenuBuilder::new(app, "${label}")`)
    }
    for (const id of [
      'window.minimize',
      'window.toggleMaximize',
      'window.toggleFullscreen',
      'window.close',
      'app.quit'
    ]) {
      expect(menuSource).toContain(`"${id}"`)
    }
  })

  it('keeps native capability-gated menu groups aligned with the renderer', () => {
    const capabilities = getDesktopCapabilities()
    const nativeNames = {
      ai: 'ai',
      documentExport: 'document_export',
      pty: 'pty',
      templates: 'templates'
    } as const

    for (const [rendererName, nativeName] of Object.entries(nativeNames)) {
      const value = menuSource.match(new RegExp(`${nativeName}: (true|false)`))?.[1] === 'true'
      expect(value, nativeName).toBe(capabilities[rendererName as keyof typeof nativeNames])
    }
  })

  it('allows the renderer to subscribe to native app-command events', () => {
    expect(mainWindowCapability.permissions).toEqual(
      expect.arrayContaining(['core:event:allow-listen', 'core:event:allow-unlisten'])
    )
  })
})
