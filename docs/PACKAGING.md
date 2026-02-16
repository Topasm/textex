# NeuroTeX — Packaging & Distribution

## Build Tool

**electron-builder** handles creating platform-specific installers.

---

## `electron-builder.yml`

```yaml
appId: com.neurotex.app
productName: NeuroTeX
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
  target:
    - target: nsis
      arch: [x64]
  icon: build/icon.ico

mac:
  target:
    - target: dmg
      arch: [x64, arm64]   # Universal binary support
  icon: build/icon.icns
  hardenedRuntime: true
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist

linux:
  target:
    - target: AppImage
      arch: [x64]
  icon: build/icon.png
  category: Office
```

---

## Binary Organization

Before building, organize the `resources/bin/` directory:

```
resources/
└── bin/
    ├── win/
    │   └── tectonic.exe     # From Tectonic GitHub Releases (x86_64-pc-windows-msvc)
    ├── mac/
    │   └── tectonic          # From Tectonic GitHub Releases (x86_64-apple-darwin)
    └── linux/
        └── tectonic          # From Tectonic GitHub Releases (x86_64-unknown-linux-gnu)
```

The `${os}` variable in `electron-builder.yml` resolves to `win`, `mac`, or
`linux` at build time, copying only the relevant binary.

---

## Build Commands

Add these to `package.json` scripts:

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "package:win": "electron-builder --win",
    "package:mac": "electron-builder --mac",
    "package:linux": "electron-builder --linux",
    "package:all": "electron-builder --win --mac --linux"
  }
}
```

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
| **Total installer** | **~115–130 MB** |

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
