#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')

function readText(projectRoot, relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
}

function readJson(projectRoot, relativePath) {
  return JSON.parse(readText(projectRoot, relativePath))
}

function requireVersion(value, location) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing release version at ${location}`)
  }
  return value
}

function singleCapturedVersion(contents, pattern, location, captureIndex = 1) {
  const matches = [...contents.matchAll(pattern)]
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one release version at ${location}, found ${matches.length}`)
  }
  return requireVersion(matches[0][captureIndex], location)
}

function tomlSection(contents, sectionName, location) {
  const headingPattern = new RegExp(`^\\[${sectionName}\\]\\s*$`, 'm')
  const heading = headingPattern.exec(contents)
  if (!heading || heading.index === undefined) {
    throw new Error(`Missing [${sectionName}] section at ${location}`)
  }

  const sectionStart = heading.index + heading[0].length
  const remainder = contents.slice(sectionStart)
  const nextHeading = remainder.search(/^\[/m)
  return nextHeading === -1 ? remainder : remainder.slice(0, nextHeading)
}

function cargoLockPackage(contents, packageName, location) {
  const packages = contents.split(/\r?\n(?=\[\[package\]\]\s*(?:\r?\n|$))/).filter((entry) => {
    const name = /^name\s*=\s*"([^"]+)"\s*$/m.exec(entry)?.[1]
    return name === packageName
  })

  if (packages.length !== 1) {
    throw new Error(
      `Expected exactly one ${packageName} package at ${location}, found ${packages.length}`
    )
  }
  return packages[0]
}

function collectReleaseVersions(projectRoot = path.resolve(__dirname, '..')) {
  const packageJson = readJson(projectRoot, 'package.json')
  const packageLock = readJson(projectRoot, 'package-lock.json')
  const cargoTomlPath = 'src-tauri/Cargo.toml'
  const cargoLockPath = 'src-tauri/Cargo.lock'
  const cargoTomlPackage = tomlSection(
    readText(projectRoot, cargoTomlPath),
    'package',
    cargoTomlPath
  )
  const cargoLockPackageEntry = cargoLockPackage(
    readText(projectRoot, cargoLockPath),
    'textex-tauri',
    cargoLockPath
  )

  return [
    {
      location: 'package.json version',
      version: requireVersion(packageJson.version, 'package.json version')
    },
    {
      location: 'package-lock.json top-level version',
      version: requireVersion(packageLock.version, 'package-lock.json top-level version')
    },
    {
      location: 'package-lock.json root package version',
      version: requireVersion(
        packageLock.packages?.['']?.version,
        'package-lock.json root package version'
      )
    },
    {
      location: 'src-tauri/Cargo.toml [package] version',
      version: singleCapturedVersion(
        cargoTomlPackage,
        /^version\s*=\s*"([^"]+)"\s*$/gm,
        'src-tauri/Cargo.toml [package] version'
      )
    },
    {
      location: 'src-tauri/Cargo.lock textex-tauri version',
      version: singleCapturedVersion(
        cargoLockPackageEntry,
        /^version\s*=\s*"([^"]+)"\s*$/gm,
        'src-tauri/Cargo.lock textex-tauri version'
      )
    },
    {
      location: 'src/cli/index.ts program version',
      version: singleCapturedVersion(
        readText(projectRoot, 'src/cli/index.ts'),
        /\bprogram\.version\(\s*(['"])([^'"]+)\1\s*\)/g,
        'src/cli/index.ts program version',
        2
      )
    },
    {
      location: 'src/mcp/server.ts server version',
      version: singleCapturedVersion(
        readText(projectRoot, 'src/mcp/server.ts'),
        /\bversion:\s*(['"])([^'"]+)\1/g,
        'src/mcp/server.ts server version',
        2
      )
    },
    {
      location: 'src/renderer/components/SettingsModal.tsx displayed version',
      version: singleCapturedVersion(
        readText(projectRoot, 'src/renderer/components/SettingsModal.tsx'),
        /TextEx v([^<\s]+)/g,
        'src/renderer/components/SettingsModal.tsx displayed version'
      )
    }
  ]
}

function checkReleaseVersion(projectRoot = path.resolve(__dirname, '..')) {
  const declarations = collectReleaseVersions(projectRoot)
  const expectedVersion = declarations[0].version
  const mismatches = declarations.filter(({ version }) => version !== expectedVersion)

  if (mismatches.length > 0) {
    const details = declarations
      .map(({ location, version }) => `  - ${location}: ${version}`)
      .join('\n')
    throw new Error(`Release versions do not match package.json (${expectedVersion}):\n${details}`)
  }

  return { version: expectedVersion, declarations }
}

if (require.main === module) {
  const projectRoot = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, '..')
  try {
    const { version, declarations } = checkReleaseVersion(projectRoot)
    console.log(
      `Release version ${version} is synchronized across ${declarations.length} declarations.`
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

module.exports = { checkReleaseVersion, collectReleaseVersions }
