# TextEx Agent Guide

## Project

TextEx is a Tauri 2, React, Rust, and TypeScript desktop LaTeX editor. Tauri is
the only desktop runtime. Renderer code accesses native capabilities only
through the typed `DesktopApi` adapter and never imports Node.js or Tauri APIs
from components and feature hooks directly.

## Commands

- Install locked dependencies with `npm ci`.
- Run fast verification with `npm run check`; it does not run tests.
- Run the full local gate with `npm run pre-commit`.
- Run individual checks with `npm run typecheck`, `npm run lint`,
  `npm run format:check`, `npm run test`, and `npm run format:rust:check`.
- Run Rust tests and lints with `cargo test --locked --manifest-path
  src-tauri/Cargo.toml` and `cargo clippy --locked --manifest-path
  src-tauri/Cargo.toml -- -D warnings`.
- Build with `npm run build`; package with `npm run package:linux`,
  `npm run package:mac`, or `npm run package:win`.
- Build the CLI and MCP server with `npm run build:cli` and `npm run build:mcp`.
- Follow [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) for every
  version, packaging, tag, or release change.

## Architecture Rules

- Define Tauri command names in `src/shared/tauriCommands.ts`, expose them
  through `src/renderer/platform/tauriApi.ts`, and register them in
  `src-tauri/src/lib.rs` plus `src-tauri/build.rs` capabilities.
- Keep Tauri command handlers thin; put native logic in domain services under
  `src-tauri/src/services/`.
- Keep `src/shared/` free of Tauri, React, and renderer imports so the desktop
  app, CLI, and MCP server can reuse pure contracts and parsers.
- Use fine-grained Zustand selectors. Do not recreate the removed monolithic
  `useAppStore`.
- Preserve project-root and symlink containment checks for every filesystem,
  compiler, Git, template, history, and integration operation.
- Account for Windows case-insensitive paths when naming adjacent files and
  directories.

## Working Agreements

- Preserve unrelated working-tree changes and keep changes narrowly scoped.
- Add or update tests when behavior changes, then run focused tests before the
  full check suite.
- Use shared constants and typed interfaces instead of cross-boundary string
  literals.
- Update documentation when commands, packaging, native behavior, or public
  integrations change.
- Never copy personal access tokens, updater signing keys, or platform signing
  certificates into the repository or chat history.

## Dependency Guardrails

- Keep `package.json` and `package-lock.json` in sync and verify dependency
  changes with `npm ci` and `npm audit`.
- Run `npm run licenses:generate` when dependency or license data changes and
  review `resources/licenses/`.
- Keep `Cargo.toml` and `Cargo.lock` synchronized and use locked Cargo commands
  in CI.

## Release and Packaging Guardrails

- A `v*` tag creates a public GitHub Release. Do not create or push a tag while
  testing release changes.
- Push the release commit to `main` first and wait for the complete
  `Build & Package` workflow to pass on Linux x64, Windows x64, and macOS
  arm64. Only then create the version tag.
- Keep the version synchronized in `package.json`, the root entries in
  `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`,
  `src/cli/index.ts`, `src/mcp/server.ts`, and the settings UI. Preserve the
  `src-tauri/tauri.conf.json` pointer to `../package.json`.
- Tagged updater builds require `TEXTEX_UPDATER_PUBLIC_KEY`,
  `TAURI_SIGNING_PRIVATE_KEY`, and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- Releases must contain installers, updater archives and signatures for every
  supported platform, `latest.json`, and `checksums.txt`.
- Never move or replace a tag after a GitHub Release exists. Publish a new patch
  version instead.

## Code Review Rules

- Flag renderer features that import Node.js or `@tauri-apps/api` directly
  instead of using `DesktopApi`.
- Flag commands that bypass the shared command map, input validation, project
  boundary, or capability registration.
- Flag async document, compile, PDF, and index results that do not prove they
  still belong to the current document revision or generation.
- Flag release changes that omit updater signatures or a complete
  `latest.json` platform map.
