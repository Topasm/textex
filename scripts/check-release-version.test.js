const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const test = require('node:test')
const { checkReleaseVersion, collectReleaseVersions } = require('./check-release-version')

const VERSION = '1.2.3'
const scriptPath = path.join(__dirname, 'check-release-version.js')

function fixture(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'textex-release-version-'))
  const versions = {
    packageJson: VERSION,
    packageLockTopLevel: VERSION,
    packageLockRoot: VERSION,
    cargoToml: VERSION,
    cargoLock: VERSION,
    cli: VERSION,
    mcp: VERSION,
    settings: VERSION,
    ...overrides
  }

  const write = (relativePath, contents) => {
    const destination = path.join(root, relativePath)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.writeFileSync(destination, contents)
  }

  write('package.json', `${JSON.stringify({ name: 'textex', version: versions.packageJson })}\n`)
  write(
    'package-lock.json',
    `${JSON.stringify({
      name: 'textex',
      version: versions.packageLockTopLevel,
      lockfileVersion: 3,
      packages: { '': { name: 'textex', version: versions.packageLockRoot } }
    })}\n`
  )
  write(
    'src-tauri/Cargo.toml',
    `[package]\nname = "textex-tauri"\nversion = "${versions.cargoToml}"\n\n[dependencies]\nserde = "1"\n`
  )
  write(
    'src-tauri/Cargo.lock',
    `version = 4\n\n[[package]]\nname = "serde"\nversion = "1.0.0"\n\n[[package]]\nname = "textex-tauri"\nversion = "${versions.cargoLock}"\ndependencies = [\n "serde",\n]\n`
  )
  write('src/cli/index.ts', `program.version('${versions.cli}')\n`)
  write(
    'src/mcp/server.ts',
    `const server = new McpServer({ name: 'textex', version: '${versions.mcp}' })\n`
  )
  write(
    'src/renderer/components/SettingsModal.tsx',
    `export const SettingsModal = () => <span>TextEx v${versions.settings}</span>\n`
  )

  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) }
}

test('accepts all release version declarations when they are synchronized', () => {
  const project = fixture()
  try {
    const result = checkReleaseVersion(project.root)
    assert.equal(result.version, VERSION)
    assert.equal(result.declarations.length, 8)
    assert.deepEqual(
      result.declarations.map(({ version }) => version),
      Array(8).fill(VERSION)
    )
  } finally {
    project.cleanup()
  }
})

test('rejects drift in every duplicated release version declaration', async (t) => {
  const declarations = [
    ['packageJson', 'package.json version'],
    ['packageLockTopLevel', 'package-lock.json top-level version'],
    ['packageLockRoot', 'package-lock.json root package version'],
    ['cargoToml', 'src-tauri/Cargo.toml [package] version'],
    ['cargoLock', 'src-tauri/Cargo.lock textex-tauri version'],
    ['cli', 'src/cli/index.ts program version'],
    ['mcp', 'src/mcp/server.ts server version'],
    ['settings', 'src/renderer/components/SettingsModal.tsx displayed version']
  ]

  for (const [key, location] of declarations) {
    await t.test(location, () => {
      const project = fixture({ [key]: '9.9.9' })
      try {
        assert.throws(
          () => checkReleaseVersion(project.root),
          (error) =>
            error instanceof Error &&
            error.message.includes('Release versions do not match package.json') &&
            error.message.includes(`${location}: 9.9.9`)
        )
      } finally {
        project.cleanup()
      }
    })
  }
})

test('fails closed when a declaration is ambiguous', () => {
  const project = fixture()
  try {
    fs.appendFileSync(path.join(project.root, 'src/cli/index.ts'), "program.version('1.2.3')\n")
    assert.throws(
      () => collectReleaseVersions(project.root),
      /Expected exactly one release version at src\/cli\/index\.ts program version, found 2/
    )
  } finally {
    project.cleanup()
  }
})

test('command exits non-zero and reports locations when versions drift', () => {
  const project = fixture({ settings: '2.0.0' })
  try {
    const result = spawnSync(process.execPath, [scriptPath, project.root], { encoding: 'utf8' })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Release versions do not match package\.json/)
    assert.match(result.stderr, /SettingsModal\.tsx displayed version: 2\.0\.0/)
  } finally {
    project.cleanup()
  }
})
