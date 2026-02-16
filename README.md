# TextEx

A self-contained desktop LaTeX editor built on Electron. Split-pane interface with a Monaco code editor on the left and live PDF preview on the right — powered by a bundled [Tectonic](https://tectonic-typesetting.github.io/) engine so you don't need to install TeX Live, MiKTeX, or any other TeX distribution.

## Features

- **Live preview** — edit LaTeX on the left, see the compiled PDF on the right, auto-compiled as you type (1s debounce)
- **Zero setup** — Tectonic is bundled inside the app; packages are downloaded automatically on first use
- **Monaco editor** — the same editor that powers VS Code, with syntax highlighting, word wrap, and keyboard shortcuts
- **Multi-page PDF** — scroll through all pages with responsive sizing
- **Compile log panel** — see Tectonic's stdout/stderr output, auto-opens on errors
- **File operations** — open, save, save-as with native OS dialogs
- **Cross-platform** — builds for Linux (AppImage), macOS (DMG), and Windows (NSIS installer)

## Download

Grab the latest build from [GitHub Actions](../../actions/workflows/build.yml) — click the most recent successful run and download the artifact for your platform:

| Platform | Artifact | File |
|----------|----------|------|
| Linux x64 | TextEx-linux | `.AppImage` |
| macOS Intel | TextEx-mac-x64 | `.dmg` |
| macOS Apple Silicon | TextEx-mac-arm64 | `.dmg` |
| Windows x64 | TextEx-win | `.exe` installer |

### macOS note

The app is not code-signed with an Apple Developer certificate. After mounting the DMG and dragging TextEx to Applications, you need to remove the quarantine flag:

```bash
xattr -cr /Applications/TextEx.app
```

Or right-click the app, select **Open**, and click **Open** in the Gatekeeper dialog.

### Linux note

Make the AppImage executable before running:

```bash
chmod +x TextEx-1.0.0.AppImage
./TextEx-1.0.0.AppImage
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + O` | Open file |
| `Ctrl/Cmd + S` | Save |
| `Ctrl/Cmd + Shift + S` | Save as |
| `Ctrl/Cmd + Enter` | Manual compile |
| `Ctrl/Cmd + L` | Toggle log panel |

## Development

```bash
# Install dependencies
npm install

# Start dev mode with hot reload
npm run dev

# Build for production
npm run build

# Package for your platform
npm run package:linux
npm run package:mac
npm run package:win
```

Requires Node.js 20+ and a Tectonic binary in `resources/bin/{linux,mac,win}/`. The Linux binary is included; see [PACKAGING.md](docs/PACKAGING.md) for downloading Windows/macOS binaries.

## Architecture

Three-process Electron app with strict context isolation:

- **Main process** — window management, file I/O, Tectonic compilation (`src/main/`)
- **Preload** — secure context bridge exposing `window.api` (`src/preload/`)
- **Renderer** — React UI with Zustand state management (`src/renderer/`)

See [`docs/`](docs/) for detailed documentation:

| Document | Description |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture, process model, data flow |
| [COMPILER_SERVICE.md](docs/COMPILER_SERVICE.md) | Tectonic integration and binary resolution |
| [IPC_SPEC.md](docs/IPC_SPEC.md) | IPC channels, payloads, type definitions |
| [UI_SPEC.md](docs/UI_SPEC.md) | Component layout, store shape, styling |
| [PACKAGING.md](docs/PACKAGING.md) | electron-builder config, distribution |
| [TODO.md](docs/TODO.md) | Implementation task list with phases |

## Tech Stack

- **Electron 40** — desktop shell
- **React 19** — UI framework
- **Monaco Editor** — code editor
- **react-pdf / PDF.js** — PDF rendering
- **Zustand** — state management
- **Tectonic 0.15.0** — LaTeX engine (bundled)
- **electron-vite** — build tooling
- **electron-builder** — packaging

## License

MIT
