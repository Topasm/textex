# Zotero Integration

TextEx integrates with [Zotero](https://www.zotero.org/) through the
[Better BibTeX](https://retorque.re/zotero-better-bibtex/) plugin and Zotero's
[Local API](https://www.zotero.org/support/dev/web_api/v3/local_api). The right-side
Research panel keeps project references, Zotero collections, online search, and AI entry points
available while the file navigator remains open.

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

### Research panel

Open **References** in the right Research panel and choose a source:

- **Project** searches every project `.bib` file and preserves citation-card drag and drop.
- **Zotero** searches Better BibTeX, shows the collection hierarchy, and adds selected items to
  `references.bib` before inserting `\cite{...}`.
- **Online** searches Crossref and arXiv. **Add & cite** merges the item into `references.bib`;
  **Save to library** requests Zotero write authorization and creates a permanent Zotero item.

Collection synchronization atomically replaces `zotero.bib`; individually selected and online
items are atomically merged into `references.bib`. These separate managed files prevent a full
collection refresh from deleting individually added references. A collection can be configured to
sync when its project opens, and manual sync always shows the target and item count first.

### Inserting Citations (Inline Search)
1.  Press `Ctrl+Shift+C` (or `Cmd+Shift+C` on macOS) to focus the citation search bar in the toolbar, or click it directly.
2.  Type 3+ characters to search your library (title, author, year, etc.).
3.  A dropdown appears with matching results. Navigate with `Up`/`Down` arrow keys.
4.  Press `Enter` to toggle selection on the highlighted result (multi-select with checkboxes).
5.  Press `Ctrl+Enter` (or `Cmd+Enter`) to insert `\cite{key1,key2}` at the cursor.
6.  Press `Escape` to close the dropdown.

### Drag and Drop
Drag a Project, Zotero, or Online reference card from the Research panel into the editor. Zotero
and Online cards finish their bibliography import before inserting the final citation key.

When TextEx creates a managed bibliography that is not registered in the active TeX document, it
shows a BibTeX/BibLaTeX change preview. The editor is changed only after confirmation and only if
the document has not changed since the preview was created.

### OmniSearch prefixes

- `/r` or `/c`: project references
- `/z`: Zotero
- `/o`, `/online`, or `/paper`: Crossref and arXiv
- `/p`: PDF text search (unchanged)

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
| `zotero_search` | Renderer -> Rust | `(term, port)` | `ZoteroSearchResult[]` |
| `zotero_collections` | Renderer -> Rust | `(port)` | `ZoteroCollection[]` |
| `zotero_add_to_project` | Renderer -> Rust | `(citekey, port)` | `ReferenceAddResult` |
| `zotero_sync_collection` | Renderer -> Rust | `(collection, target, port)` | `ZoteroSyncResult` |
| `zotero_save_online` | Renderer -> Rust | `(reference, port)` | `ZoteroSaveResult` |
| `research_search_online` | Renderer -> Rust | `(query)` | `OnlineReference[]` |

`zotero_sync_collection` uses Better BibTeX's current explicit-key pull-export
endpoint and retains compatibility fallbacks for legacy collection paths (for
example `/0/8CV58ZVD`). It caps the response at
50 MiB, and transactionally replaces `zotero.bib` or another project-local
`.bib` target only after the complete UTF-8 export has arrived. Sync requests
are serialized, their target is validated before download, and a successful
write invalidates the generation-cached reference index immediately.

### Data Flow

```
User presses Ctrl+Shift+C
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
| `src-tauri/src/services/zotero.rs` | Loopback-only BBT and Zotero Local API client |
| `src-tauri/src/services/research.rs` | Crossref/arXiv search and atomic BibTeX merge |
| `src-tauri/src/commands/zotero.rs` | Validated Zotero command boundary |
| `src-tauri/src/commands/research.rs` | Validated research command boundary |
| `src/renderer/components/ResearchPanel.tsx` | Independent right panel shell |
| `src/renderer/components/research/` | Project, Zotero, Online, and Chat views |
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
- Importing Zotero notes, annotations, or attachment files
- Syncing entire Zotero libraries
- Supporting Zotero without Better BibTeX
- Building a custom citation style processor
