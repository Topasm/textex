const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const root = path.resolve(__dirname, '..')
const workflow = fs.readFileSync(path.join(root, '.github/workflows/build.yml'), 'utf8')
const minisignInstaller = fs.readFileSync(
  path.join(root, 'scripts/install-minisign-linux.sh'),
  'utf8'
)
const tauriConfig = JSON.parse(
  fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8')
)

function matrixEntry(platform) {
  const marker = `platform: ${platform}`
  const markerIndex = workflow.indexOf(marker)
  assert.notEqual(markerIndex, -1, `expected ${platform} in build matrix`)
  const entryStart = workflow.lastIndexOf('\n          - os:', markerIndex)
  const nextEntry = workflow.indexOf('\n          - os:', markerIndex)
  return workflow.slice(entryStart, nextEntry === -1 ? workflow.length : nextEntry)
}

test('macOS matrix pins native runner architectures and verifies them at runtime', () => {
  assert.match(matrixEntry('mac-arm64'), /- os: macos-15\n/)
  assert.match(matrixEntry('mac-x64'), /- os: macos-15-intel\n/)
  assert.match(
    workflow,
    /matrix\.platform \}\}" == "mac-arm64"[\s\S]*uname -m\)" = "arm64"[\s\S]*matrix\.platform \}\}" == "mac-x64"[\s\S]*uname -m\)" = "x86_64"/
  )
})

test('tag preflight requires a successful main push workflow for the exact commit', () => {
  assert.match(workflow, /permissions:\n  actions: read\n  contents: read/)
  assert.match(
    workflow,
    /release-preflight:[\s\S]*Verify synchronized release version declarations[\s\S]*npm run check:release-version/
  )
  assert.match(
    workflow,
    /actions\/workflows\/build\.yml\/runs[\s\S]*-f branch=main[\s\S]*-f event=push[\s\S]*-f status=success[\s\S]*-f head_sha="\$GITHUB_SHA"[\s\S]*test "\$successful_main_runs" -ge 1/
  )
})

