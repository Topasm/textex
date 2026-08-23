#!/usr/bin/env node

'use strict'

const { createHash, randomBytes } = require('node:crypto')
const { createReadStream } = require('node:fs')
const fs = require('node:fs/promises')
const path = require('node:path')

const REPOSITORY_ROOT = path.resolve(__dirname, '..')
const DEFAULT_OUTPUT = path.join(REPOSITORY_ROOT, 'resources', 'tectonic-cache')
const MANIFEST_NAME = 'manifest.json'
const FILES_DIRECTORY = 'files'
const SCHEMA_VERSION = 1
const TECTONIC_VERSION = '0.17.0'
const MAX_FILES = 50_000
const MAX_FILE_BYTES = 64 * 1024 * 1024
const MAX_TOTAL_BYTES = 512 * 1024 * 1024
const STAGE_PREFIX = '.tectonic-cache-seed-stage-'
const BACKUP_PREFIX = '.tectonic-cache-seed-backup-'

function usage() {
  return `Usage:
  node scripts/prepare-tectonic-cache-seed.js --check [--output <directory>]
  node scripts/prepare-tectonic-cache-seed.js --source <directory> --seed-version <version> [--output <directory>]

The generator copies a reviewed Tectonic cache into a deterministic files/
tree and writes a versioned SHA-256 manifest. It never downloads support files.
`
}

function parseArguments(args) {
  let check = false
  let source
  let output = DEFAULT_OUTPUT
  let seedVersion
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--check') check = true
    else if (argument === '--source') source = args[++index]
    else if (argument.startsWith('--source=')) source = argument.slice('--source='.length)
    else if (argument === '--output') output = args[++index]
    else if (argument.startsWith('--output=')) output = argument.slice('--output='.length)
    else if (argument === '--seed-version') seedVersion = args[++index]
    else if (argument.startsWith('--seed-version=')) {
      seedVersion = argument.slice('--seed-version='.length)
    } else if (argument === '-h' || argument === '--help') return { help: true }
    else throw new Error(`Unknown argument: ${argument}`)
  }
  if (check && source) throw new Error('--check and --source cannot be used together')
  if (!check && !source) throw new Error('generation requires --source')
  if (!check && !validSeedVersion(seedVersion)) {
    throw new Error('generation requires a valid --seed-version')
  }
  return {
    help: false,
    check,
    source: source ? path.resolve(source) : undefined,
    output: path.resolve(output),
    seedVersion
  }
}

function validSeedVersion(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)
}

async function sha256File(filePath) {
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) digest.update(chunk)
  return digest.digest('hex')
}

async function collectFiles(root) {
  const files = []
  async function visit(directory, relativeDirectory = '') {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
    for (const entry of entries) {
      const relative = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name
      const absolute = path.join(directory, entry.name)
      const metadata = await fs.lstat(absolute)
      if (metadata.isSymbolicLink()) throw new Error(`Seed source contains a symlink: ${relative}`)
      if (metadata.isDirectory()) {
        await visit(absolute, relative)
        continue
      }
      if (!metadata.isFile()) throw new Error(`Seed source entry is not a file: ${relative}`)
      if (metadata.size > MAX_FILE_BYTES) {
        throw new Error(`Seed file exceeds 64 MiB: ${relative}`)
      }
      files.push({ path: relative, size: metadata.size, absolute })
      if (files.length > MAX_FILES) throw new Error(`Seed contains more than ${MAX_FILES} files`)
    }
  }
  await visit(root)
  let totalBytes = 0
  for (const file of files) {
    totalBytes += file.size
    if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_TOTAL_BYTES) {
      throw new Error('Seed exceeds the 512 MiB total-size limit')
    }
    file.sha256 = await sha256File(file.absolute)
  }
  return { files, totalBytes }
}

function manifestFor(seedVersion, collection) {
  return {
    schemaVersion: SCHEMA_VERSION,
    seedVersion,
    tectonicVersion: TECTONIC_VERSION,
    totalBytes: collection.totalBytes,
    files: collection.files.map(({ path: filePath, size, sha256 }) => ({
      path: filePath,
      size,
      sha256
    }))
  }
}

