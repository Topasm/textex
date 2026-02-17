// Re-export from modular IPC handlers.
// The original monolithic handler has been split into domain-specific modules
// under src/main/ipc/. This file preserves the public API for main.ts.
export { registerIpcHandlers } from './ipc/index'
