# Technology Stack

| Layer | Technology | Role |
| --- | --- | --- |
| Desktop runtime | Tauri 2 | Window, commands, capabilities, updater, packaging |
| Native backend | Rust + Tokio | Filesystem, compiler, Git, indexing, integrations |
| Renderer | React 19 + TypeScript + Vite | Desktop UI |
| Editor | Monaco Editor | LaTeX source editing |
| State | Zustand | Fine-grained renderer UI/domain state |
| PDF | PDF.js + react-pdf | Virtualized preview and text search |
| Compiler | Tectonic 0.17 sidecar | Reproducible LaTeX compilation |
| Validation | Rust typed models + Zod where needed | Boundary validation |
| Tests | Vitest + Rust tests | Renderer/shared/native behavior |
| CLI | Commander + Node.js | Headless local commands |
| MCP | Model Context Protocol SDK | AI-tool integration over stdio |

Tauri is the only desktop runtime. Node.js dependencies used by the CLI and MCP
server are not exposed to the renderer.
