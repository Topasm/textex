# File Structure

```text
src/
  renderer/                 React application
    components/             UI surfaces
    editor/                 editor-neutral adapter contracts
    hooks/                  feature orchestration
    models/                 DocumentModel and DocumentRegistry
    platform/               Tauri DesktopApi adapter and capabilities
    services/               renderer application services
    store/                  domain Zustand stores and selectors
  shared/                   pure contracts, parsers, templates, compiler helpers
  cli/                      standalone Node.js CLI
  mcp/                      standalone stdio MCP server
  __tests__/                Vitest tests

src-tauri/
  src/commands/             thin Tauri command adapters by domain
  src/services/             validated native domain logic
  src/models.rs             serialized command/event models
  src/state.rs              application and service state
  capabilities/             generated command allow-list
  binaries/                 target-qualified Tectonic sidecars
  tauri.conf.json           desktop and bundle configuration

scripts/                    checks, sidecar setup, licenses, release helpers
resources/                  package metadata, dictionaries, licenses, caches
docs/                       architecture and maintainer documentation
.github/workflows/build.yml Tauri validation, packaging, and release
```

`src/shared/` cannot import React, renderer, or Tauri modules. Renderer features
cannot import Node.js or native APIs directly. Cross-boundary work must pass
through `DesktopApi`, a shared command name, and a registered Rust command.
