# TextEx Agent Guide

## Project

TextEx is an Electron, React, and TypeScript desktop LaTeX editor. Keep the main,
preload, and renderer process boundary intact: renderer code accesses native
capabilities only through the typed preload API.

## Commands

- Install dependencies with `npm ci`.
- Run the standard verification suite with `npm run check`.
- Run individual checks with `npm run typecheck`, `npm run lint`,
  `npm run format:check`, and `npm run test`.
- Build the desktop app with `npm run build`.
- Build the CLI and MCP server with `npm run build:cli` and `npm run build:mcp`.

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

## Code Review Rules

- Flag renderer code that directly imports Node or Electron modules.
- Flag IPC additions that bypass the channel map, input validation, or preload
  bridge.
- Flag release changes that omit updater metadata (`latest*.yml`) or blockmaps
  required by `electron-updater`.
