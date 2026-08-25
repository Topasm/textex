#!/usr/bin/env node

'use strict'

const { createHash, randomBytes } = require('node:crypto')
const { createReadStream, createWriteStream } = require('node:fs')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { Readable, Transform } = require('node:stream')
const { pipeline } = require('node:stream/promises')
const { gunzipSync, inflateRawSync } = require('node:zlib')

const REPOSITORY_ROOT = path.resolve(__dirname, '..')
const BINARY_DIRECTORY = path.join(REPOSITORY_ROOT, 'src-tauri', 'binaries')
const TRACKED_MANIFEST_PATH = path.join(BINARY_DIRECTORY, 'manifest.json')
const TECTONIC_VERSION = '0.17.0'
const RELEASE_TAG = `tectonic@${TECTONIC_VERSION}`
const RELEASE_API_URL =
  'https://api.github.com/repos/tectonic-typesetting/tectonic/releases/tags/tectonic%400.17.0'
const RELEASE_DOWNLOAD_ROOT =
  'https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%400.17.0'
const TEMPORARY_DIRECTORY_PREFIX = 'textex-tectonic-'

const ASSETS = Object.freeze({
  'x86_64-unknown-linux-musl': Object.freeze({
    name: 'tectonic-0.17.0-x86_64-unknown-linux-musl.tar.gz',
    url: `${RELEASE_DOWNLOAD_ROOT}/tectonic-0.17.0-x86_64-unknown-linux-musl.tar.gz`,
    sha256: '8533d07f9ccbd7a65824b9e0459041bca34af1eb33daba48f59215593753a3b7',
    size: 10_151_914,
    archiveType: 'tar.gz',
    executableName: 'tectonic'
  }),
  'x86_64-pc-windows-msvc': Object.freeze({
    name: 'tectonic-0.17.0-x86_64-pc-windows-msvc.zip',
    url: `${RELEASE_DOWNLOAD_ROOT}/tectonic-0.17.0-x86_64-pc-windows-msvc.zip`,
    sha256: 'f61ce51f0b0ade1015b7de7ef368541c5424e9756ecbd0d7af97d6d48030845f',
    size: 21_060_223,
    archiveType: 'zip',
    executableName: 'tectonic.exe'
  }),
  'aarch64-apple-darwin': Object.freeze({
    name: 'tectonic-0.17.0-aarch64-apple-darwin.tar.gz',
    url: `${RELEASE_DOWNLOAD_ROOT}/tectonic-0.17.0-aarch64-apple-darwin.tar.gz`,
    sha256: 'a3f1cac7c5678f01661a92212f58480ae3b0634115d880dbc59e2953ded45667',
    size: 21_704_674,
    archiveType: 'tar.gz',
    executableName: 'tectonic'
  })
})

const TARGETS = Object.freeze({
  'x86_64-unknown-linux-gnu': Object.freeze({
    assetTargets: ['x86_64-unknown-linux-musl'],
    format: 'elf-x86_64'
  }),
  'x86_64-unknown-linux-musl': Object.freeze({
    assetTargets: ['x86_64-unknown-linux-musl'],
    format: 'elf-x86_64'
  }),
  'x86_64-pc-windows-msvc': Object.freeze({
    assetTargets: ['x86_64-pc-windows-msvc'],
    format: 'pe-x86_64'
  }),
  'aarch64-apple-darwin': Object.freeze({
    assetTargets: ['aarch64-apple-darwin'],
    format: 'mach-arm64'
  })
})

function manifestAsset(asset) {
  return {
    name: asset.name,
    url: asset.url,
    sha256: asset.sha256,
    size: asset.size
  }
}

function expectedTrackedManifest() {
  return {
    schemaVersion: 1,
    tectonicVersion: TECTONIC_VERSION,
    releaseTag: RELEASE_TAG,
    digestSource: RELEASE_API_URL,
    assets: Object.fromEntries(
      Object.entries(ASSETS).map(([target, asset]) => [target, manifestAsset(asset)])
    )
  }
}

function usage() {
  return `Usage: node scripts/setup-tauri-sidecars.js [options]

Download and verify the mandatory Tectonic ${TECTONIC_VERSION} sidecar for Tauri.

Options:
  --target <triple>  Install/check a specific Tauri target triple.
  --check            Verify an existing staged sidecar without network access.
  -h, --help         Show this help.

Supported targets:
  ${Object.keys(TARGETS).join('\n  ')}
`
}

