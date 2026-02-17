# TextEx — Zotero Citation Import Integration Plan

## Scope

Add Zotero integration to TextEx **for citation import only**. Users will be able to search their Zotero library and insert `\cite{citekey}` commands (and optionally export matching BibTeX entries) directly from the editor. This requires [Better BibTeX for Zotero](https://retorque.re/zotero-better-bibtex/) (BBT) to be installed in the user's Zotero.

---

## How It Works (Learned from Source Analysis)

### Better BibTeX HTTP API (the integration layer)

BBT exposes a local HTTP server inside Zotero at `http://127.0.0.1:<port>/better-bibtex/`. Two APIs are relevant:

| Endpoint | Method | Purpose |
|---|---|---|
| `/better-bibtex/cayw?probe=true` | GET | Check if Zotero + BBT is running |
| `/better-bibtex/cayw?format=latex` | GET | Open Zotero's native picker, return `\cite{key}` |
| `/better-bibtex/cayw?format=translate&translator=<id>` | GET | Open picker, return full CSL JSON for selected items |
| `/better-bibtex/json-rpc` | POST | Programmatic API: `item.search`, `item.export`, `user.groups`, etc. |

**Ports:** Zotero = `23119`, Juris-M = `24119`, or user-defined.

### Key Insight from obsidian-zotero-integration

The Obsidian plugin uses **two modes** that map well to TextEx:

1. **CAYW (Cite As You Write):** Makes a GET request to the CAYW endpoint. Zotero itself opens a picker dialog. The request blocks until the user selects items, then returns formatted citation text. This is the simplest path.

2. **JSON-RPC search:** POST to `/better-bibtex/json-rpc` with `{"jsonrpc":"2.0","method":"item.search","params":["search term"]}`. Returns matching items. This enables an in-app search UI without leaving TextEx.

**For TextEx, we implement both:**
- **Quick cite (CAYW):** Opens Zotero's native picker — simplest, zero UI work.
- **In-app search:** A search modal inside TextEx that queries BBT's `item.search` — better UX, user stays in the editor.

---

## Architecture

### New Files

```
src/main/zotero.ts          — BBT HTTP client (connection, search, cite key export)
src/renderer/components/
  ZoteroCiteModal.tsx        — In-app citation search/pick modal
src/preload/index.ts         — Add new IPC bridge methods (zotero:*)
```

### Modified Files

```
src/main/ipc.ts              — Register zotero:* IPC handlers
src/preload/index.ts         — Expose zotero API methods on window.api
src/renderer/types/api.d.ts  — Add ZoteroEntry type + ElectronAPI methods
src/renderer/store/useAppStore.ts — Add zoteroEnabled setting state
src/renderer/components/App.tsx         — Wire keyboard shortcut
src/renderer/components/Toolbar.tsx     — Add Zotero cite button (optional)
src/renderer/components/SettingsModal.tsx — Add Zotero settings section
src/renderer/styles/index.css           — Styles for ZoteroCiteModal
```

---

## Detailed Implementation Steps

### Step 1: Main Process — BBT HTTP Client (`src/main/zotero.ts`)

Create a module that talks to BBT over HTTP. No external dependencies needed — use Node's built-in `http` module (or `net.fetch` in Electron 40+).

```typescript
// src/main/zotero.ts

interface ZoteroSearchResult {
  citekey: string
  title: string
  author: string
  year: string
  type: string  // article, book, etc.
}

interface ZoteroConfig {
  port: number  // default 23119
}

const DEFAULT_PORT = 23119
const BASE_URL = (port: number) => `http://127.0.0.1:${port}/better-bibtex`

/**
 * Probe whether Zotero + BBT is running.
 */
export async function zoteroProbe(port = DEFAULT_PORT): Promise<boolean> {
  try {
    const resp = await fetch(`${BASE_URL(port)}/cayw?probe=true`, {
      signal: AbortSignal.timeout(2000)
    })
    return resp.ok
  } catch {
    return false
  }
}

/**
 * Open Zotero's native CAYW picker and return \cite{keys}.
 * This request blocks until the user selects items in Zotero and closes the picker.
 */
export async function zoteroCiteCAYW(port = DEFAULT_PORT): Promise<string> {
  const resp = await fetch(`${BASE_URL(port)}/cayw?format=latex`, {
    signal: AbortSignal.timeout(300_000) // 5 min — user is picking
  })
  if (!resp.ok) throw new Error(`CAYW failed: ${resp.status}`)
  return resp.text()  // e.g. "\cite{smith2020,jones2021}"
}

/**
 * Search Zotero library by term. Returns matching items with citekeys.
 */
export async function zoteroSearch(
  term: string,
  port = DEFAULT_PORT
): Promise<ZoteroSearchResult[]> {
  const resp = await fetch(`${BASE_URL(port)}/json-rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'item.search',
      params: [term]
    })
  })
  if (!resp.ok) throw new Error(`Search failed: ${resp.status}`)
  const data = await resp.json()
  // BBT item.search returns an array of objects with citekey + metadata
  return (data.result || []).map((item: any) => ({
    citekey: item.citekey,
    title: item.title || '',
    author: formatAuthors(item.creators || []),
    year: item.date ? extractYear(item.date) : '',
    type: item.itemType || 'misc'
  }))
}

/**
 * Export selected items as BibTeX string via JSON-RPC.
 * Used to append entries to the project's .bib file.
 */
export async function zoteroExportBibtex(
  citekeys: string[],
  port = DEFAULT_PORT
): Promise<string> {
  const resp = await fetch(`${BASE_URL(port)}/json-rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'item.export',
      params: [citekeys, 'betterbibtex']  // translator ID for Better BibTeX format
    })
  })
  if (!resp.ok) throw new Error(`Export failed: ${resp.status}`)
  const data = await resp.json()
  return data.result || ''
}

