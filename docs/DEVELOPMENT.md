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

## Verification

```bash
npm run check              # TypeScript, ESLint, Prettier, Rust format
npm run test               # Vitest
npm run test:workflow      # Focused cross-component paper/Git workflows
npm run pre-commit         # Full local JavaScript/TypeScript gate
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo clippy --locked --manifest-path src-tauri/Cargo.toml -- -D warnings
npm audit
```

Run the focused test for a changed behavior first. Native changes should include
Rust tests near the service; renderer contracts and orchestration should include
Vitest tests under `src/__tests__/`.

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
`npm run build:tauri:container`.

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