function parseArguments(argv) {
  let target = null
  let check = false

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--check') {
      check = true
      continue
    }
    if (argument === '--help' || argument === '-h') {
      return { help: true, check: false, target: null }
    }
    if (argument === '--target') {
      index += 1
      if (index >= argv.length || argv[index].startsWith('-')) {
        throw new Error('--target requires a target triple')
      }
      target = argv[index]
      continue
    }
    if (argument.startsWith('--target=')) {
      target = argument.slice('--target='.length)
      if (!target) throw new Error('--target requires a target triple')
      continue
    }
    throw new Error(`Unknown argument: ${argument}`)
  }

  return { help: false, check, target: target ?? detectHostTarget() }
}

function detectHostTarget() {
  if (process.platform === 'linux' && process.arch === 'x64') {
    // Tauri itself normally uses the GNU target. The official Tectonic sidecar
    // is static musl, but its staged filename must match the Tauri build target.
    return 'x86_64-unknown-linux-gnu'
  }
  if (process.platform === 'win32' && process.arch === 'x64') {
    return 'x86_64-pc-windows-msvc'
  }
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    return 'aarch64-apple-darwin'
  }
  throw new Error(
    `No Tectonic ${TECTONIC_VERSION} asset is configured for host ${process.platform}/${process.arch}; pass --target explicitly if preparing another supported target`
  )
}

function targetSpec(target) {
  const spec = TARGETS[target]
  if (!spec) {
    throw new Error(
      `Unsupported target ${target}. Supported targets: ${Object.keys(TARGETS).join(', ')}`
    )
  }
  return spec
}

function sidecarFilename(target) {
  const extension = target.includes('windows') ? '.exe' : ''
  return `tectonic-${target}${extension}`
}

function sidecarPath(target) {
  return path.join(BINARY_DIRECTORY, sidecarFilename(target))
}

function provenancePath(target) {
  return `${sidecarPath(target)}.provenance.json`
}

async function validateTrackedManifest() {
  let actual
  try {
    actual = JSON.parse(await fs.readFile(TRACKED_MANIFEST_PATH, 'utf8'))
  } catch (error) {
    throw new Error(
      `Cannot read tracked sidecar manifest at ${TRACKED_MANIFEST_PATH}: ${message(error)}`
    )
  }
  const expected = expectedTrackedManifest()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Tracked sidecar manifest does not match the immutable asset table in ${path.relative(REPOSITORY_ROOT, __filename)}`
    )
  }
}

async function downloadAsset(asset, temporaryDirectory) {
  const archivePath = path.join(temporaryDirectory, asset.name)
  console.log(`Downloading ${asset.url}`)

  const response = await fetch(asset.url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'TextEx-Tauri-Sidecar-Setup' }
  })
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status} ${response.statusText}) for ${asset.url}`)
  }

  const digest = createHash('sha256')
  let downloadedBytes = 0
  const digestStream = new Transform({
    transform(chunk, _encoding, callback) {
      downloadedBytes += chunk.length
      digest.update(chunk)
      callback(null, chunk)
    }
  })

  await pipeline(
    Readable.fromWeb(response.body),
    digestStream,
    createWriteStream(archivePath, { flags: 'wx', mode: 0o600 })
  )

  const actualDigest = digest.digest('hex')
  if (downloadedBytes !== asset.size) {
    throw new Error(
      `Unexpected size for ${asset.name}: expected ${asset.size}, downloaded ${downloadedBytes}`
    )
  }
  if (actualDigest !== asset.sha256) {
    throw new Error(
      `SHA-256 mismatch for ${asset.name}: expected ${asset.sha256}, received ${actualDigest}`
    )
  }
  console.log(`Verified ${asset.name} (${downloadedBytes} bytes, sha256:${actualDigest})`)
  return archivePath
}

async function extractExecutable(archivePath, asset) {
  const archive = await fs.readFile(archivePath)
  if (asset.archiveType === 'tar.gz') {
    return extractFromTar(gunzipSync(archive), asset.executableName)
  }
  if (asset.archiveType === 'zip') {
    return extractFromZip(archive, asset.executableName)
  }
  throw new Error(`Unsupported archive type ${asset.archiveType}`)
}

