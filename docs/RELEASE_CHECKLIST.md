# Release Safety Checklist

Use this checklist for dependency updates, packaging changes, version bumps,
manual publication, and tagged releases. These are blocking checks: do not
publish first and repair the release afterward.

## Release Triggers

The `Build & Package` workflow runs for pushes to `main`, version tags matching
`v*`, and manual dispatches.

- A normal `main` push validates all platforms but skips the `release` job.
- A `v*` tag publishes a GitHub Release after all build jobs pass.
- A manual dispatch with `publish_release` or `prerelease` enabled can also
  publish. Leave both disabled for validation-only runs.
- `strategy.fail-fast` must remain `false` so one platform failure does not hide
  results from the other platforms.

## 1. Start From a Reproducible Tree

Confirm the intended branch and inspect all changes before staging anything:

```bash
git status --short --branch
git diff --check
npm ci
```

Do not replace `npm ci` with `npm install` during verification. `npm install`
may rewrite the lockfile and conceal whether the committed dependency graph is
reproducible.

For dependency changes, also run:

```bash
npm audit
npm run licenses:generate
git diff -- package.json package-lock.json resources/licenses
```

Review generated license changes and avoid force-upgrading across unrelated
major versions just to silence an audit report.

## 2. Synchronize Release Versions

The application version is currently duplicated because the desktop app, CLI,
and MCP server have separate entry points. Update all of these together:

- `package.json`
- root package entries in `package-lock.json`
- `src/cli/index.ts`
- `src/mcp/server.ts`
- `src/renderer/components/SettingsModal.tsx`

Check the result before committing:

```bash
textex_release_version=$(node -p "require('./package.json').version")
rg -n "${textex_release_version}" \
  package.json package-lock.json src/cli/index.ts src/mcp/server.ts \
  src/renderer/components/SettingsModal.tsx
```

The release tag must be exactly `v${textex_release_version}`. The workflow
rejects a tag that differs from `package.json`.

## 3. Run the Local Commit Gate

Run the full checks and every independently compiled entry point:

```bash
npm run pre-commit
npm run build
npm run build:cli
npm run build:mcp
node out/cli/cli/index.js --version
```

`npm run check` is useful while iterating, but it intentionally omits tests and
is not the release gate. Package the current host platform when packaging,
native dependencies, sidecars, or updater metadata changed:

```bash
npm run package:linux
npm run package:mac:universal
npm run package:win
```

Only run the command supported by the current host. GitHub Actions is the
required cross-platform verification source.

## 4. Protect macOS Universal Builds

Universal packaging combines two Electron applications. Native modules and
sidecars are already split into architecture-specific paths, so
`electron-builder.yml` must retain this coverage:

```yaml
x64ArchFiles: '{Contents/Resources/app.asar.unpacked/node_modules/**/*darwin*/**,Contents/Resources/bin/**}'
```

Do not change the native-module portion to `**/*.node`. In addition to native
`.node` files from `@napi-rs/canvas` and `node-pty`, `node-pty` includes the
extensionless Mach-O file `prebuilds/darwin-*/spawn-helper`.

When native dependencies change:

1. Inspect architecture-specific contents under the affected package.
2. Confirm the glob covers every Mach-O helper, not only `.node` files.
3. Keep Windows and Linux prebuilds outside the macOS exception.
4. Require a successful `Build (mac-universal)` CI job before tagging.

The current CI build is ad-hoc signed and not notarized. A successful build does
not imply Apple notarization; Gatekeeper warnings are expected until Developer
ID signing and notarization are configured.

## 5. Upgrade Tectonic as One Change

macOS universal builds require two Tectonic release assets:

- `resources/bin/mac/tectonic`: x86_64
- `resources/bin/mac/arm64/tectonic`: arm64

Linux uses the x86_64 musl asset and Windows uses the x86_64 MSVC asset. When
upgrading Tectonic:

