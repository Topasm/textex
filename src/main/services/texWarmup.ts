import { app } from 'electron'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { createHash } from 'crypto'
import { compileWarmupDocument } from '../compiler'
import { ensureTectonicCacheReady } from './tectonicCache'

const WARMUP_DELAY_MS = 5000
const WARMUP_MANIFEST_FILE = 'tex-warmup.json'
const WARMUP_TMP_PREFIX = 'textex-warmup-'

export const TECTONIC_WARMUP_PACKAGES = [
  'amsmath',
  'amssymb',
  'mathtools',
  'graphicx',
  'xcolor',
  'hyperref',
  'booktabs',
  'geometry',
  'caption',
  'subcaption'
] as const

interface WarmupManifest {
  appVersion: string
  packageHash: string
  completedAt: string
}

let warmupScheduled = false
let warmupStarted = false

export function getWarmupManifestPath(): string {
  return path.join(app.getPath('userData'), WARMUP_MANIFEST_FILE)
}

export function createWarmupPackageHash(
  packageNames: readonly string[] = TECTONIC_WARMUP_PACKAGES
): string {
  return createHash('sha256').update(packageNames.join('\n')).digest('hex')
}

export function isWarmupManifestCurrent(
  manifest: WarmupManifest | null,
  appVersion: string,
  packageHash: string
): boolean {
  return (
    manifest?.appVersion === appVersion &&
    manifest?.packageHash === packageHash &&
    typeof manifest.completedAt === 'string'
  )
}

export function buildWarmupDocument(
  packageNames: readonly string[] = TECTONIC_WARMUP_PACKAGES
): string {
  const usePackages = packageNames.map((pkg) => `\\usepackage{${pkg}}`).join('\n')
  return [
    '\\documentclass{article}',
    usePackages,
    '\\begin{document}',
    'TextEx warmup.',
    '\\end{document}',
    ''
  ].join('\n')
}

async function readWarmupManifest(): Promise<WarmupManifest | null> {
  try {
    const raw = await fs.readFile(getWarmupManifestPath(), 'utf-8')
    return JSON.parse(raw) as WarmupManifest
  } catch {
    return null
  }
}

async function writeWarmupManifest(manifest: WarmupManifest): Promise<void> {
  const manifestPath = getWarmupManifestPath()
  const tmpPath = manifestPath + '.tmp'
  await fs.mkdir(path.dirname(manifestPath), { recursive: true })
  await fs.writeFile(tmpPath, JSON.stringify(manifest, null, 2), 'utf-8')
  await fs.rename(tmpPath, manifestPath)
}

export async function shouldRunTexWarmup(
  appVersion = app.getVersion(),
  packageHash = createWarmupPackageHash()
): Promise<boolean> {
  const manifest = await readWarmupManifest()
  return !isWarmupManifestCurrent(manifest, appVersion, packageHash)
}

export async function runTexWarmup(): Promise<boolean> {
  const appVersion = app.getVersion()
  const packageHash = createWarmupPackageHash()

  if (!(await shouldRunTexWarmup(appVersion, packageHash))) {
    return false
  }

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), WARMUP_TMP_PREFIX))
  const texPath = path.join(tempRoot, 'warmup.tex')

  try {
    await ensureTectonicCacheReady()
    await fs.writeFile(texPath, buildWarmupDocument(), 'utf-8')
    await compileWarmupDocument(texPath)
    await writeWarmupManifest({
      appVersion,
      packageHash,
      completedAt: new Date().toISOString()
    })
    return true
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {})
  }
}

export function scheduleTexWarmup(delayMs = WARMUP_DELAY_MS): void {
  if (warmupScheduled) return
  warmupScheduled = true

  setTimeout(() => {
    if (warmupStarted) return
    warmupStarted = true
    runTexWarmup()
      .catch((err) => {
        console.warn('TeX warmup failed:', err)
      })
      .finally(() => {
        warmupScheduled = false
      })
  }, delayMs)
}
