import fs from 'fs/promises'
import path from 'path'
import { app } from 'electron'
import { PackageMacro, PackageEnv, PackageData } from '../shared/types'

const packageCache = new Map<string, PackageData | null>()
const requestCache = new Map<string, Record<string, PackageData>>()
const COMMON_PACKAGE_NAMES = [
  'amsmath',
  'amssymb',
  'graphicx',
  'xcolor',
  'hyperref',
  'booktabs',
  'geometry',
  'biblatex'
]

function getPackageDataDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'data', 'packages')
  }
  return path.join(__dirname, '../../resources/data/packages')
}

type RawDep = string | { name?: string } | undefined
type RawMacro = {
  name?: string
  snippet?: string
  detail?: string
  doc?: string
  unusual?: boolean
  arg?: { snippet?: string }
}
type RawEnv = { name?: string; argSnippet?: string; arg?: { snippet?: string }; unusual?: boolean }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Parse deps from either format:
 * - textex: ["name1", "name2"]
 * - LaTeX-Workshop: [{ "name": "name1" }, ...]
 */
function parseDeps(deps: unknown): string[] {
  if (!Array.isArray(deps)) return []
  return (deps as RawDep[])
    .map((d) => (typeof d === 'string' ? d : d?.name))
    .filter((d): d is string => typeof d === 'string')
}

/**
 * Parse macros from either format:
 * - textex object: { "\\cmd": { "snippet": "...", "detail": "..." } }
 * - LaTeX-Workshop array: [{ "name": "cmd", "arg": { "snippet": "..." } }]
 */
function parseMacros(macros: unknown): PackageMacro[] {
  const result: PackageMacro[] = []

  if (Array.isArray(macros)) {
    // LaTeX-Workshop format
    for (const m of macros as RawMacro[]) {
      if (m.unusual) continue
      if (!m.name) continue
      result.push({
        name: m.name,
        snippet: m.arg?.snippet,
        detail: m.detail || m.doc
      })
    }
  } else if (isObject(macros)) {
    // textex format
    for (const [cmdName, info] of Object.entries(macros)) {
      const macroInfo = (isObject(info) ? info : {}) as { snippet?: string; detail?: string }
      result.push({
        name: cmdName.replace(/^\\/, ''),
        snippet: macroInfo.snippet,
        detail: macroInfo.detail
      })
    }
  }

  return result
}

/**
 * Parse environments from either format:
 * - textex object: {} or absent
 * - LaTeX-Workshop array: [{ "name": "env", "arg": { "snippet": "..." } }]
 * - textex array: [{ "name": "env", "argSnippet": "..." }]
 */
function parseEnvs(envs: unknown): PackageEnv[] {
  if (!Array.isArray(envs)) return []
  return (envs as RawEnv[])
    .filter((e) => !e.unusual && typeof e.name === 'string')
    .map((e) => ({
      name: e.name as string,
      argSnippet: e.argSnippet || e.arg?.snippet
    }))
}

export async function loadPackageData(
  packageNames: string[]
): Promise<Record<string, PackageData>> {
  const requestKey = packageNames.slice().sort().join('\0')
  const cachedRequest = requestCache.get(requestKey)
  if (cachedRequest) {
    return cachedRequest
  }

  const result: Record<string, PackageData> = {}
  const dir = getPackageDataDir()

  // Resolve packages including transitive deps
  const toLoad = new Set(packageNames)
  const loaded = new Set<string>()

  while (toLoad.size > 0) {
    const name = toLoad.values().next().value as string
    toLoad.delete(name)
    if (loaded.has(name)) continue
    loaded.add(name)

    try {
      // Validate package name to prevent path traversal
      if (!/^[a-z0-9_-]+$/i.test(name)) continue
      const cached = packageCache.get(name)
      if (cached) {
        result[name] = cached
        for (const dep of cached.deps) {
          if (!loaded.has(dep)) toLoad.add(dep)
        }
        continue
      }
      if (cached === null) {
        continue
      }
      const jsonPath = path.join(dir, `${name}.json`)
      const content = await fs.readFile(jsonPath, 'utf-8')
      const data = JSON.parse(content)

      const macros = parseMacros(data.macros)
      const envs = parseEnvs(data.envs)
      const deps = parseDeps(data.deps)
      const packageData = { macros, envs, deps }
      packageCache.set(name, packageData)
      result[name] = packageData

      // Queue transitive deps
      for (const dep of deps) {
        if (!loaded.has(dep)) toLoad.add(dep)
      }
    } catch {
      // Package JSON not found, skip
      packageCache.set(name, null)
    }
  }

  requestCache.set(requestKey, result)
  return result
}

export async function preloadCommonPackageData(): Promise<void> {
  await loadPackageData(COMMON_PACKAGE_NAMES)
}