function formatAuthors(creators: any[]): string {
  return creators
    .filter(c => c.creatorType === 'author')
    .map(c => c.name || `${c.lastName}, ${c.firstName}`)
    .join('; ')
}

function extractYear(date: string): string {
  const match = date.match(/\d{4}/)
  return match ? match[0] : ''
}
```

### Step 2: IPC Channels

Add to the IPC spec following the existing `bib:*` pattern:

| Channel | Direction | Payload | Response |
|---|---|---|---|
| `zotero:probe` | Renderer → Main | `(port?: number)` | `boolean` |
| `zotero:search` | Renderer → Main | `(term: string, port?: number)` | `ZoteroSearchResult[]` |
| `zotero:cite-cayw` | Renderer → Main | `(port?: number)` | `string` (LaTeX cite command) |
| `zotero:export-bibtex` | Renderer → Main | `(citekeys: string[], port?: number)` | `string` (BibTeX source) |

**In `src/main/ipc.ts`**, add:

```typescript
import { zoteroProbe, zoteroSearch, zoteroCiteCAYW, zoteroExportBibtex } from './zotero'

// Inside registerIpcHandlers():
ipcMain.handle('zotero:probe', (_e, port?: number) => zoteroProbe(port))
ipcMain.handle('zotero:search', (_e, term: string, port?: number) => zoteroSearch(term, port))
ipcMain.handle('zotero:cite-cayw', (_e, port?: number) => zoteroCiteCAYW(port))
ipcMain.handle('zotero:export-bibtex', (_e, citekeys: string[], port?: number) =>
  zoteroExportBibtex(citekeys, port))
```

**In `src/preload/index.ts`**, expose:

```typescript
zoteroProbe: (port?: number) => ipcRenderer.invoke('zotero:probe', port),
zoteroSearch: (term: string, port?: number) => ipcRenderer.invoke('zotero:search', term, port),
zoteroCiteCAYW: (port?: number) => ipcRenderer.invoke('zotero:cite-cayw', port),
zoteroExportBibtex: (citekeys: string[], port?: number) =>
  ipcRenderer.invoke('zotero:export-bibtex', citekeys, port),
```

**In `src/renderer/types/api.d.ts`**, add:

```typescript
interface ZoteroSearchResult {
  citekey: string
  title: string
  author: string
  year: string
  type: string
}

interface ElectronAPI {
  // ... existing ...

  // Zotero (Better BibTeX)
  zoteroProbe(port?: number): Promise<boolean>
  zoteroSearch(term: string, port?: number): Promise<ZoteroSearchResult[]>
  zoteroCiteCAYW(port?: number): Promise<string>
  zoteroExportBibtex(citekeys: string[], port?: number): Promise<string>
}
```

### Step 3: Settings

Add to `UserSettings`:

```typescript
interface UserSettings {
  // ... existing ...
  zoteroEnabled: boolean    // default: false
  zoteroPort: number        // default: 23119
}
```

**Default values:** `zoteroEnabled: false`, `zoteroPort: 23119`

Add a "Zotero" section in `SettingsModal.tsx`:
- Toggle: "Enable Zotero Integration" (enables the feature + keyboard shortcut)
- Number input: "BBT Port" (default 23119, shown when enabled)
- Status indicator: "Connected" / "Not connected" (calls `zoteroProbe` on toggle)

### Step 4: In-App Citation Search Modal (`ZoteroCiteModal.tsx`)

A lightweight modal (similar to the existing TemplateGallery pattern) that:

1. Opens via keyboard shortcut (`Ctrl+Shift+Z` / `Cmd+Shift+Z`)
2. Shows a search input (auto-focused)
3. Debounces input (300ms), calls `window.api.zoteroSearch(term)`
4. Displays results in a scrollable list:
   ```
   [checkbox] smith2020 — "Machine Learning Basics" — Smith, J. (2020) — article
   [checkbox] jones2021 — "Deep Networks" — Jones, A.; Lee, B. (2021) — inproceedings
   ```
5. User selects one or more items via checkboxes or Enter (single-select)
6. On confirm:
   - Inserts `\cite{key1,key2}` at the cursor position in the editor
   - Optionally: appends BibTeX entries to the project's `.bib` file (if "Auto-export to .bib" is checked)
7. On Escape: closes without action

**Key UI behavior:**
- Arrow keys navigate the list
- Enter selects the highlighted item (or confirms multi-selection)
- Results show empty state: "Type to search your Zotero library"
- Error state: "Cannot connect to Zotero. Make sure Zotero is running with Better BibTeX installed."
- Loading state: spinner while searching

### Step 5: Quick CAYW Cite (Alternative Flow)

Add a second shortcut or toolbar button for "Cite via Zotero Picker" (`Ctrl+Shift+C` / `Cmd+Shift+C`):

1. Calls `window.api.zoteroCiteCAYW(port)`
2. Zotero's own picker window appears (system-level, outside TextEx)
3. User selects items in Zotero, clicks OK
4. BBT returns a string like `\cite{smith2020,jones2021}`
5. TextEx inserts it at the cursor

This is the zero-UI-effort path. The request naturally blocks until the Zotero picker closes.

### Step 6: Auto-Export BibTeX Entries (Optional Enhancement)

When the user inserts a citation from the search modal:

1. Check if a `.bib` file exists in the project root (use existing `findBibInProject`)
2. If yes, fetch BibTeX via `zoteroExportBibtex([selectedKeys])`
3. Parse the returned BibTeX, check which keys are already in the file
4. Append only new entries to the `.bib` file
5. Trigger a re-parse of the bib file to update the BibPanel

This is optional and controlled by a per-action checkbox in the modal: "Also add to .bib file".

### Step 7: Keyboard Shortcuts & Toolbar

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+Z` / `Cmd+Shift+Z` | Open Zotero search modal (in-app) |
| `Ctrl+Shift+C` / `Cmd+Shift+C` | Open Zotero CAYW picker (native) |

