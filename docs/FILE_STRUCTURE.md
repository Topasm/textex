# NeuroTeX — File & Directory Structure

```
/textex (project root)
│
├── docs/                          # Project documentation (you are here)
│   ├── ARCHITECTURE.md            # System architecture & data flow
│   ├── TECH_STACK.md              # Technology choices & rationale
│   ├── FILE_STRUCTURE.md          # This file
│   ├── IPC_SPEC.md                # IPC channels, payloads, type definitions
│   ├── COMPILER_SERVICE.md        # Tectonic integration details
│   ├── UI_SPEC.md                 # Component layout & behavior
│   └── PACKAGING.md               # Build & distribution config
│
├── resources/
│   └── bin/                       # *** Tectonic binaries (per-platform) ***
│       ├── win/
│       │   └── tectonic.exe
│       ├── mac/
│       │   └── tectonic
│       └── linux/
│           └── tectonic
│
├── src/
│   ├── main/                      # Electron Main process
│   │   ├── main.ts                # App entry: BrowserWindow creation, menu
│   │   ├── ipc.ts                 # IPC handler registration
│   │   └── compiler.ts            # Tectonic spawn & output capture
│   │
│   ├── preload/                   # Context Bridge
│   │   └── index.ts               # exposeInMainWorld API surface
│   │
│   └── renderer/                  # React application
│       ├── index.html             # Vite HTML entry
│       ├── main.tsx               # React root mount
│       ├── App.tsx                # Top-level layout (split pane)
│       ├── components/
│       │   ├── EditorPane.tsx     # Monaco Editor wrapper
│       │   ├── PreviewPane.tsx    # react-pdf viewer
│       │   ├── Toolbar.tsx        # Compile button, file actions
│       │   ├── LogPanel.tsx       # Compilation stderr output
│       │   └── StatusBar.tsx      # File path, compile status indicator
│       ├── store/
│       │   └── useAppStore.ts     # Zustand store definition
│       ├── hooks/
│       │   ├── useAutoCompile.ts  # Debounced compile trigger
│       │   └── useFileOps.ts      # Open / save / save-as wrappers
│       ├── types/
│       │   └── api.d.ts           # Type declarations for window.api
│       └── styles/
│           └── index.css          # Tailwind directives + custom styles
│
├── electron-builder.yml           # Packaging config (extraResources, targets)
├── package.json
├── tsconfig.json
├── tsconfig.node.json             # Separate config for main/preload (Node target)
├── vite.config.ts                 # Vite config for renderer
├── tailwind.config.js
├── postcss.config.js
└── README.md
```

## Key Conventions

- **`resources/bin/`** — Platform binaries are organized into `win/`, `mac/`, `linux/`
  sub-folders. `electron-builder` copies the correct folder at package time via
  `extraResources` with `${os}` interpolation.

- **`src/main/`** — Pure Node.js / Electron code. No DOM, no React. Compiled to
  CommonJS (or ESM depending on Electron version).

- **`src/preload/`** — Runs in a special context with access to both `ipcRenderer`
  and a limited DOM environment. Must not import React or renderer code.

- **`src/renderer/`** — Standard Vite + React app. Cannot access Node.js APIs
  directly; must go through `window.api` (defined by the preload script).

- **`store/`** — Single Zustand store. If the store grows large, split into
  slices (e.g., `createFileSlice`, `createCompilerSlice`).
