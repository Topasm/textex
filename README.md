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
- **Theme toggle** — dark, light, and high-contrast themes with persistent settings
- **Multi-file projects** — file tree sidebar and tabbed editing for working with multi-file LaTeX projects
- **Snippet completion & templates** — ~50 LaTeX snippet completions and a template gallery with 5 document templates
- **Custom font size** — adjustable editor font size with keyboard shortcuts
- **Auto-update** — seamless in-app updates via electron-updater
- **BibTeX bibliography panel** — dedicated panel for managing bibliography entries with citation auto-completion
- **Git integration** — view status, stage files, and commit directly from a sidebar panel
- **Spell checker** — inline spell checking with quick-fix suggestions
- **SyncTeX** — click in the editor to jump to the PDF position, or Ctrl+Click in the PDF to jump to source
- **LSP integration** — bundled [TexLab](https://github.com/latex-lsp/texlab) language server for real-time diagnostics, completions, hover docs, go-to-definition, document outline, rename, and formatting
- **Export formats** — export to HTML, DOCX, ODT, and EPUB via Pandoc
- **CLI tools** — headless compile, init, export, and template listing via `textex` command
- **MCP server** — `compile_latex` and `get_compile_log` tools for AI integration

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
| `Ctrl/Cmd + Shift + =` | Increase font size |
| `Ctrl/Cmd + Shift + -` | Decrease font size |
| `Ctrl/Cmd + B` | Toggle sidebar |
| `Ctrl/Cmd + W` | Close current tab |
| `Ctrl/Cmd + Tab` | Next tab |
| `Ctrl/Cmd + Shift + Tab` | Previous tab |
| `Ctrl/Cmd + Shift + N` | New from template |

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

### CLI

```bash
# Build the CLI
npm run build:cli

# Compile a .tex file to PDF
textex compile paper.tex

# Compile with watch mode
textex compile paper.tex --watch

# Compile quietly (no log output)
textex compile paper.tex --quiet

# Output to a specific directory
textex compile paper.tex --output build/

# Scaffold a new project from a template
textex init article

# Export to another format
textex export paper.tex --format docx

# List available templates
textex templates
```

### MCP Server

The MCP server exposes TextEx's LaTeX compilation as tools for AI assistants (Claude Desktop, etc.) via the [Model Context Protocol](https://modelcontextprotocol.io/).

```bash
# Build the MCP server
npm run build:mcp

# Start the MCP server (stdio transport)
npm run mcp
```

**Tools provided:**

| Tool | Description |
|------|-------------|
| `compile_latex` | Compile a `.tex` file. Input: `{ file_path: string }`. Returns `{ success, pdfPath }` or `{ success: false, error }`. |
| `get_compile_log` | Returns stdout/stderr from the last compilation for diagnosing errors. |

**Claude Desktop configuration** — add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "textex": {
      "command": "node",
      "args": ["/absolute/path/to/textex/out/mcp/mcp/server.js"]
    }
  }
}
```

**Other MCP clients** — any client supporting stdio transport can connect by running `node out/mcp/mcp/server.js` from the project root.

## Architecture

Three-process Electron app with strict context isolation:

- **Main process** — window management, file I/O, Tectonic compilation (`src/main/`)
- **Preload** — secure context bridge exposing `window.api` (`src/preload/`)
- **Renderer** — React UI with Zustand state management (`src/renderer/`)
- **CLI** — headless commands via `src/cli/`, delegates to `src/shared/`
- **MCP server** — stdio MCP server via `src/mcp/`, delegates to `src/shared/`

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
- **Tectonic 0.15.0** — LaTeX engine (bundled, [continuous build](https://github.com/tectonic-typesetting/tectonic/releases/tag/continuous))
- **TexLab 5.25.1** — LaTeX language server (bundled)
- **vscode-jsonrpc** — JSON-RPC transport for LSP
- **electron-vite** — build tooling
- **electron-builder** — packaging
- **electron-updater** — auto-updates
- **simple-git** — Git integration
- **nspell** — spell checking
- **commander** — CLI argument parsing
- **chokidar** — file watching for CLI `--watch` mode
- **@modelcontextprotocol/sdk** — MCP server framework

## Built With

TextEx is built on these open-source projects:

| Component | Source | License |
|-----------|--------|---------|
| [Electron](https://www.electronjs.org/) | Desktop application shell | MIT |
| [Tectonic](https://tectonic-typesetting.github.io/) | Self-contained LaTeX engine (no TeX Live needed) | MIT |
| [React](https://react.dev/) | UI framework | MIT |
| [Monaco Editor](https://microsoft.github.io/monaco-editor/) | Code editor (same engine as VS Code) | MIT |
| [react-pdf](https://github.com/wojtekmaj/react-pdf) / [PDF.js](https://mozilla.github.io/pdf.js/) | PDF rendering in the browser | Apache-2.0 |
| [Zustand](https://github.com/pmndrs/zustand) | Lightweight state management | MIT |
| [electron-vite](https://electron-vite.org/) | Build tooling for Electron + Vite | MIT |
| [electron-builder](https://www.electron.build/) | Cross-platform packaging and distribution | MIT |
| [electron-updater](https://www.electron.build/auto-update) | Seamless in-app auto-updates | MIT |
| [simple-git](https://github.com/steveukx/git-js) | Git CLI wrapper for Node.js | MIT |
| [nspell](https://github.com/wooorm/nspell) | Hunspell-compatible spell checker | MIT |
| [Pandoc](https://pandoc.org/) | Universal document converter (for export) | GPL-2.0 |
| [Commander.js](https://github.com/tj/commander.js) | CLI argument parsing | MIT |
| [chokidar](https://github.com/paulmillr/chokidar) | File watching for CLI `--watch` mode | MIT |
| [MCP SDK](https://github.com/modelcontextprotocol/sdk) | Model Context Protocol server framework | MIT |
| [TexLab](https://github.com/latex-lsp/texlab) | LaTeX language server (diagnostics, completions, hover, rename) | GPL-3.0 |
| [vscode-jsonrpc](https://github.com/microsoft/vscode-languageserver-node) | JSON-RPC transport for LSP communication | MIT |
| [KaTeX](https://katex.org/) | Math typesetting for previews | MIT |

## License

MIT
