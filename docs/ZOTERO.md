# Zotero Integration

TextEx integrates directly with [Zotero](https://www.zotero.org/) via the [Better BibTeX](https://retorque.re/zotero-better-bibtex/) plugin, allowing you to search your library and insert citations without leaving the editor.

## Prerequisites

1.  **Install Zotero:** [Download Zotero](https://www.zotero.org/download/).
2.  **Install Better BibTeX:**
    -   Download the latest `.xpi` from the [Better BibTeX GitHub releases](https://github.com/retorque/zotero-better-bibtex/releases).
    -   In Zotero, go to **Tools** > **Add-ons**, click the gear icon, and select **Install Add-on From File...**.
    -   Restart Zotero.

## Configuration

By default, TextEx connects to Zotero on port `23119` (the default Better BibTeX port).

To configure this:
1.  Open **Settings** (Gear icon).
2.  Navigate to the **Integrations** tab.
3.  Ensure **Zotero Integration** is enabled.
4.  If you changed the port in Zotero, update the **Zotero Port** setting.

## Usage

### Inserting Citations (Inline Search)
1.  Press `Ctrl+Shift+Z` (or `Cmd+Shift+Z` on macOS) to focus the Zotero search bar in the toolbar, or click it directly.
2.  Type 3+ characters to search your library (title, author, year, etc.).
3.  A dropdown appears with matching results. Navigate with `Up`/`Down` arrow keys.
4.  Press `Enter` to toggle selection on the highlighted result (multi-select with checkboxes).
5.  Press `Ctrl+Enter` (or `Cmd+Enter`) to insert `\cite{key1,key2}` at the cursor.
6.  Press `Escape` to close the dropdown.

### Drag and Drop
Drag a reference from the "Bib" panel in the sidebar directly into the editor to insert its citation.

### Show in Zotero
Click the "Show in Zotero" button in search results to open the paper in the Zotero app.

---

## Architecture

### Better BibTeX HTTP API

BBT exposes a local HTTP server inside Zotero at `http://127.0.0.1:<port>/better-bibtex/`:

| Endpoint | Method | Purpose |
|---|---|---|
| `/better-bibtex/cayw?probe=true` | GET | Check if Zotero + BBT is running |
| `/better-bibtex/cayw?format=latex` | GET | Open Zotero's native picker, return `\cite{key}` |
| `/better-bibtex/json-rpc` | POST | Programmatic API: `item.search`, `item.export`, etc. |

Ports: Zotero = `23119`, Juris-M = `24119`, or user-defined.

### IPC Channels

| Channel | Direction | Payload | Response |
|---|---|---|---|
| `zotero:probe` | Renderer -> Main | `(port?: number)` | `boolean` |
| `zotero:search` | Renderer -> Main | `(term: string, port?: number)` | `ZoteroSearchResult[]` |
| `zotero:cite-cayw` | Renderer -> Main | `(port?: number)` | `string` (LaTeX cite command) |
| `zotero:export-bibtex` | Renderer -> Main | `(citekeys: string[], port?: number)` | `string` (BibTeX source) |

### Data Flow

```
User presses Ctrl+Shift+Z
         |
         v
Renderer (Toolbar search bar)
  User types search term (debounced 300ms)
         |
         v
window.api.zoteroSearch(term)  ->  IPC: zotero:search  ->  Main: zotero.ts
                                                              |
                                                POST /better-bibtex/json-rpc
                                                { method: "item.search" }
                                                              |
                                                              v
                                                   Zotero + BBT (localhost:23119)
                                                              |
                                                       JSON response
                                                              |
         <----------------------------------------------------+
         |
         v
Results shown in dropdown -> User selects -> \cite{key1,key2} inserted at cursor
```

### Source Files

| File | Role |
|------|------|
| `src/main/zotero.ts` | BBT HTTP client (probe, search, CAYW, export) |
| `src/main/ipc.ts` | `zotero:*` IPC handler registration |
| `src/preload/index.ts` | `window.api.zotero*` bridge methods |
| `src/renderer/types/api.d.ts` | `ZoteroSearchResult` type + API declarations |

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Zotero not running | "Cannot connect to Zotero" in search bar + settings status |
| BBT not installed | Same as above (BBT endpoints won't exist) |
| Search returns empty | "No results found" |
| Network timeout | "Zotero is not responding" |
| CAYW picker cancelled | Return empty string, no action |
| Invalid port | Validated in settings |

## Non-Goals

- Reading Zotero's SQLite database directly
- Full bibliography management (import notes, annotations, PDFs)
- Syncing entire Zotero libraries
- Supporting Zotero without Better BibTeX
- Building a custom citation style processor
