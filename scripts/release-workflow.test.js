const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const root = path.resolve(__dirname, '..')
const workflow = fs.readFileSync(path.join(root, '.github/workflows/build.yml'), 'utf8')
const tauriConfig = JSON.parse(
  fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8')
)

test('tagged macOS builds require Developer ID signing and explicit notarization', () => {
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
  assert.match(workflow, /sudo apt-get install -y[\s\S]*minisign/)
  assert.match(workflow, /command -v minisign/)
  assert.match(workflow, /minisign -Vm/)
  assert.match(workflow, /test "\$verified" -eq 2/)
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