async function generateSeed(source, output, seedVersion) {
  const sourceMetadata = await fs.lstat(source)
  if (!sourceMetadata.isDirectory() || sourceMetadata.isSymbolicLink()) {
    throw new Error(`Seed source is not a regular directory: ${source}`)
  }
  const canonicalSource = await fs.realpath(source)
  const canonicalOutputParent = await fs.realpath(await existingParent(output))
  const projectedOutput = path.join(canonicalOutputParent, path.relative(await existingParent(output), output))
  if (pathsOverlap(canonicalSource, projectedOutput)) {
    throw new Error('Seed source and output directories must not overlap')
  }

  const collection = await collectFiles(canonicalSource)
  const manifest = manifestFor(seedVersion, collection)
  const token = `${process.pid}-${randomBytes(5).toString('hex')}`
  const outputParent = path.dirname(output)
  const stage = path.join(outputParent, `${STAGE_PREFIX}${token}`)
  await fs.mkdir(path.join(stage, FILES_DIRECTORY), { recursive: true })
  try {
    for (const file of collection.files) {
      const destination = path.join(stage, FILES_DIRECTORY, ...file.path.split('/'))
      await fs.mkdir(path.dirname(destination), { recursive: true })
      await fs.copyFile(file.absolute, destination)
    }
    await fs.writeFile(
      path.join(stage, MANIFEST_NAME),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { flag: 'wx' }
    )
    await verifySeed(stage)
    await installGeneratedStage(stage, output, token)
  } catch (error) {
    await safeRemoveStage(stage, outputParent)
    throw error
  }
  console.log(
    `Staged Tectonic seed ${seedVersion}: ${collection.files.length} files, ${collection.totalBytes} bytes`
  )
  return manifest
}

async function installGeneratedStage(stage, output, token) {
  await fs.mkdir(output, { recursive: true })
  const outputParent = path.dirname(output)
  const filesTarget = path.join(output, FILES_DIRECTORY)
  const manifestTarget = path.join(output, MANIFEST_NAME)
  const filesBackup = path.join(outputParent, `${BACKUP_PREFIX}${token}-files`)
  const manifestBackup = path.join(outputParent, `${BACKUP_PREFIX}${token}-manifest.json`)
  let backedUpFiles = false
  let backedUpManifest = false
  let installedFiles = false
  let installedManifest = false
  try {
    if (await exists(filesTarget)) {
      await fs.rename(filesTarget, filesBackup)
      backedUpFiles = true
    }
    if (await exists(manifestTarget)) {
      await fs.rename(manifestTarget, manifestBackup)
      backedUpManifest = true
    }
    await fs.rename(path.join(stage, FILES_DIRECTORY), filesTarget)
    installedFiles = true
    await fs.rename(path.join(stage, MANIFEST_NAME), manifestTarget)
    installedManifest = true
    await fs.rmdir(stage)
    if (backedUpFiles) await fs.rm(filesBackup, { recursive: true, force: true })
    if (backedUpManifest) await fs.rm(manifestBackup, { force: true })
  } catch (error) {
    if (installedFiles) await fs.rm(filesTarget, { recursive: true, force: true })
    if (installedManifest) await fs.rm(manifestTarget, { force: true })
    if (backedUpFiles) await fs.rename(filesBackup, filesTarget)
    if (backedUpManifest) await fs.rename(manifestBackup, manifestTarget)
    throw error
  }
}

