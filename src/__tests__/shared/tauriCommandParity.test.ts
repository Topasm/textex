import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TAURI_COMMANDS } from '../../shared/tauriCommands'

const root = process.cwd()
const buildSource = readFileSync(resolve(root, 'src-tauri/build.rs'), 'utf8')
const handlerSource = readFileSync(resolve(root, 'src-tauri/src/lib.rs'), 'utf8')
const adapterSource = readFileSync(resolve(root, 'src/renderer/platform/tauriApi.ts'), 'utf8')
const capability = JSON.parse(
  readFileSync(resolve(root, 'src-tauri/capabilities/main-window.json'), 'utf8')
) as { permissions: string[] }

function capture(source: string, pattern: RegExp, description: string): string {
  const match = source.match(pattern)
  if (!match?.groups?.body) throw new Error(`Could not parse ${description}`)
  return match.groups.body
}

function matches(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].map((match) => match[1])
}

function expectExactRegistry(actual: string[], expected: string[]): void {
  expect([...actual].sort()).toEqual([...expected].sort())
}

const sharedCommands = Object.values(TAURI_COMMANDS)
const sharedKeys = Object.keys(TAURI_COMMANDS)
const buildCommands = matches(
  capture(
    buildSource,
    /const COMMANDS: &\[&str\] = &\[(?<body>[\s\S]*?)\];/u,
    'src-tauri/build.rs command manifest'
  ),
  /"([a-z0-9_]+)"/gu
)
const handlerCommands = matches(
  capture(
    handlerSource,
    /\.invoke_handler\(tauri::generate_handler!\[(?<body>[\s\S]*?)\]\)/u,
    'src-tauri/src/lib.rs invoke handler'
  ),
  /commands::[a-z0-9_]+::([a-z0-9_]+),/gu
)
const capabilityPermissions = capability.permissions.filter((permission) =>
  permission.startsWith('allow-')
)
const expectedPermissions = sharedCommands.map((command) => `allow-${command.replaceAll('_', '-')}`)
const adapterCommandKeys = matches(adapterSource, /TAURI_COMMANDS\.([A-Za-z0-9_]+)/gu)

describe('Tauri command registry parity', () => {
  it('keeps shared command values unique', () => {
    expect(new Set(sharedCommands).size).toBe(sharedCommands.length)
  })

  it('matches the build-time command manifest exactly in both directions', () => {
    expectExactRegistry(buildCommands, sharedCommands)
  })

  it('matches the Rust invoke handler exactly in both directions', () => {
    expectExactRegistry(handlerCommands, sharedCommands)
  })

  it('matches the command capability permissions exactly in both directions', () => {
    expectExactRegistry(capabilityPermissions, expectedPermissions)
  })

  it('references every shared command key from the renderer adapter', () => {
    expectExactRegistry([...new Set(adapterCommandKeys)], sharedKeys)
  })
})
