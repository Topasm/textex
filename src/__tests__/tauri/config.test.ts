import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface TauriConfig {
  plugins?: {
    updater?: Record<string, unknown>
  }
}

describe('Tauri configuration', () => {
  it('provides an object configuration for the updater plugin', () => {
    const configPath = resolve(process.cwd(), 'src-tauri/tauri.conf.json')
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as TauriConfig

    expect(config.plugins?.updater).toEqual({})
  })
})
