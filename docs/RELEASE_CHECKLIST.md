# Release Checklist

## 1. Prepare the version

Keep the version synchronized in:

- `package.json` and the root `package-lock.json` entries
- `src-tauri/Cargo.toml` and `Cargo.lock`
- `src/cli/index.ts`
- `src/mcp/server.ts`
- `src/renderer/components/SettingsModal.tsx`

`src-tauri/tauri.conf.json` must continue to read its version from
`../package.json` rather than duplicating a literal version.

The release tag must be exactly `v<package.json version>`.

## 2. Regenerate and review notices

```bash
npm ci
npm audit
npm run licenses:generate
git diff -- resources/licenses
```

Dependency or sidecar upgrades must update their version, source URLs, bundled
layout, checksums/manifest, and documentation together.

If the release includes a curated Tectonic support cache, stage only a reviewed
local snapshot and verify its deterministic manifest:

```bash
node scripts/prepare-tectonic-cache-seed.js \
  --source /absolute/path/to/reviewed-cache \
  --seed-version tectonic-0.17-YYYYMMDD
npm run check:tectonic-cache-seed
```

Do not download cache content during CI or commit unreviewed large seed assets.

## 3. Run local gates

```bash
npm run pre-commit
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo clippy --locked --manifest-path src-tauri/Cargo.toml -- -D warnings
npm run build:cli
npm run build:mcp
```

Run a local package smoke test on the available platform. The CI package jobs
run the extracted application with `TEXTEX_PACKAGE_SMOKE=1`; the process must
exit successfully before a window or updater plugin is initialized. Do not
create a tag for this test.

## 4. Verify signing configuration

The GitHub repository must contain all three updater secrets:

- `TEXTEX_UPDATER_PUBLIC_KEY`
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Platform code-signing/notarization credentials are separate from Tauri updater
signing and must follow the platform owner policy.

Tagged macOS jobs also require all five secrets below. The certificate must be
a base64-encoded PKCS#12 containing one `Developer ID Application` identity;
the API key must be the base64-encoded App Store Connect `.p8` key:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_NOTARY_API_KEY`
- `APPLE_NOTARY_KEY_ID`
- `APPLE_NOTARY_ISSUER_ID`

CI imports the certificate into an ephemeral keychain and maps the notary
credentials to Tauri's `APPLE_API_ISSUER`, `APPLE_API_KEY`, and
`APPLE_API_KEY_PATH` variables. Tauri therefore notarizes the application
before creating the updater archive. CI separately submits the DMG with
`notarytool`, staples it, and validates both the DMG and the application inside
the `.app.tar.gz` updater archive. The hardened-runtime entitlements in
`src-tauri/Entitlements.plist` are part of this check.

Windows Authenticode is optional but its secrets are an all-or-nothing pair:

- `WINDOWS_CERTIFICATE` (base64-encoded code-signing PFX)
- `WINDOWS_CERTIFICATE_PASSWORD`

When configured, CI imports the PFX into the current-user certificate store,
signs the NSIS installer and application with SHA-256 plus a timestamp, and
requires `Get-AuthenticodeSignature` to report `Valid`. Without this pair, a
tagged Windows job still creates and verifies the mandatory Tauri updater
signature but reports that Authenticode is disabled.

Tagged Linux jobs require `minisign` and verify the AppImage and DEB updater
signatures against `TEXTEX_UPDATER_PUBLIC_KEY` before uploading artifacts.
Normal branches and pull requests remain ad-hoc/unsigned package smoke builds;
they do not read platform signing or notarization secrets.

## 5. Validate `main`

Push the release commit to `main` and wait for the exact `Build & Package`
workflow to pass. Required jobs are:

- Lint & Typecheck
- Test
- Tauri Rust Test & Licenses
- Tauri Build (linux)
- Tauri Build (win)
- Tauri Build (mac-arm64)
- Tauri Build (mac-x64)

Do not tag while any required job is queued, cancelled, or failing.
The tag workflow fails closed unless the Actions API reports a successful
`main` push run of `Build & Package` for the exact tagged commit SHA.

Workflow actions are pinned to immutable 40-character commit SHAs. When an
action is upgraded, resolve the reviewed upstream version tag to its commit,
update the adjacent version comment, and run `npm run test:scripts`.

## 6. Publish

After the green `main` workflow, verify that the version has no existing tag or
Release, create the exact tag, and push it. The tagged workflow builds signed
updater artifacts and publishes the GitHub Release.

## 7. Verify the release set

The Release must contain:

- Linux AppImage, DEB, and both adjacent signatures
- macOS arm64 and x64 DMGs, updater archives, and signatures
- Windows NSIS installer and signature
- `latest.json` containing `linux-x86_64`, `linux-x86_64-appimage`,
  `linux-x86_64-deb`, `darwin-aarch64`, `darwin-x86_64`, and
  `windows-x86_64`
- `checksums.txt`

Download `latest.json` from the public release URL, validate every URL and
signature field, then smoke-test update discovery from the previous version.

Never move or replace a tag after a GitHub Release exists. Publish a new patch
version for any correction.
