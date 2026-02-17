# TextEx

[![Build Status](https://github.com/Topasm/textex/actions/workflows/build.yml/badge.svg)](https://github.com/Topasm/textex/actions/workflows/build.yml)

A self-contained desktop LaTeX editor built on Electron. TextEx provides a split-pane interface with a Monaco code editor on the left and live PDF preview on the right. It comes with a bundled [Tectonic](https://tectonic-typesetting.github.io/) engine, so you **do not** need to install TeX Live, MiKTeX, or any other TeX distribution.

## Getting Started

### 1. Download & Install

Grab the latest build from [GitHub Actions](../../actions/workflows/build.yml).

| Platform | Artifact | File |
|----------|----------|------|
| Linux x64 | TextEx-linux | `.AppImage` |
| macOS Intel | TextEx-mac-x64 | `.dmg` |
| macOS Apple Silicon | TextEx-mac-arm64 | `.dmg` |
| Windows x64 | TextEx-win | `.exe` installer |

### 2. OS-Specific Setup

**macOS:**
Apps may be quarantined. After installing, run:
```bash
xattr -cr /Applications/TextEx.app
```
Or right-click the app > **Open** > **Open** in Gatekeeper.

**Linux:**
Make the AppImage executable:
```bash
chmod +x TextEx-1.0.0.AppImage
./TextEx-1.0.0.AppImage
```

---

## User Guide

### 1. Creating a New Project
-   **Open Folder**: Click **File > Open Folder** to select a directory for your project.
-   **Use Templates**: Use **File > New from Template** (`Ctrl+Shift+N`) to start quickly with a pre-configured LaTeX template.

### 2. Writing Your Document
TextEx features a modern Monaco-based editor with:
-   **Syntax Highlighting**: Full LaTeX syntax support.
-   **Auto-Completion**: Intelligent suggestions for commands and environments.
-   **Snippets**: Quickly insert common patterns (e.g., `begin`, `figure`, `table`).

### 3. Inserting Images (Smart Drop)
-   Simply **drag and drop** an image file from your computer directly into the editor.
-   TextEx will automatically:
    1.  Copy the image to an `images/` folder in your project.
    2.  Insert the standard LaTeX `\begin{figure} ... \end{figure}` code snippet.

### 4. Compiling & Previewing
-   **Live Preview**: The PDF preview updates automatically as you type.
-   **Manual Compile**: Press `Ctrl+Enter` to force a compilation.
-   **Sync**:
    -   **Code to PDF**: `Ctrl+Click` in the editor to jump to that location in the preview.
    -   **PDF to Code**: `Ctrl+Click` on the PDF preview to jump to the corresponding code line.
    -   **PDF Search**: Press `Ctrl+F` in the preview pane to search within the PDF.

### 5. Managing Citations
-   **BibTeX Support**: TextEx automatically detects `.bib` files in your project and consistently auto-completes citation keys (`\cite{...}`).
-   **Zotero Integration**:
    1.  Ensure Zotero is running.
    2.  Press `Ctrl+Shift+Z` to search your Zotero library.
    3.  Select a paper to insert its citation key and automatically add the entry to your bibliography file.

### 6. Using AI Assistant
-   Click the **AI Draft** button in the toolbar or press `Ctrl+Shift+D`.
-   Enter your prompt to generate LaTeX content (e.g., "Write an abstract for a paper about quantum computing").
-   *Note: Requires an OpenAI or Anthropic API key in Settings.*

### 7. Productivity Tools
-   **Todo List**: Keep track of writing tasks in the "Todo" sidebar panel.
-   **Memo**: Use the "Memo" panel for quick scratchpad notes.
-   **Visual Table Editor**: Right-click on a table environment to open the visual editor.
-   **MathLive Editor**: Open the visual math editor to construct complex equations seamlessly.
-   **Local History**: Right-click a file in the explorer to view "Local History" and revert changes if needed.

---

## Key Features

- **No Setup Required:** Tectonic engine included.
- **Offline Capable:** Works without internet (after initial package download).
- **Multi-File Projects:** Sidebar file tree for managing large documents.
- **Export Options:** Convert to Word, HTML, and Markdown.
- **Git Integration:** Built-in version control support.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + O` | Open file |
| `Ctrl/Cmd + S` | Save |
| `Ctrl/Cmd + Enter` | Manual compile |
| `Ctrl/Cmd + L` | Toggle log panel |
| `Ctrl/Cmd + B` | Toggle sidebar |
| `Ctrl/Cmd + Shift + Z` | Zotero Search |
| `Ctrl/Cmd + Shift + D` | AI Draft |
| `Shift + Alt + F` | Format document |

## Documentation Reference

- [Development Guide](docs/DEVELOPMENT.md)
- [CLI Reference](docs/CLI.md)
- [Zotero Integration](docs/ZOTERO.md)
- [MCP Server](docs/MCP.md)

## License

[MIT](LICENSE)
