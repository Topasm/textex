const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { generateReleaseFiles } = require('./generate-tauri-update-manifest')

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'textex-release-manifest-'))
  const artifactsDir = path.join(root, 'artifacts')
  const outputDir = path.join(root, 'release')
  const write = (platform, name, content = name) => {
    const directory = path.join(artifactsDir, `TextEx-Tauri-${platform}`)
    fs.mkdirSync(directory, { recursive: true })
    fs.writeFileSync(path.join(directory, name), content)
  }

  write('linux', 'TextEx.AppImage')
  write('linux', 'TextEx.AppImage.sig', 'linux-signature')
  write('linux', 'TextEx.deb')
  write('linux', 'TextEx.deb.sig', 'linux-deb-signature')
  write('mac-arm64', 'TextEx.dmg')
  write('mac-arm64', 'TextEx.app.tar.gz')
  write('mac-arm64', 'TextEx.app.tar.gz.sig', 'arm-signature')
  write('mac-x64', 'TextEx.dmg')
  write('mac-x64', 'TextEx.app.tar.gz')
  write('mac-x64', 'TextEx.app.tar.gz.sig', 'x64-signature')
  write('win', 'TextEx.exe')
  write('win', 'TextEx.exe.sig', 'windows-signature')

  return {
    root,
    artifactsDir,
    outputDir,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true })
  }
}

test('generates architecture-qualified artifacts and installer-aware updater targets', () => {
  const project = fixture()
  try {
    const manifest = generateReleaseFiles({
      artifactsDir: project.artifactsDir,
      outputDir: project.outputDir,
      version: '1.0.8',
      tag: 'v1.0.8',
      repository: 'Topasm/textex',
      publishedAt: new Date('2026-08-23T00:00:00.000Z')
    })

    assert.deepEqual(Object.keys(manifest.platforms), [
      'linux-x86_64',
      'linux-x86_64-appimage',
      'linux-x86_64-deb',
      'darwin-aarch64',
      'darwin-x86_64',
      'windows-x86_64'
    ])
    assert.equal(manifest.platforms['linux-x86_64'].signature, 'linux-signature')
    assert.equal(manifest.platforms['linux-x86_64-deb'].signature, 'linux-deb-signature')
    assert.equal(manifest.platforms['darwin-aarch64'].signature, 'arm-signature')
    assert.match(
      manifest.platforms['darwin-aarch64'].url,
      /mac-arm64-TextEx\.app\.tar\.gz$/
    )
    assert.match(manifest.platforms['darwin-x86_64'].url, /mac-x64-TextEx\.app\.tar\.gz$/)

    const releaseFiles = fs.readdirSync(project.outputDir).sort()
    assert.ok(releaseFiles.includes('mac-arm64-TextEx.dmg'))
    assert.ok(releaseFiles.includes('mac-x64-TextEx.dmg'))
    assert.ok(releaseFiles.includes('latest.json'))
    assert.ok(releaseFiles.includes('checksums.txt'))
    assert.match(
      fs.readFileSync(path.join(project.outputDir, 'checksums.txt'), 'utf8'),
      /latest\.json/
    )
  } finally {
    project.cleanup()
  }
})

test('fails closed when a required updater signature is missing', () => {
  const project = fixture()
  try {
    fs.rmSync(path.join(project.artifactsDir, 'TextEx-Tauri-win', 'TextEx.exe.sig'))
    assert.throws(
      () =>
        generateReleaseFiles({
          artifactsDir: project.artifactsDir,
          outputDir: project.outputDir,
          version: '1.0.8',
          tag: 'v1.0.8',
          repository: 'Topasm/textex'
        }),
      /Missing updater signature/
    )
  } finally {
    project.cleanup()
  }
})

test('fails closed when an updater signature is empty', () => {
  const project = fixture()
  try {
    fs.writeFileSync(
      path.join(project.artifactsDir, 'TextEx-Tauri-linux', 'TextEx.deb.sig'),
      '  \n'
    )
    assert.throws(
      () =>
        generateReleaseFiles({
          artifactsDir: project.artifactsDir,
          outputDir: project.outputDir,
          version: '1.0.8',
          tag: 'v1.0.8',
          repository: 'Topasm/textex'
        }),
      /signature is empty/
    )
  } finally {
    project.cleanup()
  }
})
