# Development

## Prerequisites

- Node.js from `.nvmrc`
- Rust 1.97.1
- Platform prerequisites required by Tauri 2
- On Linux: WebKitGTK 4.1, appindicator, librsvg, patchelf, and xdg-utils

## Setup and development

```bash
npm ci
npm run setup:tauri
npm run dev
```

`npm run dev` starts the Tauri shell and Vite renderer. `npm run dev:web` is a
renderer build aid only; opening it in a normal browser is expected to fail the
desktop-runtime check.

## Linux container prerequisites

`scripts/tauri-linux-container.sh` provides the GTK/WebKit build dependencies when
these are unavailable on the host. Rootless Podman also needs usable subordinate
UID/GID mappings and a supported storage filesystem. If image extraction fails
with `lsetxattr: operation not supported` on network storage, use local container
storage. A successful `podman run ... id` alone does not establish build support:
package installation can still fail with `chown: Invalid argument` when user/group
IDs cannot be mapped. Configure the build host's rootless mappings or run on a
host with the native prerequisites; do not count these setup failures as passing
Rust tests. The `Tauri Rust Test & Licenses` CI job runs the locked tests and
Clippy with Linux dependencies installed.

## Verification

```bash
npm run check              # TypeScript, ESLint, Prettier, Rust format
npm run test               # Vitest
npm run test:workflow      # Focused cross-component paper/Git workflows
npx playwright install chromium
npm run test:browser       # Production-bundled PDF/Monaco/Markdown regression tests
npm run pre-commit         # Full local JavaScript/TypeScript gate
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo clippy --locked --manifest-path src-tauri/Cargo.toml -- -D warnings
npm audit
```

Run the focused test for a changed behavior first. Native changes should include
Rust tests near the service; renderer contracts and orchestration should include
Vitest tests under `src/__tests__/`.

`test:browser` uses the production Vite configuration, real PDF.js and Monaco
workers, PDF text/annotation layers, and deterministic PDF fixtures. It checks
zoom frame continuity, source selection, Markdown selection, and PDF generation
replacement, plus full-document search across 24 pages in continuous and single-page
views, including repeated occurrences. Only the native file/SyncTeX responses are stubbed. These Chromium
tests run in the `PDF Browser Regression` workflow; they do not replace packaged
Tauri tests on Windows, macOS, or Linux. Install Playwright's system dependencies
with `npx playwright install --with-deps chromium` on a supported Linux host.

## Dependency compatibility

- Vite 8 uses Rolldown code splitting and the default Oxc minifier. React's
  CommonJS dependencies (`scheduler` and `use-sync-external-store`) stay in the
  React chunk to avoid circular initialization through the app entry.
- `pdfjs-dist` is pinned to 6.3.289. The React-PDF override references that same
  dependency with `$pdfjs-dist`, keeping the viewer and worker on one version.
  React-PDF 10.5.0 declares PDF.js 5.4.296 upstream; the override is a deliberately
  tested compatibility choice, not an upstream compatibility guarantee. Run
  browser regression tests before changing either package, then verify native
  platform builds before release.
- TypeScript remains on 6.0: `typescript-eslint` 8.69 supports TypeScript below
  6.1. ESLint remains on 9: `eslint-plugin-react` 7.37.5 does not declare ESLint 10
  support. Revisit these major upgrades when their peer ranges support them;
  do not bypass peer checks with forced installs.
- After dependency changes, run `npm ci`, `npm audit`,
  `npm run licenses:generate`, the local gate, browser tests, and renderer bundle
  checks. Review changes under `resources/licenses/`.

## Builds

```bash
npm run build              # Tauri release binary, no installer
npm run build:web          # Renderer only
npm run build:cli
npm run build:mcp

npm run package:linux
npm run package:mac        # Apple Silicon
npm run package:win
```

Linux builds can be reproduced in the supplied Podman image with
`npm run build:container`.

## Native command changes

Follow the checklist in [IPC_SPEC.md](IPC_SPEC.md). Keep commands small, validate
at the service boundary, register capabilities, and update both Rust and
TypeScript contract tests.

## Performance

```bash
npm run build:web
npm run measure:renderer
npm run measure:runtime -- run-1.json run-2.json
```

Use fixed fixtures and record the commit, OS, CPU, display scale, Tectonic cache
state, project size, and PDF page count. See [EDITOR_ARCHITECTURE.md](EDITOR_ARCHITECTURE.md).

Markdown source attribution uses exact line matching in `src/shared/lineMatches.ts`.
Common prefixes and safe suffixes are removed before comparison. For the remaining
`r × c` lines, scores occupy one `Uint32Array` row and reconstruction directions
occupy one bit per cell (rounded to bytes per row), preserving skip-left ties for
repeated lines. This reduces comparison storage from roughly `4rc` to `rc/8 + 4c`
bytes; worst-case comparison time remains quadratic. Regression tests compare
exact match pairs against the original algorithm, including repeated lines and
byte boundaries.
