# Settings & Formatting

## Configuration System

TextEx uses a "Zero-Friction" configuration system where settings are applied instantly and persisted automatically.

### Storage
- **Mechanism**: `localStorage` via `zustand/middleware/persist`.
- **Key**: `textex-settings-v2`
- **Native mirror**: Settings other than recent-project and renderer-session data are
  mirrored through the typed Tauri settings API.
- **Startup hydration**: The renderer loads the native settings snapshot once, then
  hydrates the settings store and renderer-session stores in parallel before the first
  React mount. A failed native read is not followed by a renderer-to-native write.
- **AI credentials**: API keys are never persisted in `localStorage` or the general
  settings mirror. Rust stores them separately with owner-only permissions on Unix.
- **Scope**: Settings are global across the application.

### Selected Settings Schema (`UserSettings`)

| Key | Type | Default | Description |
|---|---|---|---|
| `theme` | `'system' \| 'light' \| 'dark' \| 'high-contrast' \| 'glass'` | `'system'` | UI and Editor theme. |
| `fontSize` | `number` | `14` | Editor font size in pixels. |
| `autoCompile` | `boolean` | `true` | Compile automatically on type (debounced). |
| `watchOpenFiles` | `boolean` | `true` | Watch open project files for external changes. |
| `formatOnSave` | `boolean` | `true` | Run formatter when saving files. |
| `wordWrap` | `boolean` | `true` | Soft wrap lines in the editor. |
| `spellCheckEnabled` | `boolean` | `false` | Enable inline spell checking. |
| `spellCheckLanguage` | `string` | `'en-US'` | Hunspell dictionary language. |
| `gitEnabled` | `boolean` | `true` | Enable Git integration features. |
| `autoUpdateEnabled` | `boolean` | `true` | Check for updates on startup. |
| `zoteroEnabled` | `boolean` | `false` | Enable Zotero/Better BibTeX integration. |
| `zoteroPort` | `number` | `23119` | Zotero Local API and Better BibTeX port. |
| `zoteroCollection` | `string` | `""` | Better BibTeX pull-export collection path used for project bibliography sync. |
| `pdfInvertMode` | `boolean` | `false` | Invert PDF colors for dark environments. |
| `autoHideSidebar` | `boolean` | `false` | Sidebar slides away and reappears on hover. |
| `aiProvider` | `'' \| 'openai' \| 'anthropic' \| 'gemini' \| 'claude-cli' \| 'codex-cli'` | `''` | Native HTTP or isolated CLI provider used by AI actions. |
| `aiModel` | `string` | `''` | Model identifier for the selected AI provider. |

### Settings Modal
The `SettingsModal` component provides a tabbed interface (800×500) for modifying these values. It is accessible via the gear icon in the Toolbar. Modal chrome uses shared `.modal-*` classes. Settings tabs compose the typed `SettingsSection`, `SettingsRow`, `SettingsToggleRow`, `SettingsSelect`, and `SettingsSegmentedControl` primitives, with their common layout in `styles/settings.css`. Feature-specific legacy styles remain in `styles/index.css` until their tabs adopt the shared controls.

**Visible Tauri tabs:**
- **General** — Interface language, update policy, and application information
- **Appearance** — Theme and PDF display controls. PDF color inversion is an
  independent preference and is never overwritten by changing the application theme.
- **Editor** — Typography, formatting, layout, and Monaco behavior
- **AI** — Default execution target, independent provider connections, reasoning, and prompt controls
- **Integrations** — Zotero and Git
- **Automation** — Auto Compile, external-file watching, Spell Check, and Tectonic cache controls

The displayed application version is injected from `package.json` by Vite, so the
settings footer does not maintain a separate release-version literal.

The AI tab follows a target-and-connections model: choosing a default provider/model does
not modify credentials, and configuring a credential or inspecting a CLI does not silently
change the default target. Cloud API and local CLI connections are checked together. Research
Chat can override the default target for one conversation without modifying global settings.
Custom model identifiers remain available through an explicit advanced choice.

Claude Code and Codex CLI controls require their corresponding executables; the
editor reports discovery/startup errors without falling back to a Node backend. Direct API
reasoning controls do not claim to configure reasoning inside CLI agents.

## Code Formatting

TextEx integrates [Prettier](https://prettier.io/) for opinionated, consistent LaTeX code formatting.

### Engine
- **Library**: `prettier/standalone`
- **Plugin**: `prettier-plugin-latex`
- **Execution**: Prettier and the LaTeX plugin are lazy-loaded in a singleton module
  Worker. A direct lazy formatter is used only when the Worker is unavailable or fails;
  both paths return the original source if formatting cannot be completed.

### Usage
- **Manual**: Press `Shift+Alt+F` (or `Shift+Option+F` on macOS) to format the current document.
- **On Save**: Enable "Format on Save" in settings to automatically format whenever you save the file (`Ctrl+S`).

## Syntax Highlighting

TextEx currently highlights LaTeX with its local Monaco Monarch tokenizer.

- **Standard**: Commands, environments, comments, delimiters, and math receive local syntax coloring.
- **Sections**: Optional section bands use the configurable section color palette.
- **Theme**: Coloring adapts to the selected application theme.
- **Language features**: TextEx uses its built-in Monaco providers, package/reference
  indexes, Rust outline parser, and structured compiler diagnostics. No external language
  server is started.