function extractFromTar(tar, executableName) {
  let offset = 0
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) break

    const name = readTarString(header, 0, 100)
    const prefix = readTarString(header, 345, 155)
    const fullName = prefix ? `${prefix}/${name}` : name
    const sizeField = readTarString(header, 124, 12).trim()
    const size = sizeField ? Number.parseInt(sizeField, 8) : 0
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error(`Invalid tar entry size for ${fullName}`)
    }

    const dataStart = offset + 512
    const dataEnd = dataStart + size
    if (dataEnd > tar.length) throw new Error(`Truncated tar entry ${fullName}`)
    const type = header[156]
    if ((type === 0 || type === 48) && archiveBasename(fullName) === executableName) {
      return Buffer.from(tar.subarray(dataStart, dataEnd))
    }
    offset = dataStart + Math.ceil(size / 512) * 512
  }
  throw new Error(`Executable ${executableName} was not found in tar archive`)
}

function readTarString(buffer, start, length) {
  const slice = buffer.subarray(start, start + length)
  const terminator = slice.indexOf(0)
  return slice.subarray(0, terminator === -1 ? slice.length : terminator).toString('utf8')
}

function extractFromZip(zip, executableName) {
  const endOffset = findZipEndOfCentralDirectory(zip)
  const entryCount = zip.readUInt16LE(endOffset + 10)
  let offset = zip.readUInt32LE(endOffset + 16)

  for (let index = 0; index < entryCount; index += 1) {
    assertSignature(zip, offset, 0x02014b50, 'central directory')
    const method = zip.readUInt16LE(offset + 10)
    const compressedSize = zip.readUInt32LE(offset + 20)
    const uncompressedSize = zip.readUInt32LE(offset + 24)
    const filenameLength = zip.readUInt16LE(offset + 28)
    const extraLength = zip.readUInt16LE(offset + 30)
    const commentLength = zip.readUInt16LE(offset + 32)
    const localOffset = zip.readUInt32LE(offset + 42)
    const filename = zip.subarray(offset + 46, offset + 46 + filenameLength).toString('utf8')

    if (archiveBasename(filename) === executableName) {
      assertSignature(zip, localOffset, 0x04034b50, 'local file header')
      const localFilenameLength = zip.readUInt16LE(localOffset + 26)
      const localExtraLength = zip.readUInt16LE(localOffset + 28)
      const dataStart = localOffset + 30 + localFilenameLength + localExtraLength
      const dataEnd = dataStart + compressedSize
      if (dataEnd > zip.length) throw new Error(`Truncated zip entry ${filename}`)
      const compressed = zip.subarray(dataStart, dataEnd)
      const executable =
        method === 0
          ? Buffer.from(compressed)
          : method === 8
            ? inflateRawSync(compressed)
            : (() => {
                throw new Error(`Unsupported zip compression method ${method} for ${filename}`)
              })()
      if (executable.length !== uncompressedSize) {
        throw new Error(
          `Unexpected extracted size for ${filename}: expected ${uncompressedSize}, received ${executable.length}`
        )
      }
      return executable
    }
    offset += 46 + filenameLength + extraLength + commentLength
  }
  throw new Error(`Executable ${executableName} was not found in zip archive`)
}

function findZipEndOfCentralDirectory(zip) {
  const minimumOffset = Math.max(0, zip.length - 65_557)
  for (let offset = zip.length - 22; offset >= minimumOffset; offset -= 1) {
    if (zip.readUInt32LE(offset) === 0x06054b50) return offset
  }
  throw new Error('Zip end-of-central-directory record was not found')
}

function assertSignature(buffer, offset, expected, label) {
  if (offset < 0 || offset + 4 > buffer.length || buffer.readUInt32LE(offset) !== expected) {
    throw new Error(`Invalid zip ${label} at offset ${offset}`)
  }
}

function archiveBasename(filename) {
  return filename.replaceAll('\\', '/').split('/').filter(Boolean).at(-1) ?? ''
}

async function prepareBinary(spec, temporaryDirectory) {
  const [download] = await Promise.all(
    spec.assetTargets.map(async (assetTarget) => {
      const asset = ASSETS[assetTarget]
      const archivePath = await downloadAsset(asset, temporaryDirectory)
      const executable = await extractExecutable(archivePath, asset)
      validateBinaryBytes(executable, assetBinaryFormat(assetTarget))
      return { assetTarget, executable }
    })
  )
  return download.executable
}