async function verifySeed(output) {
  const manifestPath = path.join(output, MANIFEST_NAME)
  const manifestMetadata = await fs.lstat(manifestPath)
  if (!manifestMetadata.isFile() || manifestMetadata.isSymbolicLink()) {
    throw new Error('Seed manifest must be a regular file')
  }
  if (manifestMetadata.size > 1024 * 1024) throw new Error('Seed manifest exceeds 1 MiB')
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  validateManifest(manifest)
  const filesRoot = path.join(output, FILES_DIRECTORY)
  if (manifest.files.length === 0) {
    if (await exists(filesRoot)) {
      const extras = await fs.readdir(filesRoot)
      if (extras.length > 0) throw new Error('Empty seed manifest has staged files')
    }
    console.log(`Checked empty Tectonic seed manifest ${manifest.seedVersion}; network fallback remains enabled`)
    return manifest
  }
  const collection = await collectFiles(filesRoot)
  const actual = manifestFor(manifest.seedVersion, collection)
  if (JSON.stringify(actual) !== JSON.stringify(manifest)) {
    throw new Error('Tectonic seed files do not match the deterministic manifest')
  }
  console.log(
    `Checked Tectonic seed ${manifest.seedVersion}: ${manifest.files.length} files, ${manifest.totalBytes} bytes`
  )
  return manifest
}

function validateManifest(manifest) {
  const keys = Object.keys(manifest).sort().join(',')
  if (keys !== 'files,schemaVersion,seedVersion,tectonicVersion,totalBytes') {
    throw new Error('Seed manifest has missing or unknown fields')
  }
  if (manifest.schemaVersion !== SCHEMA_VERSION) throw new Error('Unsupported seed schema')
  if (!validSeedVersion(manifest.seedVersion)) throw new Error('Invalid seed version')
  if (manifest.tectonicVersion !== TECTONIC_VERSION) {
    throw new Error(`Seed must target Tectonic ${TECTONIC_VERSION}`)
  }
  if (!Array.isArray(manifest.files) || manifest.files.length > MAX_FILES) {
    throw new Error('Invalid seed file list')
  }
  let totalBytes = 0
  let previousPath = ''
  const seen = new Set()
  for (const file of manifest.files) {
    if (Object.keys(file).sort().join(',') !== 'path,sha256,size') {
      throw new Error('Seed file entry has missing or unknown fields')
    }
    if (!validRelativePath(file.path) || seen.has(file.path) || file.path <= previousPath) {
      throw new Error(`Invalid, duplicate, or unsorted seed path: ${file.path}`)
    }
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_FILE_BYTES) {
      throw new Error(`Invalid seed size for ${file.path}`)
    }
    if (typeof file.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(file.sha256)) {
      throw new Error(`Invalid seed SHA-256 for ${file.path}`)
    }
    seen.add(file.path)
    previousPath = file.path
    totalBytes += file.size
  }
  if (
    !Number.isSafeInteger(manifest.totalBytes) ||
    manifest.totalBytes !== totalBytes ||
    totalBytes > MAX_TOTAL_BYTES
  ) {
    throw new Error('Seed totalBytes does not match the file list')
  }
}

function validRelativePath(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('\\') &&
    !value.includes('\0') &&
    !path.posix.isAbsolute(value) &&
    value.split('/').every((part) => part && part !== '.' && part !== '..')
  )
}

async function existingParent(target) {
  let candidate = path.resolve(target)
  while (!(await exists(candidate))) {
    const parent = path.dirname(candidate)
    if (parent === candidate) throw new Error(`No existing parent for ${target}`)
    candidate = parent
  }
  return candidate
}

function pathsOverlap(left, right) {
  const relative = path.relative(left, right)
  const reverse = path.relative(right, left)
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative)) ||
    (!reverse.startsWith('..') && !path.isAbsolute(reverse))
  )
}

async function exists(target) {
  try {
    await fs.lstat(target)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function safeRemoveStage(stage, expectedParent) {
  if (
    path.dirname(path.resolve(stage)) !== path.resolve(expectedParent) ||
    !path.basename(stage).startsWith(STAGE_PREFIX)
  ) {
    throw new Error(`Refusing to remove unexpected staging directory ${stage}`)
  }
  await fs.rm(stage, { recursive: true, force: true })
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(usage())
    return
  }
  if (options.check) await verifySeed(options.output)
  else await generateSeed(options.source, options.output, options.seedVersion)
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Tectonic cache seed preparation failed: ${error instanceof Error ? error.message : error}`)
    process.exitCode = 1
  })
}

module.exports = {
  collectFiles,
  generateSeed,
  manifestFor,
  parseArguments,
  validateManifest,
  verifySeed
}
