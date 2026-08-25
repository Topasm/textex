# Implementation Status

## Current priorities

1. Add packaged-app end-to-end smoke tests for edit/save/compile/PDF/restart,
   system-terminal launch, AI credential migration, and the
   macOS close/hide/Dock-reopen/Quit lifecycle.
2. Add macOS Developer ID/notarization and Windows Authenticode credentials to
   the protected release environment.
3. Extend the renderer bundle CI budget into deterministic runtime startup,
   input-to-frame, and edit-to-PDF budgets.
4. Continue splitting large filesystem, compiler, FileTree, and OmniSearch
   modules along tested responsibility boundaries.

## Completed architectural work

- Tauri-only desktop runtime and packaging
- Typed renderer/native API boundary
- Rust project-root and symlink containment
- Revision-aware documents and latest-wins compilation
- Virtualized file tree and PDF generations
- Tauri updater with signed multi-platform release metadata
- Native AI HTTP/CLI, research, and safe system-terminal launch
- macOS close-to-hide with explicit, dirty-aware application quit
- Split Zustand stores with fine-grained selectors
