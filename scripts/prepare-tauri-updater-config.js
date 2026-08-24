const fs = require('node:fs')
const path = require('node:path')

const MAX_ENCODED_PUBLIC_KEY_BYTES = 16 * 1024
const MINISIGN_PUBLIC_KEY_BYTES = 42

function decodeCanonicalBase64(value, label) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error(`${label} is not base64`)
  }
  const decoded = Buffer.from(value, 'base64')
  if (decoded.toString('base64') !== value) {
    throw new Error(`${label} is not canonical base64`)
  }
  return decoded
}

function decodePublicKey(encoded) {
  if (
    typeof encoded !== 'string' ||
    encoded.length === 0 ||
    encoded.length > MAX_ENCODED_PUBLIC_KEY_BYTES ||
    encoded.trim() !== encoded ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  ) {
    throw new Error('TEXTEX_UPDATER_PUBLIC_KEY must be one-line base64')
  }

  const decoded = decodeCanonicalBase64(encoded, 'TEXTEX_UPDATER_PUBLIC_KEY')
  const publicKey = decoded.toString('utf8')
  if (!Buffer.from(publicKey, 'utf8').equals(decoded)) {
    throw new Error('the decoded updater public key is not UTF-8')
  }

  // `tauri signer generate` writes the public key as a one-line base64 value.
  // The repository secret adds one outer base64 layer so GitHub can preserve
  // the file byte-for-byte. Tauri expects the inner, one-line value, while a
  // Minisign verifier expects the decoded two-line public-key box.
  const normalized = publicKey.replace(/\r\n/g, '\n').trimEnd()
  if (normalized.includes('\n') || normalized.trim() !== normalized) {
    throw new Error('the decoded updater public key is not a one-line Tauri public key')
  }
  const publicKeyBoxBytes = decodeCanonicalBase64(normalized, 'the Tauri updater public key')
  const publicKeyBox = publicKeyBoxBytes.toString('utf8')
  if (!Buffer.from(publicKeyBox, 'utf8').equals(publicKeyBoxBytes)) {
    throw new Error('the Tauri updater public key does not contain UTF-8')
  }
  const lines = publicKeyBox.replace(/\r\n/g, '\n').trimEnd().split('\n')
  if (lines.length !== 2 || !lines[0].startsWith('untrusted comment:')) {
    throw new Error('the Tauri updater public key does not contain a Minisign public-key file')
  }

  const key = decodeCanonicalBase64(lines[1], 'the Minisign public-key payload')
  if (
    key.length !== MINISIGN_PUBLIC_KEY_BYTES ||
    !['Ed', 'ED'].includes(key.subarray(0, 2).toString('ascii'))
  ) {
    throw new Error('the decoded updater public key contains an invalid key payload')
  }
  return normalized
}

function mergeConfig(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      mergeConfig(target[key], value)
    } else {
      target[key] = value
    }
  }
  return target
}

function readConfig(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
}

function prepareUpdaterConfig({
  rootDir,
  outputConfig,
  outputPublicKey,
  overlayConfig,
  encodedKey
}) {
  const publicKey = decodePublicKey(encodedKey)
  const config = readConfig(path.join(rootDir, 'src-tauri', 'tauri.updater.conf.json'))
  if (overlayConfig) mergeConfig(config, readConfig(overlayConfig))

  config.bundle = config.bundle || {}
  config.bundle.createUpdaterArtifacts = true
  config.plugins = config.plugins || {}
  config.plugins.updater = { ...(config.plugins.updater || {}), pubkey: publicKey }

  fs.writeFileSync(outputConfig, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  fs.writeFileSync(outputPublicKey, publicKey, { mode: 0o600 })
}

if (require.main === module) {
  const [outputConfig, outputPublicKey, overlayConfig] = process.argv.slice(2)
  if (!outputConfig || !outputPublicKey) {
    throw new Error(
      'usage: node scripts/prepare-tauri-updater-config.js <config> <public-key> [overlay]'
    )
  }
  prepareUpdaterConfig({
    rootDir: path.resolve(__dirname, '..'),
    outputConfig: path.resolve(outputConfig),
    outputPublicKey: path.resolve(outputPublicKey),
    overlayConfig: overlayConfig ? path.resolve(overlayConfig) : undefined,
    encodedKey: process.env.TEXTEX_UPDATER_PUBLIC_KEY_BASE64
  })
}

module.exports = { decodePublicKey, mergeConfig, prepareUpdaterConfig }
