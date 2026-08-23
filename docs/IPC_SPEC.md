# Tauri Command Contract

TextEx uses Tauri `invoke` for request/response calls and typed `Channel` values
for streaming events. The renderer accesses both only through the `DesktopApi`
implementation in `src/renderer/platform/tauriApi.ts`.

## Sources of truth

| Concern | File |
| --- | --- |
| Renderer API | `src/renderer/types/api.d.ts` |
| Command names | `src/shared/tauriCommands.ts` |
| Shared payloads | `src/shared/types.ts`, `compileProtocol.ts` |
| Rust payloads | `src-tauri/src/models.rs` |
| Command adapters | `src-tauri/src/commands/` |
| Command registration | `src-tauri/src/lib.rs` |
| Generated permissions | `src-tauri/build.rs`, `src-tauri/capabilities/main-window.json` |

## Adding or changing a command

1. Add or update the typed request/response contract.
2. Add the command name to `TAURI_COMMANDS`.
3. Expose the operation through `DesktopApi` and implement it in `tauriApi.ts`.
4. Add a thin `#[tauri::command]` function that delegates to a service.
5. Register the handler in `src-tauri/src/lib.rs`.
6. Register its generated permission in `src-tauri/build.rs` and the main-window
   capability file.
7. Validate paths, sizes, enums, URLs, and output limits inside the service.
8. Add Rust service tests and TypeScript adapter/contract tests.

Never use command string literals in components or feature hooks. Never expose
an unrestricted filesystem, shell, process, or opener plugin to the renderer.

## Streaming rules

Compiler, watcher, diagnostics, and updater events use request IDs, document
revisions, or index generations. A listener must be replaceable and removable;
stale events cannot update current renderer state. Channels must carry bounded
payloads and native subprocess output must have explicit size limits.
