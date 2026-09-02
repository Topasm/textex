[**한국어**](README.ko.md)

# TextEx

[![Build Status](https://github.com/Topasm/textex/actions/workflows/build.yml/badge.svg)](https://github.com/Topasm/textex/actions/workflows/build.yml)
[![Release](https://img.shields.io/github/v/release/Topasm/textex?include_prereleases&label=latest)](https://github.com/Topasm/textex/releases/latest)

A **free**, **local-first** Tauri desktop LaTeX editor. TextEx runs on your machine with no account or cloud service. It provides a split-pane interface with a Monaco code editor on the left and live PDF preview on the right, with a bundled [Tectonic](https://tectonic-typesetting.github.io/) engine so you **do not** need to install TeX Live, MiKTeX, or any other TeX distribution. A system pdfLaTeX installation can optionally be selected in Settings and is driven through `latexmk`. Builds that ship an empty support-file seed may use the network on first compile; cached projects can then compile offline.

<p align="center">
  <img src="docs/images/main-editor.png" alt="TextEx — Split-pane LaTeX editor with live PDF preview" width="900" />
</p>

## Key Features

| Feature | Description |
|---------|-------------|
| **Free & Local-First** | No account or cloud — your documents stay on your machine; first-time TeX support files may be downloaded |
| **Zero Setup** | Bundled Tectonic engine — no TeX installation required |
| **Live PDF Preview** | Auto-compile on save with instant split-pane preview |
| **Scroll Sync** | Bidirectional scroll synchronization between editor and PDF |
| **SyncTeX** | Ctrl+Click to jump between source code and PDF positions |
| **OmniSearch** | Unified search across citations, PDF content, and editor text |
| **Monaco Editor** | Syntax highlighting, auto-completion, snippets, Vim mode |
| **Multi-File Projects** | Sidebar file tree with generated outputs hidden, tab bar, `\input`/`\include` navigation |
| **Citations** | BibTeX auto-complete + Zotero integration |
| **Paper Preflight** | Citation provenance, duplicate warnings, and a deterministic submission check |
| **Research & AI** | Crossref/arXiv search plus native HTTP, Claude Code, and Codex CLI assistants |
| **Language & Project Tools** | Native LaTeX outline, completion, diagnostics, and one-click project launch in the system terminal |
| **Git Integration** | Built-in staging, commits, branch status, and confirmed Fetch/Pull/Push |
| **Export** | Create a clean Overleaf source ZIP or convert to DOCX, ODT, HTML, and EPUB via Pandoc |
| **7 Languages** | EN, KO, ES, FR, DE, PT, ZH |

> **Optional integrations:** AI API providers and online reference search require network
> access. Claude Code and Codex CLI features require the corresponding executable on `PATH`;
> the core editor and bundled Tectonic compiler remain local and work without them.

---

## Getting Started

<p align="center">
  <img src="docs/images/home-screen.png" alt="TextEx home screen with search bar, Open Folder, and New from Template" width="900" />
</p>

### 1. Download & Install

Grab the latest release from the [Releases page](https://github.com/Topasm/textex/releases/latest) or from [GitHub Actions](../../actions/workflows/build.yml) for development builds.

| Platform | File |
|----------|------|
| Windows x64 | `.exe` installer |
| macOS Apple Silicon (arm64) | arm64 `.dmg` |
| Linux x64 | `.AppImage` or `.deb` |

### 2. OS-Specific Setup

**macOS:**
Apps may be quarantined. After installing, run:
```bash
xattr -cr /Applications/TextEx.app
```
Or right-click the app > **Open** > **Open** in Gatekeeper.

Closing the main window hides it and preserves the active project, similar to
other document apps on macOS. Click the Dock icon to restore it; use **TextEx >
Quit TextEx** or `Cmd+Q` to exit the process.

**Linux:**
Make the AppImage executable:
```bash
chmod +x TextEx_*.AppImage
./TextEx_*.AppImage
```

---

## User Guide

### Creating a New Project
- **Open Folder**: Use **Open Folder** on the home screen to select a project directory.
- **Guided Demo Paper**: Create a disposable, compile-ready paper that walks through citations, Research Chat, submission checks, compiler switching, and Overleaf export.
- **Use Templates**: Use **New from Template** to start quickly with a pre-configured LaTeX template (article, beamer, thesis, letter, and more).
- **Learn TextEx**: Open the searchable in-app guide from the home screen, the native **Help** menu,
  the command palette, or `F1`. It documents trackpad gestures alongside their button and keyboard
  alternatives, and includes a persistent 3-minute checklist.

<p align="center">
  <img src="docs/images/template-gallery.png" alt="Template gallery with built-in LaTeX templates" width="900" />
</p>

### Multi-File Projects

Open any folder to get a full project view with sidebar file tree, tabs, and `\input`/`\include` navigation.
When there is no restorable session, TextEx opens a TeX document automatically:
root-level `main.tex`, root-level `root.tex`, then another `.tex` file in stable
project order.
Compiler outputs are kept in an engine-specific TextEx cache instead of beside
your sources. Use the eye button to reveal legacy generated files, or the
archive button to create a clean source ZIP for upload to Overleaf.

<p align="center">
  <img src="docs/images/sidebar-files.png" alt="Sidebar file tree with a multi-file LaTeX project" width="900" />
</p>

### Writing Your Document
TextEx features a modern Monaco-based editor with:
- **Syntax Highlighting**: LaTeX syntax coloring through Monaco's local tokenizer.
- **Auto-Completion**: Intelligent suggestions for commands, environments, labels, and citation keys.
- **Snippets**: Quickly insert common patterns (e.g., `begin`, `figure`, `table`).
- **Math Preview**: Lightweight, read-only KaTeX rendering while the cursor is inside `$...$` or `\[...\]`.
- **Paired prose workspace**: Draft in a focused Markdown projection beside a synchronized live
  rendering while `.tex` remains the canonical, safely round-tripped document.
- **Section Highlight**: Color-coded bands for `\section` headings in the gutter.
- **Visual Table Editor**: Click the CodeLens above any `tabular` to open a visual editor.

### Compiling & Previewing
- **Auto-Compile**: The PDF preview updates automatically when you save (`Ctrl+S`).
- **Manual Compile**: Press `Ctrl+Enter` to force a compilation at any time.
- **PDF View Modes**: Switch between continuous scroll and single-page view in Settings > Appearance.

### Scroll Sync

<p align="center">
  <img src="docs/images/settings-appearance.png" alt="Settings — Appearance tab with Scroll Sync, PDF view mode, and theme options" width="900" />
</p>

Enable **Scroll Sync** in Settings > Appearance to keep the editor and PDF aligned:
- Scrolling in the **editor** automatically scrolls the PDF to the matching content.
- Scrolling in the **PDF** automatically scrolls the editor to the corresponding source line.
- Uses a precomputed SyncTeX line map for instant lookups (no lag).
- Built-in feedback loop prevention — no bouncing or jittering.

### SyncTeX (Click-to-Jump)
- **Code to PDF**: Click the "Sync Code to PDF" toolbar button to highlight the current line in the PDF.
- **PDF to Code**: `Ctrl+Click` anywhere on the PDF to jump to the corresponding source line.

<p align="center">
  <img src="docs/images/synctex-highlight.png" alt="SyncTeX highlight showing source-to-PDF jump" width="900" />
</p>

### Inserting Images (Smart Drop & Paste)
- Simply **drag and drop** an image file from your computer directly into the editor, or
  **paste** a screenshot or copied image with `Ctrl+V` (`Cmd+V` on macOS).
- TextEx will automatically:
  1. Copy the image to an `images/` folder in your project. A pasted bitmap with no file name
     is saved as `pasted-YYYYMMDD-HHMMSS` plus the clipboard's own image extension.
  2. Insert a complete `\begin{figure} ... \end{figure}` snippet at the cursor.

### Managing Citations
- **BibTeX Support**: TextEx detects `.bib` files and auto-completes `\cite{...}` keys.
- **Citation Tooltips**: Hover over a citation in the PDF preview to see title, author, and year.
- **Zotero Integration**:
  1. Ensure Zotero with Better BibTeX is running.
  2. Open **References** in the right Research panel to search the project and Zotero together; Crossref/arXiv appears as an online fallback.
  3. Drag a paper into the editor, or use `/r`, `/z`, and `/o` in OmniSearch.
  4. Save online results to Zotero independently, or add them directly to the project bibliography.

### Productivity Tools

<p align="center">
  <img src="docs/images/omnisearch.png" alt="OmniSearch dialog with search results" width="900" />
</p>

- **OmniSearch**: Search across files, citations, and PDF text; use `/` for focused workflows and
  `>` for the same context-aware application commands exposed by the command palette.
- **Todo Panel**: Track writing tasks in the sidebar.
- **Notes Panel**: Track TODO items and keep project memos.
- **Timeline**: View local file history and revert to any previous save.
- **Git Panel**: Stage and commit locally, inspect upstream divergence, Fetch, or confirm safe Pull/Push operations. Pull requires a clean worktree and uses fast-forward only; TextEx never force-pushes.
- **AI Settings**: Choose a global default provider/model independently from API-key and CLI connection setup. Research Chat can override that target for one conversation without changing the global default.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + S` | Save |
| `Ctrl/Cmd + Enter` | Compile |
| `Ctrl/Cmd + L` | Toggle log panel |
| `Ctrl/Cmd + B` | Toggle sidebar |
| `Ctrl/Cmd + F` | Find in current document |
| `Ctrl/Cmd + Shift + C` | Search citations |
| `Ctrl/Cmd + Shift + F` | Search PDF text |
| `Shift + Alt + F` | Format document |
| `Ctrl/Cmd + 0` | Fit PDF to width |
| `Ctrl/Cmd + 9` | Fit PDF to height |

---

## Documentation

- [Development Guide](docs/DEVELOPMENT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [File Structure](docs/FILE_STRUCTURE.md)
- [IPC Specification](docs/IPC_SPEC.md)
- [Tech Stack](docs/TECH_STACK.md)
- [UI Specification](docs/UI_SPEC.md)
- [Settings Reference](docs/SETTINGS.md)
- [Packaging](docs/PACKAGING.md)
- [Zotero Integration](docs/ZOTERO.md)
- [Research Profile & Chat](docs/RESEARCH_PROFILE.md)
- [CLI Reference](docs/CLI.md)
- [MCP Server](docs/MCP.md)
- [Licenses](docs/LICENSES.md)
- [TODO / Status](docs/TODO.md)

## Open-Source Notices

Bundled notice artifacts live in `resources/licenses/`, including npm and Rust
dependency notices plus the Tectonic license files.
[docs/LICENSES.md](docs/LICENSES.md) is a human-readable summary, not the full
bundled notice set.

## License

[MIT](LICENSE)
