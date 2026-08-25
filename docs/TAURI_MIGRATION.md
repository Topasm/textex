# Tauri Migration Record

The desktop-runtime migration is complete: Tauri 2 is the only supported TextEx
desktop shell. The Electron main process, preload bridge, packaging files,
dependencies, and release workflow were removed in August 2026.
The temporary migration branch has been retired; `main` is the only maintained
desktop-runtime line.

The renderer retains a typed `DesktopApi` so UI code stays independent of Tauri
transport details. This is an architectural boundary, not a second-runtime
abstraction.

## Native capability status

Implemented in Rust: project filesystem, atomic saves, watcher/index, settings
and sessions, Tectonic scheduling, PDF bytes, SyncTeX, Git, templates, history,
project metadata, bibliography/Zotero, spellcheck, export, updater, external
links, and performance memory sampling.
Native AI HTTP/credential handling, isolated Claude Code/Codex CLI
transformations, TexLab/LSP lifecycle and bounded JSON-RPC streaming, and safe
system-terminal launch are also implemented. TextEx does not embed a PTY.
TexLab and the AI CLIs remain optional external tools. Do not reintroduce a
Node.js desktop backend as a fallback.

Historical migration details can be recovered from Git history. Current design,
development, packaging, and release instructions live in the corresponding
authoritative documents under `docs/`.
