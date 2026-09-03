# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

TextEx is a Tauri-only React, Rust, and TypeScript desktop LaTeX editor.

Follow [AGENTS.md](AGENTS.md) for commands, architecture boundaries, testing,
and release guardrails. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the
runtime model and [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for setup.

The renderer must use the typed `window.api` contract installed by
`src/renderer/platform/tauriApi.ts`. Native work belongs behind validated Tauri
commands and domain services in `src-tauri/src/`; do not add a second desktop
runtime or direct native imports to UI code.

## Running a single test

- Vitest by file: `npx vitest run src/__tests__/path/to/File.test.tsx`
- Vitest by name: `npx vitest run -t "test name substring"`
- Rust by name: `cargo test --locked --manifest-path src-tauri/Cargo.toml <test_name>`

## Architecture in one pass

The runtime boundary is one-directional and enforced by tests, not just
convention:

```
React/Monaco/PDF.js → window.api (DesktopApi, src/renderer/platform/tauriApi.ts)
  → Tauri invoke/Channel → src-tauri/src/commands/* (thin adapters)
  → src-tauri/src/services/* (validated domain logic) → Tectonic sidecar / filesystem / Git
```

Adding a native capability touches four places in lockstep: command name in
`src/shared/tauriCommands.ts`, the `DesktopApi` method in
`src/renderer/platform/tauriApi.ts`, the Rust handler in
`src-tauri/src/commands/*` (delegating to a service, not embedding logic),
and capability registration in `src-tauri/src/lib.rs` + `src-tauri/build.rs`.
`src/shared/appError.ts` mirrors the Rust `AppError` code table in
`src-tauri/src/error.rs`; `appErrorParity.test.ts` fails if they drift.

`src/shared/` is the reuse layer for the desktop app, the standalone `src/cli/`,
and the standalone `src/mcp/` server — it must stay free of React, Tauri, and
Node-only imports so all three can depend on it.

Document identity is layered, not a single string: Monaco models hold editable
text, `DocumentModel` (src/renderer/models/) owns identity/revision/saved
revision, `DocumentRegistry` binds paths to models and only materializes text
for save/compile/analysis. Compilation is revision-gated end to end — a save
only marks clean if its revision is still current, a compile request carries
document+revision IDs, and async compile/PDF/outline/index results are dropped
if the originating revision or generation is stale by the time they resolve.
This pattern (check current revision/generation before applying an async
result) recurs across compile, PDF preview, and index code and is the main
source of subtle renderer bugs if skipped in new async flows.

Every path-bearing native operation (filesystem, compiler, Git, templates,
history, integrations) validates absolute paths, canonical project-root
containment, and symlinks before touching disk — preserve this for new
services rather than trusting renderer-supplied paths.
