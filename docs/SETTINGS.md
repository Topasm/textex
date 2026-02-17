# Settings & Formatting

## Configuration System

TextEx uses a "Zero-Friction" configuration system where settings are applied instantly and persisted automatically.

### Storage
- **Mechanism**: `localStorage` via `zustand/middleware/persist`.
- **Key**: `textex-storage`
- **Scope**: Settings are global across the application.

### Settings Schema (`UserSettings`)

| Key | Type | Default | Description |
|---|---|---|---|
| `theme` | `'system' \| 'light' \| 'dark'` | `'system'` | UI and Editor theme. |
| `fontSize` | `number` | `14` | Editor font size in pixels. |
| `autoCompile` | `boolean` | `true` | Compile automatically on type (debounced). |
| `formatOnSave` | `boolean` | `false` | Run formatter when saving files. |
| `wordWrap` | `boolean` | `true` | Soft wrap lines in the editor. |
| `minimap` | `boolean` | `false` | Show code minimap. |
| `spellCheckEnabled` | `boolean` | `true` | Enable inline spell checking. |
| `spellCheckLanguage` | `string` | `'en-US'` | Hunspell dictionary language. |
| `gitEnabled` | `boolean` | `true` | Enable Git integration features. |
| `autoUpdateEnabled` | `boolean` | `true` | Check for updates on startup. |
| `lspEnabled` | `boolean` | `true` | Enable TexLab language server. |

### Settings Modal
The `SettingsModal` component provides a user-friendly interface for modifying these values. It is accessible via the gear icon in the Toolbar.

## Code Formatting

TextEx integrates [Prettier](https://prettier.io/) for opinionated, consistent LaTeX code formatting.

### Engine
- **Library**: `prettier/standalone`
- **Plugin**: `prettier-plugin-latex`
- **Execution**: Runs in the renderer process (async).

### Usage
- **Manual**: Press `Shift+Alt+F` (or `Shift+Option+F` on macOS) to format the current document.
- **On Save**: Enable "Format on Save" in settings to automatically format whenever you save the file (`Ctrl+S`).

## Syntax Highlighting

TextEx features **Semantic Highlighting** powered by the TexLab language server.

- **Standard**: Basic keyword and comment coloring via Monaco's built-in tokenizer.
- **Semantic**: Rich coloring for macros, environments, math modes, and citations based on the language server's understanding of the code structure.
- **Theme**: Adapts to the selected application theme (Light/Dark/High-Contrast).
