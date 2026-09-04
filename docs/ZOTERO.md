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

Open **References** in the right Research panel. Project and Zotero are intentionally combined into
one current-paper manager:

- The health summary compares citations used in project `.tex` files, every project `.bib` entry,
  and the Zotero library. It reports cited, missing-bibliography, unused, and not-linked states.
  Issue detail is collapsed behind a single count until it is asked for.
- **One list.** Project bibliography entries, the selected collection's papers, Zotero search hits
  and `\cite` keys with no bibliography entry are merged into a single sorted list, one row per
  paper, each carrying a state badge. Rows are keyed by Zotero item key and then by citation key,
  so a paper described by two sources never appears twice.
- **My Library** and its nested collection hierarchy live behind the collection picker at the top
  of the panel, with lazy authoritative counts. Selecting a collection loads its papers into the
  same list.
- The sort control orders the list by title, author, year or citation count; the choice is a user
  setting and persists across projects and restarts.
- The shared search checks the project and Zotero first. When both return no matches, **Search
  Crossref / arXiv** opens Online as a secondary view. **Add & cite** merges an online result into
  `references.bib`; **Save to library** requests Zotero write authorization and creates a permanent
  Zotero item.

Exact cross-check matching is DOI first, then arXiv identifier, then Better BibTeX citekey.
Normalized title and year are displayed as a possible match for review, never linked
automatically.
**Project citation groups** is a separate view, reached from the action in the panel's top row. It
does the one thing this list cannot: naming sets of project references so a whole set can be cited
at once by dragging its group header. It used to also offer flat/author/year/type views of the same
entries the References list already shows, and its filter box wrote to the same store field as the
search box here, so a query typed in one appeared in the other. Both are gone; the view is groups
and nothing else.

Collection synchronization atomically replaces `zotero.bib`; individually selected and online
items are atomically merged into `references.bib`. These separate managed files prevent a full
collection refresh from deleting individually added references. Manual sync first compares the
selected collection with the managed target and shows new, removed, and unchanged citekeys; the
file is not replaced until confirmation. Collection papers load 50 at a time, while visible tree
counts are fetched lazily from Zotero's `Total-Results` header. Unknown counts are displayed as
`…`, never as zero.

### Keeping a collection current

Selecting a collection writes `.textex/research.json` immediately, so the
choice survives closing and reopening the project without a separate save step.
The sync mode itself is the global **Collection sync** setting.

- The open-time export runs during project open. A failure (for example, Zotero
  not running yet) is reported as a notification instead of being dropped.
- Continuous mode polls the configured collection every 15 seconds through
  `zotero_collection_items` with a zero-length page. The project-level
  coordinator remains active when the References sidebar is closed and uses
  Zotero's `Last-Modified-Version` library revision, with `Total-Results` as a
  compatibility fallback. A successful change refreshes panel caches and
  atomically rewrites the managed `zotero.bib`; failed revisions remain pending
  and are retried on the next poll.

A saved collection that Zotero has not confirmed yet — an unreachable Zotero, or
a library tree that has not loaded — stays selected and is reported as
unconfirmed. Only a reachable library that lists collections without the saved
key clears the setting, because that is the one case where the collection is
really gone.

### Reference row interaction

A row never writes to the document or the bibliography by itself:

| Input | Result |
|---|---|
| Click / <kbd>Enter</kbd> | Selects the row and expands it in place: abstract, citation locations, duplicate warnings, and the explicit action buttons |
| Double-click | Reveals the item in the Zotero desktop application |
| Right-click / <kbd>Shift</kbd>+<kbd>F10</kbd> | Opens the actions menu: preview, insert citation, add to bibliography, add and cite, open in Zotero, add to chat |
| Drag | Unchanged — drops a citation into the editor or the chat |

Inserting a citation and adding to the bibliography are separate actions. `Add to bibliography`
writes the entry without touching the open document; `Add and cite` does both.

The abstract is fetched per item the first time a row is expanded and cached for the session; the
collection pages stay lean.

### What is stored where

The project file `.textex/research.json` names the collection and the two managed `.bib` files, and
nothing else — selecting a collection writes it immediately, with no save step and no save button.

How that collection is mirrored is a user setting, **Settings → Integrations → Collection sync**,
applied to every project:

| Mode | Behavior |
|---|---|
| Keep synchronized while a project is open (default) | Exports on project open, then rewrites the managed file whenever the collection changes |
| Sync once when a project opens | Exports on project open only |
| Manual sync only | Never writes on its own; the panel shows the manual sync button |

The manual sync button appears in the panel whenever the mode is not continuous. Configs written by
earlier versions still carry `syncOnOpen` and `autoSync`; those fields are ignored.

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
| `zotero_library_tree` | Renderer -> Rust | `(port)` | `ZoteroLibrary[]` |
| `zotero_collection_items` | Renderer -> Rust | `(collection, offset, limit, port)` | `ZoteroCollectionItemsPage` |
| `zotero_open_item` | Renderer -> Rust | `(itemKey, port)` | `SuccessResult` |
| `zotero_item_detail` | Renderer -> Rust | `(itemKey, port)` | `ZoteroItemDetail` |
| `zotero_add_to_project` | Renderer -> Rust | `(citekey, port)` | `ReferenceAddResult` |
| `zotero_sync_collection` | Renderer -> Rust | `(collection, target, port)` | `ZoteroSyncResult` |
| `zotero_save_online` | Renderer -> Rust | `(reference, port)` | `ZoteroSaveResult` |
| `scan_citations` | Renderer -> Rust | `(projectRoot)` | `CitationUsage[]` |
| `research_search_online` | Renderer -> Rust | `(query)` | `OnlineReference[]` |

`zotero_sync_collection` uses Better BibTeX's current explicit-key pull-export
endpoint and retains compatibility fallbacks for legacy collection paths (for
example `/0/8CV58ZVD`). It caps the response at
50 MiB, and transactionally replaces `zotero.bib` or another project-local
`.bib` target only after the complete UTF-8 export has arrived. Sync requests
are serialized, their target is validated before download, and a successful
write invalidates the generation-cached reference index immediately.

`zotero_open_item` takes only an item key. The `zotero://select/library/items/{key}` URI is
assembled in Rust after the key is validated against the Zotero key alphabet and confirmed against
the running library, so the renderer can never hand the platform opener an arbitrary scheme —
`open_external` still refuses everything but `https`, `http` and `mailto`.

`zotero_item_detail` reads one item through the Local API and returns its abstract (truncated to
4,000 characters), publication and URL. It exists so that abstracts are never carried in the
100-item collection pages.

Collection browsing uses only Zotero's loopback Local API. The Rust service validates collection
keys, caps pages at 100 top-level bibliographic items, batches Better BibTeX citekey resolution,
and requires `Total-Results` before reporting an authoritative collection count. The current
browser exposes **My Library**; group-library roots can be added to the typed library array later
without changing the renderer contract.

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
| `src/renderer/components/research/` | Unified local Reference Manager, Online fallback, and Chat views |
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
