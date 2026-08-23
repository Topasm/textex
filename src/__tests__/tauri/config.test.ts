import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface TauriConfig {
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
})
