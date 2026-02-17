# TextEx

A self-contained desktop LaTeX editor built on Electron. TextEx provides a split-pane interface with a Monaco code editor on the left and live PDF preview on the right. It comes with a bundled [Tectonic](https://tectonic-typesetting.github.io/) engine, so you **do not** need to install TeX Live, MiKTeX, or any other TeX distribution.

## Features

- **Live Preview:** See your PDF update automatically as you type.
- **No Setup Required:** Everything is included—no need to install TeX Live or MiKTeX.
- **Modern Editor:** Syntax highlighting, auto-completion, and snippets.
- **Multi-File Projects:** Manage complex documents with a sidebar file tree.
- **Bibliography Management:** Built-in BibTeX support with citation auto-completion.
- **Export Options:** Convert your work to Word, HTML, and more.
- **Cross-Platform:** Works on Windows, macOS, and Linux.
- **Git Integration:** Version control built right in.

## Download

Grab the latest build from [GitHub Actions](../../actions/workflows/build.yml).

| Platform | Artifact | File |
|----------|----------|------|
| Linux x64 | TextEx-linux | `.AppImage` |
| macOS Intel | TextEx-mac-x64 | `.dmg` |
| macOS Apple Silicon | TextEx-mac-arm64 | `.dmg` |
| Windows x64 | TextEx-win | `.exe` installer |

### macOS note
Apps may be quarantined. After installing, run:
```bash
xattr -cr /Applications/TextEx.app
```
Or right-click the app > **Open** > **Open** in Gatekeeper.

### Linux note
Make the AppImage executable:
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
| `Shift + Alt + F` | Format document |

## Documentation

For advanced usage and development:

- [Development Guide](docs/DEVELOPMENT.md) — Build instructions and dev workflow.
- [CLI Reference](docs/CLI.md) — Headless compilation and project tools.
- [MCP Server](docs/MCP.md) — AI assistant integration details.
- [Architecture](docs/ARCHITECTURE.md) — System design and implementation details.
- [Licenses](docs/LICENSES.md) — Third-party license information.

## License

[MIT](LICENSE)
