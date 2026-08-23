# TextEx Contributor Notes

TextEx is a Tauri-only React, Rust, and TypeScript desktop LaTeX editor.

Follow [AGENTS.md](AGENTS.md) for commands, architecture boundaries, testing,
and release guardrails. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the
runtime model and [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for setup.

The renderer must use the typed `window.api` contract installed by
`src/renderer/platform/tauriApi.ts`. Native work belongs behind validated Tauri
commands and domain services in `src-tauri/src/`; do not add a second desktop
runtime or direct native imports to UI code.
