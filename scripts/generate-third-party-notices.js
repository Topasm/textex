#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const resourcesLicensesDir = path.join(rootDir, 'resources', 'licenses')
const outputPath = path.join(resourcesLicensesDir, 'THIRD-PARTY-NOTICES.txt')
const electronChromiumLicensesPath = path.join(
  resourcesLicensesDir,
  'ELECTRON-LICENSES.chromium.html'
)

const packageJson = readJson(path.join(rootDir, 'package.json'))

const bundledPackageNames = [
  ...Object.keys(packageJson.dependencies || {}),
  'dictionary-en',
  'electron'
]

const packageNames = [...new Set(bundledPackageNames)].sort((left, right) => left.localeCompare(right))

const sections = []

sections.push('TextEx Third-Party Notices')
sections.push('')
sections.push('This file covers third-party packages and resources bundled with TextEx.')
sections.push('It is generated from package metadata and bundled notice files.')
sections.push('')
sections.push('Additional bundled notice files:')
sections.push('- TEXLAB-NOTICE.txt')
sections.push('- TEXLAB-GPL-3.0.txt')
sections.push('- ELECTRON-LICENSES.chromium.html')
sections.push('')
sections.push(
  'Pandoc is not bundled by TextEx. If a user installs Pandoc separately, that copy is governed by its own license terms.'
)
sections.push('')

appendFileSection(
  sections,
  'Bundled Notice',
  'TexLab',
  path.join(resourcesLicensesDir, 'TEXLAB-NOTICE.txt')
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
sections.push('TexLab GPL-3.0 full license text is bundled separately in TEXLAB-GPL-3.0.txt.')
sections.push(
  'Electron Chromium and other embedded runtime notices are bundled separately in ELECTRON-LICENSES.chromium.html.'
)
sections.push('')

fs.mkdirSync(resourcesLicensesDir, { recursive: true })
fs.writeFileSync(outputPath, `${sections.join('\n')}\n`, 'utf8')

const chromiumNoticesSource = path.join(
  rootDir,
  'node_modules',
  'electron',
  'dist',
  'LICENSES.chromium.html'
)
if (fs.existsSync(chromiumNoticesSource)) {
  fs.copyFileSync(chromiumNoticesSource, electronChromiumLicensesPath)
}

function divider(char) {
  return char.repeat(80)
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8')
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
    .filter(
      (entry) =>
        entry.isFile() && /^(licen[sc]e|copying|notice)(\..+)?$/i.test(entry.name)
    )
    .map((entry) => path.join(packageDir, entry.name))
    .sort((left, right) => left.localeCompare(right))
}