test('workflow actions are pinned to immutable commit SHAs', () => {
  const actionReferences = [...workflow.matchAll(/uses:\s+([^\s#]+)/g)].map((match) => match[1])
  assert.ok(actionReferences.length > 0)
  for (const reference of actionReferences) {
    assert.match(reference, /^[^@\s]+@[0-9a-f]{40}$/)
  }
})

test('Rust caches are profile, target, toolchain, lockfile, and release scoped', () => {
  const cacheReferences = [
    ...workflow.matchAll(/uses:\s+(actions\/cache@[^\s#]+)(?:\s+#\s+v4\.2\.4)?/g)
  ].map((match) => match[1])
  assert.deepEqual(cacheReferences, [
    'actions/cache@0400d5f644dc74513175e3cd8d07132dd4860809',
    'actions/cache@0400d5f644dc74513175e3cd8d07132dd4860809'
  ])

  const cacheKeys = [...workflow.matchAll(/^\s+key:\s+(textex-.*cargo-v1-.*)$/gm)].map(
    (match) => match[1]
  )
  assert.equal(cacheKeys.length, 2)
  for (const key of cacheKeys) {
    assert.match(key, /startsWith\(github\.ref, 'refs\/tags\/v'\).*'release'.*'ci'/)
    assert.match(key, /\$\{\{ runner\.os \}\}/)
    assert.match(key, /hashFiles\('rust-toolchain\.toml'\)/)
    assert.match(key, /hashFiles\('src-tauri\/Cargo\.toml'\)/)
    assert.match(key, /hashFiles\('src-tauri\/Cargo\.lock'\)/)
  }
  assert.match(cacheKeys[0], /cargo-v1-test-.*x86_64-unknown-linux-gnu/)
  assert.match(cacheKeys[1], /cargo-v1-build-.*\$\{\{ matrix\.target \}\}/)

  const cacheSteps = [
    ...workflow.matchAll(
      /- name: Restore isolated Rust (?:test|release) cache\n([\s\S]*?)(?=\n\s+- name:)/g
    )
  ].map((match) => match[1])
  assert.equal(cacheSteps.length, 2)
  for (const cacheStep of cacheSteps) {
    const pathBlock = cacheStep.match(/path: \|\n([\s\S]*?)\n\s+key:/)?.[1]
    assert.ok(pathBlock, 'each Rust cache must declare explicit paths')
    const cachedPaths = pathBlock
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    for (const cachedPath of cachedPaths) {
      assert.match(
        cachedPath,
        /^(?:~\/\.cargo\/(?:registry|git)|src-tauri\/target\/debug\/(?:\.fingerprint|build|deps|incremental)|src-tauri\/target\/\$\{\{ matrix\.target \}\}\/release\/(?:\.fingerprint|build|deps|incremental))$/,
        `cache path must contain only reusable Cargo artifacts: ${cachedPath}`
      )
    }
  }
})

test('tagged macOS builds support an all-or-none Developer ID notarization upgrade', () => {
  for (const secret of [
    'APPLE_CERTIFICATE',
    'APPLE_CERTIFICATE_PASSWORD',
    'APPLE_NOTARY_API_KEY',
    'APPLE_NOTARY_KEY_ID',
    'APPLE_NOTARY_ISSUER_ID'
  ]) {
    assert.match(workflow, new RegExp(`secrets\\.${secret}`))
  }
  assert.match(workflow, /security import/)
  assert.match(workflow, /\/usr\/bin\/base64 -D/)
  assert.match(workflow, /Developer ID Application:/)
  assert.match(workflow, /configured=0/)
  assert.match(workflow, /if \[\[ "\$configured" -eq 0 \]\]/)
  assert.match(workflow, /if \[\[ "\$configured" -ne 5 \]\]/)
  assert.match(workflow, /APPLE_SIGNING_IDENTITY=-/)
  assert.match(workflow, /TEXTEX_MAC_NOTARIZATION=false/)
  assert.match(workflow, /TEXTEX_MAC_NOTARIZATION=true/)
  assert.match(workflow, /Signature=adhoc/)
  assert.match(workflow, /xcrun notarytool submit/)
  assert.match(workflow, /xcrun stapler staple/)
  assert.match(workflow, /xcrun stapler validate/)
  assert.match(workflow, /APPLE_API_ISSUER=/)
  assert.match(workflow, /APPLE_API_KEY=/)
  assert.match(workflow, /APPLE_API_KEY_PATH=/)
  assert.match(workflow, /tar -xzf "\$updater"/)
  assert.match(workflow, /xcrun stapler validate "\$updater_app"/)
  assert.equal(tauriConfig.bundle.macOS.hardenedRuntime, true)
  assert.equal(tauriConfig.bundle.macOS.entitlements, 'Entitlements.plist')
})

test('branch builds remain unsigned smoke builds', () => {
  assert.match(workflow, /name: Build unsigned Tauri package/)
  assert.match(workflow, /!startsWith\(github\.ref, 'refs\/tags\/v'\)/)
  assert.match(workflow, /APPLE_SIGNING_IDENTITY:.*'-'/)
})

test('tagged Windows and Linux packages receive platform verification', () => {
  assert.match(workflow, /secrets\.WINDOWS_CERTIFICATE/)
  assert.match(workflow, /secrets\.WINDOWS_CERTIFICATE_PASSWORD/)
  assert.match(workflow, /Import-PfxCertificate/)
  assert.match(workflow, /Get-AuthenticodeSignature/)
  assert.match(workflow, /Verify Linux updater signatures/)
  assert.match(workflow, /bash scripts\/install-minisign-linux\.sh/)
  assert.doesNotMatch(workflow, /apt-get install[^\n]*minisign/)
  assert.match(workflow, /command -v minisign/)
  assert.match(workflow, /minisign -Vm/)
  assert.match(workflow, /test "\$verified" -eq 2/)
})

test('Linux Minisign installation is version and digest pinned before extraction', () => {
  assert.match(minisignInstaller, /^set -euo pipefail$/m)
  assert.match(minisignInstaller, /^readonly MINISIGN_VERSION=0\.12$/m)
  assert.match(
    minisignInstaller,
    /^readonly MINISIGN_SHA256=9a599b48ba6eb7b1e80f12f36b94ceca7c00b7a5173c95c3efc88d9822957e73$/m
  )
  assert.match(
    minisignInstaller,
    /releases\/download\/\$\{MINISIGN_VERSION\}\/minisign-\$\{MINISIGN_VERSION\}-linux\.tar\.gz/
  )
  assert.match(minisignInstaller, /sha256sum --check --strict/)
  assert.ok(
    minisignInstaller.indexOf('sha256sum --check --strict') <
      minisignInstaller.indexOf('tar --extract'),
    'the pinned digest must be verified before archive extraction'
  )
  assert.match(minisignInstaller, /\$\{RUNNER_TEMP:\?RUNNER_TEMP is required\}/)
  assert.doesNotMatch(minisignInstaller, /releases\/latest|curl[^\n]*\|/)
})

test('PowerShell signing commands do not use POSIX continuations', () => {
  for (const command of ['ConvertTo-SecureString', 'Import-PfxCertificate', 'Remove-Item']) {
    const commandLines = workflow.split('\n').filter((line) => line.includes(command))
    assert.ok(commandLines.length > 0, `expected ${command} in workflow`)
    for (const line of commandLines) {
      assert.equal(
        line.trimEnd().endsWith('\\'),
        false,
        `${command} must not use a backslash continuation in pwsh`
      )
    }
  }
})
