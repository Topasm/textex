# Compiler Service

The desktop compiler is implemented in Rust under
`src-tauri/src/services/compiler.rs`. The Tauri command adapter accepts a typed
`CompileRequest` containing request, document, revision, file, and priority
identity. Native settings select either the bundled Tectonic engine (the
default) or a system pdfLaTeX installation driven by `latexmk`.

## Invariants

- The input and resolved magic-root file must remain inside the active project.
- Only `.tex` project files are accepted.
- Tectonic is the target-qualified bundled sidecar verified by the setup
  manifest.
- System pdfLaTeX mode resolves `latexmk` from standard installation paths and
  `PATH`. On macOS it checks MacTeX's stable
  `/Library/TeX/texbin/latexmk` path first so Finder-launched builds do not
  depend on an interactive shell environment.
- The pdfLaTeX invocation uses `latexmk -norc -g -pdf` with SyncTeX, nonstop,
  file-line-error, and halt-on-error flags. Ignoring latexmkrc files prevents a
  project XeLaTeX or LuaLaTeX override from defeating the selected engine, and
  `-g` guarantees that switching from Tectonic regenerates the PDF even when
  the source timestamps have not changed.
- Both engines write PDFs and auxiliary files outside the project under the
  application cache at `build/<project-hash>/<engine>/<root-file-hash>/`.
  Tectonic and pdfLaTeX use separate engine directories, and root documents
  with the same filename use separate document directories, so PDF, AUX,
  SyncTeX, and incremental state cannot cross-contaminate.
- The PDF preview reads only the current project's compiled PDF cache through a
  dedicated bounded native command. AUX content used for references and
  SyncTeX data is returned or registered from the same build directory instead
  of being read from the source tree.
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

The file tree hides legacy LaTeX-generated files in the project by default and
offers a visibility toggle for inspecting them. New desktop builds no longer
place those artifacts beside the sources. The file-tree Overleaf export action
creates a source ZIP that omits generated outputs, private VCS/application
metadata, and transient compiler files while retaining project build
configuration, submission `.bbl` files, and PDF source assets.

The standalone CLI and MCP server use `src/shared/compiler.ts` in their own
Node.js processes. That implementation is intentionally separate from the
desktop command transport but shares document parsing and Tectonic conventions.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the end-to-end pipeline and
[IPC_SPEC.md](IPC_SPEC.md) for command registration rules.
Seed staging and package smoke details are in [PACKAGING.md](PACKAGING.md).
