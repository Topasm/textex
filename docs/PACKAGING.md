# Tauri Packaging

TextEx packages one Tauri application and a target-qualified Tectonic sidecar.
Package commands verify both the sidecar and the curated offline-cache manifest
before invoking the Tauri CLI.

| Platform | Command | Primary installer | Updater artifact |
| --- | --- | --- | --- |
| Linux x64 | `npm run package:linux` | AppImage + DEB | AppImage + DEB `.sig` files |
| macOS arm64 | `npm run package:mac` | DMG | `.app.tar.gz` + `.sig` |
| macOS x64 | `npm run package:mac:x64` | DMG | `.app.tar.gz` + `.sig` |
| Windows x64 | `npm run package:win` | NSIS EXE | EXE + `.sig` |

Updater builds use the corresponding `package:updater:*` command and require:

- `TEXTEX_UPDATER_PUBLIC_KEY`
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Never place private signing material in repository files or command output.

Generate the updater key pair once on a trusted maintainer Mac, not on a shared
CI or development server. The command prompts for a password and writes the
private key plus a `.pub` public-key file:

```bash
umask 077
mkdir -p "$HOME/.tauri"
npm run tauri signer generate -- -w "$HOME/.tauri/textex-updater.key"
```

Back up both files and the password in a secure password manager. Losing the
private key prevents already-installed applications from accepting future
updates. Register the private key contents directly, and register the public
key file as one-line base64 because the TextEx build and verification scripts
decode that secret before use:

```bash
gh secret set -R Topasm/textex TAURI_SIGNING_PRIVATE_KEY \
  < "$HOME/.tauri/textex-updater.key"
base64 < "$HOME/.tauri/textex-updater.key.pub" | tr -d '\n' | \
  gh secret set -R Topasm/textex TEXTEX_UPDATER_PUBLIC_KEY
gh secret set -R Topasm/textex TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

The final command prompts for the password without placing it in shell history.
Do not use `--body` for private material on a shared machine.
Tagged CI removes the secret's outer base64 wrapper, validates the nested
Minisign public-key box, and injects the one-line Tauri public key into an
ephemeral updater config and the compiled application. It never prints either
decoded value.

## Platform signing in CI

Version-tag builds always require Tauri updater signing, but Apple platform
credentials are optional. With no Apple credentials, CI applies an ad-hoc
signature to macOS applications and verifies both the DMG and updater archive;
users may need to allow the app manually in macOS Privacy & Security. If Apple
signing is enabled, all five secrets must be configured together:
`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_NOTARY_API_KEY`,
`APPLE_NOTARY_KEY_ID`, and `APPLE_NOTARY_ISSUER_ID`.

The full path imports the base64-encoded Developer ID PKCS#12 and App Store
Connect notary key into temporary files/keychains, enables the hardened runtime
with `src-tauri/Entitlements.plist`, lets Tauri notarize the application before
updater-archive creation, then explicitly notarizes, staples, and validates the
DMG. It also verifies that the updater application carries a valid Developer ID
signature and stapled notarization ticket. A partial Apple secret set fails
closed rather than silently falling back to ad-hoc signing.

Windows Authenticode uses the optional pair `WINDOWS_CERTIFICATE` (base64 PFX)
and `WINDOWS_CERTIFICATE_PASSWORD`. Both or neither must be configured. When
present, CI signs and verifies both the NSIS installer and packaged executable;
Tauri updater signing remains mandatory either way. Linux CI installs
`minisign` and verifies both generated AppImage and DEB updater signatures
against the embedded public key.

Branch and pull-request packages remain unsigned smoke artifacts. Platform
credentials are exposed only to version-tag jobs when configured. See
[RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) for the blocking release process.

## Bundle contents

The Tauri configuration bundles:

- the Tectonic 0.17 sidecar for the exact target triple;
- LaTeX package metadata;
- Hunspell dictionaries;
- open-source license notices;
- the versioned Tectonic cache seed manifest and any curated seed files.

Each platform job inspects its installer and proves that the application,
Tectonic binary, cache manifest, and package metadata are present. It then runs
the packaged executable with `TEXTEX_PACKAGE_SMOKE=1`, which validates embedded
Tauri/updater/resource configuration and the adjacent sidecar without opening a
window. macOS jobs verify both architectures independently.

## Curated Tectonic cache seed

The checked-in seed is intentionally an empty, deterministic manifest, so a
normal build keeps Tectonic's existing network fallback. Release engineering
may stage a reviewed cache snapshot without adding a downloader to the build:

```bash
node scripts/prepare-tectonic-cache-seed.js \
  --source /absolute/path/to/reviewed-cache \
  --seed-version tectonic-0.17-YYYYMMDD
npm run check:tectonic-cache-seed
```

The script rejects symlinks, path escapes, oversized files and caches, and
source/output overlap. It sorts paths, records every byte count and SHA-256,
and atomically replaces only generated `resources/tectonic-cache/files` and
`manifest.json`. It never downloads support files. On first compile the Rust
service verifies the same limits and hashes, installs into a staged sibling
directory, and atomically activates it. A missing, empty, or rejected seed is
reported in compile logs and leaves network fallback enabled.

## Release metadata

`scripts/generate-tauri-update-manifest.js` accepts downloaded CI artifacts,
requires one signed updater artifact per supported platform, writes the Tauri
`latest.json` platform map, and generates `checksums.txt`. Duplicate filenames,
missing signatures, missing platforms, and tag/version mismatches fail closed.
