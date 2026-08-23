#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')

const rootDir = path.resolve(__dirname, '..')
const resourcesLicensesDir = path.join(rootDir, 'resources', 'licenses')
const outputPath = path.join(resourcesLicensesDir, 'THIRD-PARTY-NOTICES.txt')
const rustOutputPath = path.join(resourcesLicensesDir, 'RUST-THIRD-PARTY-NOTICES.txt')
const packageJson = readJson(path.join(rootDir, 'package.json'))

const bundledPackageNames = Object.keys(packageJson.dependencies || {})

const packageNames = [...new Set(bundledPackageNames)].sort((left, right) =>
  left.localeCompare(right)
)

const sections = []

sections.push('TextEx Third-Party Notices')
sections.push('')
sections.push('This file covers third-party packages and resources bundled with TextEx.')
sections.push('It is generated from package metadata and bundled notice files.')
sections.push('')
sections.push('Additional bundled notice files:')
sections.push('- TECTONIC-NOTICE.txt')
sections.push('- TECTONIC-MIT.txt')
sections.push('- RUST-THIRD-PARTY-NOTICES.txt')
sections.push('')
sections.push(
  'Pandoc is not bundled by TextEx. If a user installs Pandoc separately, that copy is governed by its own license terms.'
)
sections.push('')

appendFileSection(
  sections,
  'Bundled Notice',
  'Tectonic',
  path.join(resourcesLicensesDir, 'TECTONIC-NOTICE.txt')
)

for (const packageName of packageNames) {
  const packageDir = path.join(rootDir, 'node_modules', packageName)
  const manifestPath = path.join(packageDir, 'package.json')
  if (!fs.existsSync(manifestPath)) {
    continue
  }

  const manifest = readJson(manifestPath)
  const source = formatSource(manifest)
  const licenseValue = formatLicense(manifest.license || manifest.licenses)
  const licenseFiles = findLicenseFiles(packageDir)

  sections.push(divider('='))
  sections.push(`Package: ${manifest.name || packageName}`)
  sections.push(`Version: ${manifest.version || 'unknown'}`)
  sections.push(`License: ${licenseValue}`)
  sections.push(`Source: ${source}`)
  sections.push(divider('-'))

  if (licenseFiles.length === 0) {
    sections.push('No license file was found in the installed package contents.')
    sections.push('')
    continue
  }

  for (const licenseFile of licenseFiles) {
    sections.push(`File: ${path.relative(packageDir, licenseFile)}`)
    sections.push('')
    sections.push(readText(licenseFile).trimEnd())
    sections.push('')
  }
}

sections.push(divider('='))
sections.push('Reference')
sections.push(divider('-'))
sections.push('Tectonic MIT full license text is bundled separately in TECTONIC-MIT.txt.')
sections.push('Tauri/Rust dependency notices are bundled in RUST-THIRD-PARTY-NOTICES.txt.')
sections.push('')

fs.mkdirSync(resourcesLicensesDir, { recursive: true })
fs.writeFileSync(outputPath, `${sections.join('\n').trimEnd()}\n`, 'utf8')
generateRustNotices(rustOutputPath)

function divider(char) {
  return char.repeat(80)
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function readText(filePath) {
  return fs
    .readFileSync(filePath, 'utf8')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
}

function formatSource(manifest) {
  if (typeof manifest.homepage === 'string' && manifest.homepage.length > 0) {
    return manifest.homepage
  }

  const repository = manifest.repository
  if (typeof repository === 'string' && repository.length > 0) {
    return repository
  }

  if (repository && typeof repository.url === 'string' && repository.url.length > 0) {
    return repository.url
  }

  return 'unknown'
}

function formatLicense(license) {
  if (typeof license === 'string' && license.length > 0) {
    return license
  }

  if (Array.isArray(license)) {
    return license.map((entry) => formatLicense(entry)).join(', ')
  }

  if (license && typeof license.type === 'string') {
    return license.type
  }

  return 'UNKNOWN'
}

function appendFileSection(sectionsList, type, name, filePath) {
  if (!fs.existsSync(filePath)) {
    return
  }

  sectionsList.push(divider('='))
  sectionsList.push(`${type}: ${name}`)
  sectionsList.push(divider('-'))
  sectionsList.push(readText(filePath).trimEnd())
  sectionsList.push('')
}

function findLicenseFiles(packageDir) {
  return fs
    .readdirSync(packageDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^(licen[sc]e|copying|notice)(\..+)?$/i.test(entry.name))
    .map((entry) => path.join(packageDir, entry.name))
    .sort((left, right) => left.localeCompare(right))
}

function generateRustNotices(destination) {
  const manifestPath = path.join(rootDir, 'src-tauri', 'Cargo.toml')
  if (!fs.existsSync(manifestPath)) {
    return
  }

  const metadata = JSON.parse(
    execFileSync(
      'cargo',
      ['metadata', '--format-version', '1', '--locked', '--manifest-path', manifestPath],
      {
        cwd: rootDir,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024
      }
    )
  )
  const packageById = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]))
  const nodeById = new Map((metadata.resolve?.nodes || []).map((node) => [node.id, node]))
  const workspaceIds = new Set(metadata.workspace_members || [])
  const queue = [...workspaceIds]
  const includedIds = new Set()

  while (queue.length > 0) {
    const packageId = queue.shift()
    if (!packageId || includedIds.has(packageId)) continue
    includedIds.add(packageId)
    const node = nodeById.get(packageId)
    for (const dependency of node?.deps || []) {
      const isRuntimeOrBuildDependency = (dependency.dep_kinds || []).some(
        (kind) => kind.kind === null || kind.kind === 'build'
      )
      if (isRuntimeOrBuildDependency) queue.push(dependency.pkg)
    }
  }

  const packages = [...includedIds]
    .filter((packageId) => !workspaceIds.has(packageId))
    .map((packageId) => packageById.get(packageId))
    .filter(Boolean)
    .sort((left, right) =>
      `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`)
    )

  const rustSections = [
    'TextEx Tauri/Rust Third-Party Notices',
    '',
    'Generated from the locked Cargo dependency graph used by src-tauri.',
    'Development-only dependencies are excluded; runtime and build dependencies are included.',
    '',
    divider('='),
    'Packages',
    divider('-')
  ]
  const licenseGroups = new Map()

  for (const pkg of packages) {
    const source = pkg.repository || pkg.homepage || pkg.source || 'unknown'
    rustSections.push(`${pkg.name} ${pkg.version} | ${pkg.license || 'UNKNOWN'} | ${source}`)

    const packageDir = path.dirname(pkg.manifest_path)
    for (const licenseFile of findLicenseFiles(packageDir)) {
      const contents = readText(licenseFile).trimEnd()
      const digest = crypto.createHash('sha256').update(contents).digest('hex')
      const existing = licenseGroups.get(digest)
      const owner = `${pkg.name} ${pkg.version} (${path.basename(licenseFile)})`
      if (existing) {
        existing.owners.push(owner)
      } else {
        licenseGroups.set(digest, { contents, owners: [owner] })
      }
    }
  }

  for (const group of [...licenseGroups.values()].sort((left, right) =>
    left.owners[0].localeCompare(right.owners[0])
  )) {
    rustSections.push('')
    rustSections.push(divider('='))
    rustSections.push('License text used by:')
    for (const owner of group.owners.sort((left, right) => left.localeCompare(right))) {
      rustSections.push(`- ${owner}`)
    }
    rustSections.push(divider('-'))
    rustSections.push(group.contents)
  }

  fs.writeFileSync(destination, `${rustSections.join('\n').trimEnd()}\n`, 'utf8')
}
