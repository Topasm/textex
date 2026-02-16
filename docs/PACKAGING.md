# TextEx — Packaging & Distribution

## Build Tool

**electron-builder** handles creating platform-specific installers.

---

## `electron-builder.yml`

```yaml
appId: com.textex.app
productName: TextEx
copyright: Copyright © 2026

directories:
  output: dist
  buildResources: build    # icons, etc.

# Bundle Tectonic binary for the target platform
extraResources:
  - from: "resources/bin/${os}"
    to: "bin"
    filter:
      - "**/*"

files:
  - "out/**/*"             # Compiled main/preload/renderer

win:
  icon: build/icon.ico
  target:
    - target: nsis
      arch: [x64]

mac:
  icon: build/icon.icns
  target:
    - target: dmg
      arch: [x64, arm64]   # Universal binary support
  hardenedRuntime: true
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist

linux:
  icon: build/icon.png
  target:
    - target: AppImage
      arch: [x64]
  category: Office
```

**Build assets** (all present in `build/`):
- `build/icon.png` -- 1024x1024 RGBA PNG (24 KB) -- used for Linux
- `build/icon.ico` -- Multi-resolution ICO (16x16 through 256x256, 25 KB) -- used for Windows
- `build/icon.icns` -- macOS ICNS format (68 KB)
- `build/entitlements.mac.plist` -- macOS entitlements for hardened runtime (JIT, unsigned memory, dyld env vars)

---

## Binary Organization

Before building, organize the `resources/bin/` directory:

```
resources/
+-- bin/
    +-- win/
    |   +-- tectonic.exe     # From Tectonic GitHub Releases (x86_64-pc-windows-msvc)
    +-- mac/
    |   +-- tectonic          # From Tectonic GitHub Releases (x86_64-apple-darwin)
    +-- linux/
        +-- tectonic          # From Tectonic GitHub Releases (x86_64-unknown-linux-musl)
```

**Status:** All three platform binaries are present (Tectonic 0.15.0):

| Platform | File | Variant | Size |
|---|---|---|---|
| Linux | `resources/bin/linux/tectonic` | `x86_64-unknown-linux-musl` (statically linked) | 36 MB |
| macOS | `resources/bin/mac/tectonic` | `x86_64-apple-darwin` (Mach-O 64-bit) | 50 MB |
| Windows | `resources/bin/win/tectonic.exe` | `x86_64-pc-windows-msvc` (PE32+ x86-64) | 48 MB |

The `${os}` variable in `electron-builder.yml` resolves to `win`, `mac`, or
`linux` at build time, copying only the relevant binary.

---

## Build Commands

In `package.json`:

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "package:win": "electron-vite build && electron-builder --win",
    "package:mac": "electron-vite build && electron-builder --mac",
    "package:linux": "electron-vite build && electron-builder --linux"
  }
}
```

**Note:** The package scripts run `electron-vite build` first to ensure compiled
output in `out/` is up to date before packaging.

---

## Build Results (Linux)

The Linux AppImage was successfully built on a headless x86_64 Linux server
(RHEL 9 / kernel 5.14) using Electron 40.4.1 and electron-builder 26.7.0.

**Output:**
```
dist/
├── TextEx-1.0.0.AppImage   (155 MB, executable)
├── latest-linux.yml         (auto-update manifest)
├── builder-debug.yml
└── linux-unpacked/          (uncompressed app directory)
    ├── textex               (main Electron binary)
    └── resources/
        ├── app.asar         (bundled app code, 81 MB)
        └── bin/
            └── tectonic     (Tectonic 0.15.0, musl, 36 MB)
```

**Binary path resolution verified:** In the packaged app, the Tectonic binary is
at `resources/bin/tectonic`. The `getTectonicPath()` function in
`src/main/compiler.ts` resolves this via `process.resourcesPath + '/bin/tectonic'`
in production mode, which matches the `extraResources` output location.

**Smoke test not performed:** The build was done on a headless server without a
display server (X11/Wayland). The AppImage requires a graphical environment to
launch. Smoke testing should be performed on a desktop Linux machine.

---

## macOS Notarization

For distribution outside the Mac App Store:

1. Sign with a Developer ID certificate.
2. `hardenedRuntime: true` is already set in `electron-builder.yml`.
3. `build/entitlements.mac.plist` is created with the following entitlements:
   - `com.apple.security.cs.allow-jit` -- required for Electron's V8 engine
   - `com.apple.security.cs.allow-unsigned-executable-memory` -- required for Electron
   - `com.apple.security.cs.allow-dyld-environment-variables` -- for Electron compatibility
4. Use `electron-builder`'s `afterSign` hook to call `xcrun notarytool submit`.

**Note:** macOS builds (`npm run package:mac`) must be run on a macOS machine.
Cross-compilation from Linux is not supported by electron-builder for DMG targets.

---

## File Sizes

### Actual Linux Build Results

| Output | Size |
|---|---|
| `dist/TextEx-1.0.0.AppImage` | 155 MB |
| `dist/linux-unpacked/` (uncompressed) | ~255 MB |

### Component Breakdown (approximate)

| Component | Approx. Size |
|---|---|
| Electron shell + Chromium | ~200 MB (unpacked) |
| Tectonic binary (Linux) | 36 MB |
| app.asar (React + Monaco + PDF.js + app code) | ~81 MB |
| **AppImage (compressed)** | **155 MB** |

**Note:** Windows (NSIS) and macOS (DMG) builds will differ in size due to
different Tectonic binary sizes (48 MB and 50 MB respectively) and
platform-specific Electron overheads.

---

## CI/CD Considerations

For automated builds (e.g., GitHub Actions):

1. Download Tectonic binaries for all three platforms in a setup step.
2. Place them in `resources/bin/{win,mac,linux}/`.
3. Run `electron-builder` with the appropriate `--{platform}` flag.
4. Upload artifacts (`.exe`, `.dmg`, `.AppImage`) to GitHub Releases.

Example workflow step:
```yaml
- name: Download Tectonic (Linux)
  run: |
    mkdir -p resources/bin/linux
    curl -L -o resources/bin/linux/tectonic \
      https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%400.15.0/tectonic-0.15.0-x86_64-unknown-linux-gnu
    chmod +x resources/bin/linux/tectonic
```
