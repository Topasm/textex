# Tauri Sidecars

Tectonic 0.17.0 is a mandatory TextEx runtime. Its downloaded executable and
generated provenance file are intentionally ignored by Git; this directory
tracks only the reviewed asset manifest and these instructions.

Prepare the current host target for local Tauri development:

```bash
npm run setup:tauri
```

Prepare or verify a specific release target:

```bash
npm run setup:tauri -- --target x86_64-pc-windows-msvc
npm run setup:tauri -- --target x86_64-pc-windows-msvc --check
```

The setup script downloads to a temporary directory, checks the exact size and
GitHub release API SHA-256, extracts only the Tectonic executable, validates its
binary format, then atomically installs it using Tauri's target-suffixed sidecar
name. Native targets also run `tectonic --version`. `--check` is network-free and
requires matching generated provenance.

The supported Tauri macOS release target is Apple Silicon. Prepare it on an
arm64 macOS host with Xcode command-line tools installed:

```bash
npm run setup:tauri -- --target aarch64-apple-darwin
npm run setup:tauri -- --target aarch64-apple-darwin --check
```

Intel and universal targets may remain available to the setup utility for
historical migration validation, but they are not TextEx Tauri release targets.
