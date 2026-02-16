# TextEx — Packaging & Distribution

## Build Tool

**electron-builder** handles creating platform-specific installers.

---

## `electron-builder.yml`

```yaml
appId: com.textex.app
productName: TextEx
copyright: Copyright (c) 2026

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
  target:
    - target: nsis
      arch: [x64]

mac:
  target:
    - target: dmg
      arch: [x64, arm64]   # Universal binary support
  hardenedRuntime: true

linux:
  target:
    - target: AppImage
      arch: [x64]
  category: Office
```

**TODO: Missing build assets:**
- `build/icon.ico` -- Windows icon (not yet created)
- `build/icon.icns` -- macOS icon (not yet created)
- `build/icon.png` -- Linux icon (not yet created)
- `build/entitlements.mac.plist` -- macOS entitlements (not yet created, needed
  if `hardenedRuntime` and notarization are enabled)

**Note:** The actual `electron-builder.yml` omits icon and entitlement paths
since these files do not exist yet. Add them when the assets are created.

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

**Current status:** Only the Linux (musl) binary is downloaded. Windows and macOS
binaries are still needed.

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

## macOS Notarization

For distribution outside the Mac App Store:

1. Sign with a Developer ID certificate.
2. Enable `hardenedRuntime: true`.
3. Create `build/entitlements.mac.plist`:
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
     "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
   <dict>
     <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
     <true/>
     <key>com.apple.security.cs.allow-jit</key>
     <true/>
   </dict>
   </plist>
   ```
4. Use `electron-builder`'s `afterSign` hook to call `xcrun notarytool submit`.

---

## File Size Estimates

| Component | Approx. Size |
|---|---|
| Electron shell | ~80 MB |
| Tectonic binary | ~25 MB |
| React + Monaco + PDF.js | ~10 MB |
| **Total installer** | **~115-130 MB** |

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