function assetBinaryFormat(assetTarget) {
  switch (assetTarget) {
    case 'x86_64-unknown-linux-musl':
      return 'elf-x86_64'
    case 'x86_64-pc-windows-msvc':
      return 'pe-x86_64'
    case 'aarch64-apple-darwin':
      return 'mach-arm64'
    default:
      throw new Error(`No binary validator is configured for asset ${assetTarget}`)
  }
}

function validateBinaryBytes(binary, format) {
  if (binary.length < 1_024) throw new Error(`Extracted Tectonic binary is unexpectedly small`)

  if (format === 'elf-x86_64') {
    if (!binary.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
      throw new Error('Expected an ELF Tectonic binary')
    }
    if (binary.readUInt16LE(18) !== 0x3e) throw new Error('Expected an x86_64 ELF binary')
    return
  }

  if (format === 'pe-x86_64') {
    if (binary[0] !== 0x4d || binary[1] !== 0x5a) throw new Error('Expected a PE Tectonic binary')
    const peOffset = binary.readUInt32LE(0x3c)
    if (peOffset + 6 > binary.length || binary.readUInt32LE(peOffset) !== 0x00004550) {
      throw new Error('Invalid PE header')
    }
    if (binary.readUInt16LE(peOffset + 4) !== 0x8664) {
      throw new Error('Expected an x86_64 Windows binary')
    }
    return
  }

  if (format === 'mach-arm64') {
    if (binary.readUInt32LE(0) !== 0xfeedfacf) throw new Error('Expected a 64-bit Mach-O binary')
    if (binary.readUInt32LE(4) !== 0x0100000c) {
      throw new Error(`Unexpected Mach-O CPU type for ${format}`)
    }
    return
  }

  throw new Error(`No binary validator is configured for ${format}`)
}

function canExecuteTarget(target) {
  if (process.platform === 'linux' && process.arch === 'x64') {
    return target === 'x86_64-unknown-linux-gnu' || target === 'x86_64-unknown-linux-musl'
  }
  if (process.platform === 'win32' && process.arch === 'x64') {
    return target === 'x86_64-pc-windows-msvc'
  }
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    return target === 'aarch64-apple-darwin'
  }
  return false
}

async function verifyVersion(binaryPath, target) {
  if (!canExecuteTarget(target)) {
    console.log(
      `Skipping --version for cross-target ${target}; file format and provenance were verified`
    )
    return null
  }
  const result = await runCommand(binaryPath, ['--version'], { timeoutMs: 30_000 })
  const output = `${result.stdout}\n${result.stderr}`.trim()
  if (!new RegExp(`tectonic\\s+${TECTONIC_VERSION.replaceAll('.', '\\.')}\\b`, 'i').test(output)) {
    throw new Error(`Unexpected Tectonic version output from ${binaryPath}: ${output || '<empty>'}`)
  }
  return output.split(/\r?\n/).find(Boolean) ?? output
}

