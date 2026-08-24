const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const { decodePublicKey, prepareUpdaterConfig } = require('./prepare-tauri-updater-config')

function publicKeyFixture() {
  const key = Buffer.alloc(42, 7)
  key.set(Buffer.from('Ed'))
  return `untrusted comment: TextEx updater\n${key.toString('base64')}\n`
}

test('decodes a bounded base64 Minisign public-key file without exposing the outer encoding', () => {
  const publicKey = publicKeyFixture()
  assert.equal(decodePublicKey(Buffer.from(publicKey).toString('base64')), publicKey.trimEnd())

  for (const invalid of ['', 'not-base64', Buffer.from('missing key line').toString('base64')]) {
    assert.throws(() => decodePublicKey(invalid))
  }
})

test('writes a Tauri updater overlay and preserves optional platform signing fields', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'textex-updater-config-root-'))
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'textex-updater-config-output-'))
  fs.mkdirSync(path.join(rootDir, 'src-tauri'))
  fs.writeFileSync(
    path.join(rootDir, 'src-tauri', 'tauri.updater.conf.json'),
    JSON.stringify({ bundle: { createUpdaterArtifacts: true } })
  )
  const platformOverlay = path.join(outputDir, 'windows.json')
  fs.writeFileSync(
    platformOverlay,
    JSON.stringify({ bundle: { windows: { certificateThumbprint: 'fixture' } } })
  )
  const outputConfig = path.join(outputDir, 'updater.json')
  const outputPublicKey = path.join(outputDir, 'updater.pub')
  const publicKey = publicKeyFixture().trimEnd()

  prepareUpdaterConfig({
    rootDir,
    outputConfig,
    outputPublicKey,
    overlayConfig: platformOverlay,
    encodedKey: Buffer.from(`${publicKey}\n`).toString('base64')
  })

  const config = JSON.parse(fs.readFileSync(outputConfig, 'utf8'))
  assert.equal(config.bundle.createUpdaterArtifacts, true)
  assert.equal(config.bundle.windows.certificateThumbprint, 'fixture')
  assert.equal(config.plugins.updater.pubkey, publicKey)
  assert.equal(fs.readFileSync(outputPublicKey, 'utf8'), publicKey)
})
