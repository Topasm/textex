# TextEx Agent Guide

## Project

TextEx is an Electron, React, and TypeScript desktop LaTeX editor. Keep the main,
preload, and renderer process boundary intact: renderer code accesses native
capabilities only through the typed preload API.

## Commands

- Install locked dependencies with `npm ci`. Use `npm install` only when the
  dependency graph or lockfile is intentionally being changed.
- Run fast verification with `npm run check`; it does not run tests.
- Run the full commit gate with `npm run pre-commit` (typecheck, lint, format,
  and tests).
- Run individual checks with `npm run typecheck`, `npm run lint`,
  `npm run format:check`, and `npm run test`.
- Build the desktop app with `npm run build`.
- Build the CLI and MCP server with `npm run build:cli` and `npm run build:mcp`.
- Follow [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) for every
  version, packaging, tag, or release change.

## Architecture Rules

- Define every request/response IPC channel in `src/shared/ipcChannels.ts` and
  expose renderer-facing methods through `src/preload/index.ts`.
- Keep `src/shared/` free of Electron and renderer imports so the desktop app,
  CLI, and MCP server can reuse it.
- Use fine-grained Zustand selectors. Do not recreate the removed monolithic
  `useAppStore`.
- Preserve `contextIsolation: true`, `nodeIntegration: false`, and the renderer
  sandbox.
- Account for Windows case-insensitive paths when naming adjacent files and
  directories.

## Working Agreements

- Preserve unrelated working-tree changes and keep changes narrowly scoped.
- Add or update tests when behavior changes, then run the relevant focused test
  before the full check suite.
- Use shared constants and typed interfaces instead of introducing new string
  literals for cross-process contracts.
- Update documentation when commands, packaging, IPC behavior, or public
  integrations change.
- Follow [docs/HANDOFF.md](docs/HANDOFF.md) when transferring repository or
  maintainer ownership. Never copy personal access tokens or signing keys into
  the repository or chat history.

## Dependency Update Guardrails

- Keep `package.json` and `package-lock.json` in sync and verify updates from a
  clean install with `npm ci`.
- Run `npm audit` after dependency changes. Review failures instead of applying
  an unbounded force upgrade.
- Run `npm run licenses:generate` when dependency or license data changes, and
  review the generated files under `resources/licenses/`.
- Dependabot checks npm and GitHub Actions weekly. A green lint/test job is not
  enough for packaging changes; wait for Linux, Windows, and macOS jobs.

## Release and Packaging Guardrails

- A `v*` tag or a manual workflow dispatch with publishing enabled can create a
  public GitHub Release. Do not trigger either while testing a release change.
- Push the release commit to `main` first and wait for the complete
  `Build & Package` workflow to pass on Linux, Windows, and macOS universal.
  Only then create and push the version tag.
- Keep the release version synchronized in `package.json`, the root entries in
  `package-lock.json`, `src/cli/index.ts`, `src/mcp/server.ts`, and
  `src/renderer/components/SettingsModal.tsx`. The tag must be exactly
  `v<package.json version>`.
- Preserve the macOS `x64ArchFiles` coverage in `electron-builder.yml` for all
  files under Darwin-specific native prebuild directories and for sidecars.
  Do not narrow it to `*.node`: `node-pty` also ships an extensionless
  `spawn-helper`.
- A universal macOS build requires both x64 and arm64 Tectonic binaries. Keep
  the Tectonic version, asset URLs, local binary layout, and documentation in
  sync when upgrading it.
- Releases must include the platform installers, macOS ZIP, generated
  blockmaps, all three `latest*.yml` updater manifests, and `checksums.txt`.
- Never move or replace a tag after a GitHub Release exists. Publish a new patch
  version instead. A failed unpublished tag may be replaced only after
  confirming that no Release exists and the repaired `main` workflow is green.

## Code Review Rules

- Flag renderer code that directly imports Node or Electron modules.
- Flag IPC additions that bypass the channel map, input validation, or preload
  bridge.
- Flag release changes that omit updater metadata (`latest*.yml`) or blockmaps
  required by `electron-updater`.