function runCommand(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 60_000
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error(`${command} timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(new Error(`Failed to run ${command}: ${message(error)}`))
    })
    child.on('close', (code, signal) => {
      clearTimeout(timeout)
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        reject(
          new Error(
            `${command} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}\n${stderr || stdout}`
          )
        )
      }
    })
  })
}

async function sha256File(filePath) {
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) digest.update(chunk)
  return digest.digest('hex')
}

function provenanceFor(target, binarySha256, binarySize) {
  const spec = targetSpec(target)
  return {
    schemaVersion: 1,
    tectonicVersion: TECTONIC_VERSION,
    target,
    sourceAssets: spec.assetTargets.map((assetTarget) => ({
      target: assetTarget,
      ...manifestAsset(ASSETS[assetTarget])
    })),
    binarySha256,
    binarySize
  }
}

async function installTarget(target) {
  const spec = targetSpec(target)
  await fs.mkdir(BINARY_DIRECTORY, { recursive: true })

  try {
    await checkInstalledTarget(target)
    console.log(`Reusing verified ${path.relative(REPOSITORY_ROOT, sidecarPath(target))}`)
    return
  } catch (error) {
    console.log(`Preparing ${target}: ${message(error)}`)
  }

  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), TEMPORARY_DIRECTORY_PREFIX))

  try {
    const binary = await prepareBinary(spec, temporaryDirectory)
    validateBinaryBytes(binary, spec.format)
    const binarySha256 = createHash('sha256').update(binary).digest('hex')
    const provenance = provenanceFor(target, binarySha256, binary.length)
    const token = `${process.pid}-${randomBytes(6).toString('hex')}`
    const extension = target.includes('windows') ? '.exe' : ''
    const stagedBinary = path.join(BINARY_DIRECTORY, `.tectonic-${target}-${token}.tmp${extension}`)
    const stagedProvenance = path.join(
      BINARY_DIRECTORY,
      `.tectonic-${target}-${token}.provenance.tmp`
    )

    await fs.writeFile(stagedBinary, binary, { mode: target.includes('windows') ? 0o644 : 0o755 })
    if (!target.includes('windows')) await fs.chmod(stagedBinary, 0o755)
    await verifyVersion(stagedBinary, target)
    await fs.writeFile(stagedProvenance, `${JSON.stringify(provenance, null, 2)}\n`, {
      mode: 0o644
    })

    await replaceFileAtomically(stagedBinary, sidecarPath(target))
    await replaceFileAtomically(stagedProvenance, provenancePath(target))
    await checkInstalledTarget(target)
    console.log(`Installed ${path.relative(REPOSITORY_ROOT, sidecarPath(target))}`)
  } finally {
    await removeTemporaryDirectory(temporaryDirectory)
  }
}

async function replaceFileAtomically(source, destination) {
  try {
    await fs.rename(source, destination)
    return
  } catch (error) {
    if (!['EEXIST', 'EPERM'].includes(error?.code)) throw error
  }

  const backup = `${destination}.backup-${process.pid}-${randomBytes(4).toString('hex')}`
  let movedExisting = false
  try {
    await fs.rename(destination, backup)
    movedExisting = true
    await fs.rename(source, destination)
    await fs.rm(backup, { force: true })
  } catch (error) {
    if (movedExisting) {
      try {
        await fs.rename(backup, destination)
      } catch {
        // Preserve the original error. The backup path is included for manual recovery.
        throw new Error(`${message(error)}; previous sidecar remains at ${backup}`)
      }
    }
    throw error
  }
}

async function checkInstalledTarget(target) {
  const spec = targetSpec(target)
  const binaryPath = sidecarPath(target)
  const metadataPath = provenancePath(target)

  let stat
  let binary
  let provenance
  try {
    ;[stat, binary, provenance] = await Promise.all([
      fs.stat(binaryPath),
      fs.readFile(binaryPath),
      fs.readFile(metadataPath, 'utf8').then(JSON.parse)
    ])
  } catch (error) {
    throw new Error(
      `Missing or invalid staged Tectonic for ${target}; run "node scripts/setup-tauri-sidecars.js --target ${target}": ${message(error)}`
    )
  }

  if (!stat.isFile()) throw new Error(`${binaryPath} is not a regular file`)
  if (!target.includes('windows') && (stat.mode & 0o111) === 0) {
    throw new Error(`${binaryPath} is not executable`)
  }
  validateBinaryBytes(binary, spec.format)

  const actualSha256 = await sha256File(binaryPath)
  const expectedProvenance = provenanceFor(target, actualSha256, stat.size)
  if (JSON.stringify(provenance) !== JSON.stringify(expectedProvenance)) {
    throw new Error(
      `Provenance mismatch for ${binaryPath}; rerun setup instead of using an unverified sidecar`
    )
  }
  const versionOutput = await verifyVersion(binaryPath, target)
  console.log(
    `Checked ${path.relative(REPOSITORY_ROOT, binaryPath)} (${stat.size} bytes, sha256:${actualSha256}${versionOutput ? `, ${versionOutput}` : ''})`
  )
}

async function removeTemporaryDirectory(directory) {
  const resolvedDirectory = path.resolve(directory)
  const resolvedTemporaryRoot = path.resolve(os.tmpdir())
  if (
    path.dirname(resolvedDirectory) !== resolvedTemporaryRoot ||
    !path.basename(resolvedDirectory).startsWith(TEMPORARY_DIRECTORY_PREFIX)
  ) {
    throw new Error(`Refusing to remove unexpected temporary directory ${resolvedDirectory}`)
  }
  await fs.rm(resolvedDirectory, { recursive: true, force: true })
}

function message(error) {
  return error instanceof Error ? error.message : String(error)
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(usage())
    return
  }

  await validateTrackedManifest()
  targetSpec(options.target)
  if (options.check) {
    await checkInstalledTarget(options.target)
  } else {
    await installTarget(options.target)
  }
}

main().catch((error) => {
  console.error(`Tauri sidecar setup failed: ${message(error)}`)
  process.exitCode = 1
})
