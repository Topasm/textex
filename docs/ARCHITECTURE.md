# TextEx System Architecture

TextEx is a Tauri 2 desktop application with one React renderer and one Rust
native backend. Tectonic is bundled as a sidecar. The CLI and MCP server remain
standalone Node.js processes and reuse pure modules under `src/shared/`.

## Runtime boundary

```text
React / Monaco / PDF.js
        |
        | typed window.api (DesktopApi)
        v
renderer/platform/tauriApi.ts
        |
        | Tauri invoke + Channel
        v
src-tauri/src/commands/*       thin request adapters
        |
        v
src-tauri/src/services/*       filesystem, compile, index, Git, SyncTeX, ...
        |
        +---- Tectonic sidecar
        +---- project files and .textex metadata
        +---- OS dialogs, updater, and external URL opener
```

UI components and feature hooks do not import `@tauri-apps/api` directly. The
adapter is installed before React mounts and rejects browser-only execution.
Command names live in `src/shared/tauriCommands.ts`; request/response types live
in shared TypeScript contracts and Rust models.

## Renderer ownership

- Monaco models own editable document text.
- `DocumentModel` owns document identity, revision, and saved revision.
- `DocumentRegistry` binds file paths to models and materializes text only for
  save, compile, and full-document analysis.
- Domain Zustand stores own UI metadata, never a second canonical document
  string. Components use fine-grained selectors.
- Async compile, PDF, outline, watcher, and index results publish only when
  their document revision or generation is still current.

## Native ownership

Tauri commands are grouped by domain and delegate to services. `AppState` holds
the active canonical project root and native service state. Every path-bearing
operation validates absolute paths, canonical containment, symlinks, file type,
and size before reading or writing. Multi-file writes use staged files and
atomic replacement where the platform permits it.

The project index scans metadata without materializing file contents, excludes
hidden/noisy/symlinked trees, and applies watcher deltas by generation. FileTree
and PDF pages virtualize their DOM output.

## Compilation pipeline

1. The renderer snapshots the active `DocumentModel` revision.
2. The snapshot is saved and marked clean only if that exact revision remains
   current.
3. The renderer submits a typed compile request with document and revision IDs.
4. Rust resolves the magic root, schedules Tectonic with latest-wins priority,
   and streams bounded log/diagnostic events through a Tauri `Channel`.
5. Only a matching response becomes the pending PDF generation.
6. The preview swaps generations after the target page is ready, preserving the
   currently displayed PDF during compilation and rendering.

## Security model

- Tauri global injection is disabled; only imported APIs are used.
- The main window receives a generated allow-list of application commands.
- CSP blocks remote scripts, arbitrary connections, frames, and objects.
- External URLs are limited to `https`, `http`, and `mailto` and are opened
  without a shell.
- Zotero traffic is loopback-only with redirect, timeout, and size limits.
- ZIP templates reject traversal, links, excessive entries, and decompression
  limits.
- The updater requires an embedded public key and signed platform artifacts.
- AI API keys are migrated out of renderer/local settings into a mode-0600
  native credential file. Transformation CLIs run in an app-cache workspace;
  Claude tools are disabled and Codex uses read-only/no-approval isolation.
- System terminal launch receives the trusted active-project root from native state and
  passes it as an OS argument without shell interpolation.

## CLI and MCP

`src/cli/` and `src/mcp/` are not desktop backends. They use Node.js only in
their own processes and reuse pure compiler, parser, and export modules from
`src/shared/`. No renderer or Tauri module may be imported into shared code.

## Current capability scope

Filesystem, compilation, PDF delivery, SyncTeX, Git, templates, settings,
history, bibliography/Zotero and online research, spellcheck, export, updater,
performance sampling, AI provider/CLI execution, and safe system-terminal launch
are implemented through the native backend. TextEx does not embed a PTY, terminal
emulator, or external language-server process.

On macOS a normal main-window close is a hide operation. The Dock reopen event
restores the existing window and renderer state. Explicit Quit remains a
separate lifecycle path that confirms dirty documents and closes the active
native project before process exit. Windows and Linux close the window and exit.