1. Update every release URL and asset name in `.github/workflows/build.yml`.
2. Replace the corresponding local binaries under `resources/bin/`.
3. Verify executable permissions on Unix binaries.
4. Run the available local binary with `--version`.
5. Update `docs/TECH_STACK.md`, `docs/PACKAGING.md`, and `docs/TODO.md`.
6. Require successful packaging on all three CI platforms.

Do not update only the matrix asset name or only `RELEASE_BASE`; the version is
present in both locations.

## 6. Preserve Updater and Release Assets

Do not rename release artifacts independently of `electron-builder.yml` and
the updater configuration. A complete release currently contains:

- `TextEx-<version>-windows-x64.exe` and its blockmap
- `TextEx-<version>-macos-universal.dmg` and its blockmap
- `TextEx-<version>-macos-universal.zip` and its blockmap
- `TextEx-<version>-linux-x86_64.AppImage`
- `TextEx-<version>-linux-amd64.deb`
- `latest.yml`, `latest-mac.yml`, and `latest-linux.yml`
- `checksums.txt`

The macOS ZIP and `latest-mac.yml` are required by `electron-updater`, even if
the DMG is the user-facing installer. The release job must fail when any updater
manifest is missing and must generate SHA-256 checksums after collecting all
artifacts.

Keep GitHub Actions on supported runtime versions. The current workflow uses
`actions/checkout@v7`, `actions/setup-node@v7`,
`actions/upload-artifact@v7`, `actions/download-artifact@v8`, and
`softprops/action-gh-release@v3`. Verify upstream release notes before changing
an action major version; Dependabot checks these weekly.

## 7. Validate `main` Before Tagging

Push the reviewed release commit to `main`, then wait for its exact workflow:

```bash
gh run list --workflow "Build & Package" --branch main --limit 5
gh run watch <run-id> --exit-status
```

Confirm all of the following jobs succeeded:

- `Lint & Typecheck`
- `Test`
- `Build (linux)`
- `Build (win)`
- `Build (mac-universal)` including the ad-hoc re-sign and artifact upload

Do not tag a commit while any of these jobs is queued, running, cancelled, or
failed.

## 8. Create the Tag Only After Green CI

Before creating a tag, confirm the worktree is clean, local `main` matches the
remote, and the version has neither a tag nor a GitHub Release:

```bash
git status --short --branch
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"
gh release view "v${textex_release_version}"
git ls-remote --tags origin \
  "refs/tags/v${textex_release_version}" \
  "refs/tags/v${textex_release_version}^{}"
```

For a new version, `gh release view` should report that the release was not
found and `git ls-remote` should print no matching tag. Then create and push one
annotated tag:

```bash
git tag -a "v${textex_release_version}" \
  -m "TextEx v${textex_release_version}"
git push origin "refs/tags/v${textex_release_version}"
```

Monitor the tag-triggered run with `gh run watch <run-id> --exit-status`. Do not
manually create a Release while the workflow is running.

## 9. Verify the Published Release

After the tag workflow succeeds:

```bash
gh release view "v${textex_release_version}" \
  --json url,tagName,isDraft,isPrerelease,publishedAt,assets
```

Verify that the release is neither a draft nor an unintended prerelease, all
expected assets are uploaded, and each `latest*.yml` contains the correct
version and artifact path. Compare downloaded updater metadata with the hashes
in `checksums.txt`.

Finally, confirm the local and remote tag resolve to the same commit and that
the worktree is clean.

## Failure Recovery

- Let all platform jobs finish; `fail-fast: false` exists to expose independent
  failures.
- Do not publish partial artifacts or bypass a missing updater manifest.
- Fix the problem on a new branch, run the local gate, push to `main`, and wait
  for a completely green `main` workflow.
- If a GitHub Release already exists, never move its tag. Increment the patch
  version and publish a new release.
- If the tag run failed and no Release exists, verify both conditions explicitly
  before replacing that exact tag. Tag replacement is destructive and must not
  be used as the normal release flow.
