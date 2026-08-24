# Compiler Service

The desktop compiler is implemented in Rust under
`src-tauri/src/services/compiler.rs`. The Tauri command adapter accepts a typed
`CompileRequest` containing request, document, revision, file, and priority
identity.

## Invariants

- The input and resolved magic-root file must remain inside the active project.
- Only `.tex` project files are accepted.
- Tectonic is the target-qualified bundled sidecar verified by the setup
  manifest.
- The optional curated support cache is versioned for the bundled Tectonic,
  bounded by file/count/total limits, SHA-256 verified, and atomically installed
  only into the application cache on first use.
- A missing, empty, invalid, or incomplete seed never blocks compilation. The
  compiler emits an explicit cache status log and lets Tectonic fetch uncached
  support files through its existing network fallback.
- Typed cache-status and reset commands expose seed/cache paths, file counts,
  byte totals, readiness, and integrity in Settings. Status verification hashes
  packaged and installed seed files. Reset accepts no renderer path, atomically
  backs up only TextEx's app-cache `tectonic` directory, rebuilds it, and restores
  the backup if rebuilding fails.
- Queue priority, latest-wins coalescing, cancellation, timeout, and bounded
  stdout/stderr prevent obsolete work from blocking current edits.
- Log and diagnostic events retain request/document/revision identity.
- A stale response cannot replace the current PDF generation.
- Output paths and SyncTeX inputs are validated before being returned.

The standalone CLI and MCP server use `src/shared/compiler.ts` in their own
Node.js processes. That implementation is intentionally separate from the
desktop command transport but shares document parsing and Tectonic conventions.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the end-to-end pipeline and
[IPC_SPEC.md](IPC_SPEC.md) for command registration rules.
Seed staging and package smoke details are in [PACKAGING.md](PACKAGING.md).