Add a Zotero icon button to the Toolbar (next to the existing compile/export buttons), visible only when `zoteroEnabled` is true. Dropdown with two options:
- "Search Zotero Library..." (Ctrl+Shift+Z)
- "Cite via Zotero Picker..." (Ctrl+Shift+C)

---

## Data Flow Diagram

```
User presses Ctrl+Shift+Z
         │
         ▼
┌─────────────────────────┐
│ ZoteroCiteModal opens   │
│ User types search term  │
└────────┬────────────────┘
         │ (debounced 300ms)
         ▼
┌─────────────────────────┐     IPC: zotero:search     ┌──────────────────────┐
│ Renderer                │ ──────────────────────────► │ Main Process         │
│ window.api.zoteroSearch │                             │ zotero.ts            │
└─────────────────────────┘                             └──────────┬───────────┘
                                                                   │
                                                    POST /better-bibtex/json-rpc
                                                    { method: "item.search" }
                                                                   │
                                                                   ▼
                                                        ┌──────────────────┐
                                                        │ Zotero + BBT     │
                                                        │ (localhost:23119)│
                                                        └──────────┬───────┘
                                                                   │
                                                          JSON response
                                                                   │
         ┌─────────────────────────────────────────────────────────┘
         ▼
┌─────────────────────────┐
│ ZoteroCiteModal shows   │
│ search results          │
│ User selects items      │
└────────┬────────────────┘
         │ (click Confirm)
         ▼
┌─────────────────────────┐
│ Insert \cite{key1,key2} │
│ at cursor in Monaco     │
└─────────────────────────┘
```

---

## Implementation Order

| Phase | Task | Files | Effort |
|---|---|---|---|
| **1** | BBT HTTP client | `src/main/zotero.ts` | Small |
| **2** | IPC channels + preload bridge | `src/main/ipc.ts`, `src/preload/index.ts`, `api.d.ts` | Small |
| **3** | Settings (zoteroEnabled, zoteroPort) | `src/main/settings.ts`, `SettingsModal.tsx`, `api.d.ts` | Small |
| **4** | ZoteroCiteModal (search UI) | `ZoteroCiteModal.tsx`, `index.css` | Medium |
| **5** | Keyboard shortcuts + toolbar wiring | `App.tsx`, `Toolbar.tsx` | Small |
| **6** | CAYW quick-cite flow | `App.tsx` (shortcut handler) | Small |
| **7** | Auto-export to .bib (optional) | `zotero.ts`, `ZoteroCiteModal.tsx` | Medium |
| **8** | Tests | `tests/zotero.test.ts` | Small |

**Total estimated new code:** ~400–500 lines across all files.

---

## Prerequisites

- User must have **Zotero** (desktop app) installed and running
- User must have **Better BibTeX** plugin installed in Zotero
- BBT's HTTP server must be reachable at `127.0.0.1:23119` (default)

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Zotero not running | Show "Cannot connect to Zotero" in modal + status bar hint |
| BBT not installed | Same as above (BBT endpoints won't exist) |
| Search returns empty | Show "No results found" in modal |
| Network timeout | Show "Zotero is not responding" with retry option |
| CAYW picker cancelled | Return empty string, do nothing |
| Invalid port | Validate in settings, reject non-numeric / out-of-range values |

---

## Non-Goals (Explicitly Out of Scope)

- Reading Zotero's SQLite database directly
- Full bibliography management (import notes, annotations, PDFs)
- Syncing entire Zotero libraries
- Supporting Zotero without Better BibTeX
- Building a custom citation style processor
