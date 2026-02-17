# Auto-Grouping Citations with Drag-and-Drop

## What This Feature Does

The BibPanel and Zotero search results currently show a **flat list** of citations.
This feature adds **automatic grouping** so related papers cluster together — by
author, year, tag, or co-citation — and lets you **drag an entire group** onto the
editor to insert all its `\cite{keys}` at once.

```
Before (flat):                    After (grouped):
  Smith 2020                       ▸ Machine Learning (3)
  Jones 2021                         Smith 2020
  Lee 2019                           Jones 2021
  Smith 2022                         Lee 2019
  Park 2020                        ▸ Smith (2)
                                     Smith 2020
                                     Smith 2022
                                   ▸ 2020 (2)
                                     Park 2020
                                     Smith 2020
```

Dragging the "Machine Learning (3)" header onto the editor inserts:
```latex
\cite{smith2020,jones2021,lee2019}
```

---

## How Zotero-Style's Graph Grouping Works

Source: `zotero-style/src/modules/graphView.ts`

The plugin builds a graph `{ nodes, links }` and supports **4 modes**.
The two grouping modes relevant to us are **author** and **tag**:

### Algorithm (shared by both modes)

```
1. Collect items
2. For each item, extract attributes (authors or tags)
3. Build a frequency map:  attribute → Set<items>
4. Compute threshold = 90th percentile of frequency counts
5. Keep only attributes whose item count ≥ threshold
6. Create a "hub" node for each surviving attribute
7. Link every item in that hub's set to the hub node
```

The 90th-percentile filter is the key insight — it prevents noise by only
surfacing **significant clusters** (top 10% by frequency).

### Concrete Example

Given 10 papers, suppose "Machine Learning" tag appears on 5 papers while most
other tags appear on 1–2 papers. The 90th percentile threshold might be 3. Only
tags appearing on ≥ 3 papers become group headers.

---

## Feature Design for TextEx

### User-Facing Behavior

| Action | Result |
|--------|--------|
| Open BibPanel sidebar | Entries grouped under collapsible headers |
| Click group header `▸` | Expand/collapse group |
| Drag **single entry** onto editor | Insert `\cite{key}` (existing behavior) |
| Drag **group header** onto editor | Insert `\cite{key1,key2,...}` for all entries in group |
| Click **group header** | Insert all citations at cursor |
| Toggle grouping mode | Switch between: Flat, By Author, By Year, By Tag, By Type |
| Search filter | Groups that have zero visible entries after filter are hidden |

### Grouping Modes

| Mode | How entries group | Header label |
|------|-------------------|--------------|
| **Flat** | No grouping (current behavior) | — |
| **By Author** | Shared first author surname | `"Smith (4)"` |
| **By Year** | Publication year | `"2023 (7)"` |
| **By Tag** | Zotero tags (if available) or BibTeX keywords | `"ML (3)"` |
| **By Type** | Entry type (article, book, inproceedings…) | `"article (12)"` |

### Visual Mockup

```
┌─ Bibliography ──────────────────────┐
│ [🔍 Filter...        ] [Group: ▾ ] │
│                                     │
│ ▾ 2023 (3)                    drag⠿│
│   ├ Smith — Deep Learning...  drag⠿│
│   ├ Jones — Transformer...    drag⠿│
│   └ Lee — Attention Is...     drag⠿│
│                                     │
│ ▸ 2022 (5)                    drag⠿│
│                                     │
│ ▾ 2021 (2)                    drag⠿│
│   ├ Park — Graph Neural...    drag⠿│
│   └ Chen — Self-Supervised... drag⠿│
└─────────────────────────────────────┘
```

The `drag⠿` handle on the **group row** sets drag data to all citekeys joined:
```
\cite{smith2023,jones2023,lee2023}
```

---

## Implementation Plan

### Files to Create / Modify

| File | Change |
|------|--------|
| `src/renderer/components/BibPanel.tsx` | Major rewrite — add grouping logic, group headers, group drag |
| `src/renderer/store/useAppStore.ts` | Add `bibGroupMode` setting |
| `src/renderer/components/SettingsModal.tsx` | Add grouping mode selector (or keep it only in BibPanel dropdown) |
| `src/renderer/styles/index.css` | New styles for group headers, collapse/expand, drag handle |
| `src/shared/bibparser.ts` | (Read-only reference) Understand `BibEntry` shape |
| `src/renderer/components/EditorPane.tsx` | No change needed — existing `onDrop` handler already accepts `text/plain` |

### Step-by-Step Implementation

#### Step 1: Add Grouping State to Store

**File:** `src/renderer/store/useAppStore.ts`

Add to `UserSettings`:
```typescript
bibGroupMode: 'flat' | 'author' | 'year' | 'tag' | 'type'
```
Default: `'flat'`

This persists to localStorage so the user's preference survives restarts.

#### Step 2: Build the Grouping Function

**File:** `src/renderer/components/BibPanel.tsx` (or extract to a utility)

```typescript
type GroupedBib = {
  label: string
  entries: BibEntry[]
}

function groupEntries(
  entries: BibEntry[],
  mode: 'flat' | 'author' | 'year' | 'tag' | 'type'
): GroupedBib[] {
  if (mode === 'flat') {
    return [{ label: '', entries }]
  }

  const buckets: Record<string, BibEntry[]> = {}

  for (const entry of entries) {
    const key = extractGroupKey(entry, mode)
    for (const k of Array.isArray(key) ? key : [key]) {
      ;(buckets[k] ??= []).push(entry)
    }
  }

  // Sort groups: most entries first (or alphabetically — user preference)
  return Object.entries(buckets)
    .map(([label, entries]) => ({ label, entries }))
    .sort((a, b) => b.entries.length - a.entries.length)
}

function extractGroupKey(
  entry: BibEntry,
  mode: string
): string | string[] {
  switch (mode) {
    case 'author': {
      // First author surname
      const author = entry.author?.split(/\band\b/i)[0]?.trim() ?? 'Unknown'
      const surname = author.split(',')[0]?.trim() ?? author
      return surname
    }
    case 'year':
      return entry.year ?? 'Unknown'
    case 'type':
      return entry.type ?? 'misc'
    case 'tag': {
      // Tags come from Zotero search results or BibTeX keywords field
      const keywords = entry.keywords
        ? entry.keywords.split(/[,;]/).map(k => k.trim())
        : ['Untagged']
      return keywords
    }
    default:
      return 'All'
  }
}
```

**Applying the 90th-percentile filter (from zotero-style):**

For tag mode with many items, add threshold filtering:

```typescript
function applyThreshold(groups: GroupedBib[]): GroupedBib[] {
  if (groups.length <= 5) return groups  // don't filter small sets

  const counts = groups.map(g => g.entries.length).sort((a, b) => a - b)
  const pct = 0.9
  const limit = counts[Math.floor(counts.length * pct)] ?? 1

  return groups.filter(g => g.entries.length >= limit)
}
```

This keeps only the **top 10% most frequent** groups, matching
zotero-style's clustering strategy. For small collections (< 5 groups), skip
filtering so nothing disappears.

#### Step 3: Rewrite BibPanel UI

**File:** `src/renderer/components/BibPanel.tsx`

Replace the flat list with grouped, collapsible sections:

```tsx
function BibPanel({ entries, onInsert }: Props) {
  const bibGroupMode = useAppStore(s => s.bibGroupMode)
  const setBibGroupMode = useAppStore(s => s.setBibGroupMode)
  const [filter, setFilter] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // 1. Filter
  const filtered = entries.filter(e =>
    [e.key, e.title, e.author].some(f =>
      f?.toLowerCase().includes(filter.toLowerCase())
    )
  )

  // 2. Group
  const groups = groupEntries(filtered, bibGroupMode)

  // 3. Toggle collapse
  const toggle = (label: string) =>
    setCollapsed(prev => ({ ...prev, [label]: !prev[label] }))

  return (
    <div className="bib-panel">
      {/* Header row: filter + mode selector */}
      <div className="bib-panel-header">
        <input
          placeholder="Filter..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <select
          value={bibGroupMode}
          onChange={e => setBibGroupMode(e.target.value)}
        >
          <option value="flat">Flat</option>
          <option value="author">By Author</option>
          <option value="year">By Year</option>
          <option value="type">By Type</option>
          <option value="tag">By Tag</option>
        </select>
      </div>

      {/* Grouped entries */}
      {groups.map(group => (
        <div key={group.label} className="bib-group">
          {/* Group header (skip for flat mode) */}
          {bibGroupMode !== 'flat' && (
            <div
              className="bib-group-header"
              onClick={() => toggle(group.label)}
              draggable
              onDragStart={e => {
                // Drag ALL citekeys in group
                const keys = group.entries.map(e => e.key).join(',')
                e.dataTransfer.setData('text/plain', `\\cite{${keys}}`)
                e.dataTransfer.effectAllowed = 'copy'
              }}
            >
              <span className="bib-group-chevron">
                {collapsed[group.label] ? '▸' : '▾'}
              </span>
              <span className="bib-group-label">{group.label}</span>
              <span className="bib-group-count">({group.entries.length})</span>
            </div>
          )}

          {/* Individual entries (hidden when collapsed) */}
          {!collapsed[group.label] &&
            group.entries.map(entry => (
              <div
                key={entry.key}
                className="bib-entry"
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData('text/plain', `\\cite{${entry.key}}`)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => onInsert(`\\cite{${entry.key}}`)}
              >
                <span className="bib-entry-title">{entry.title}</span>
                <span className="bib-entry-meta">
                  {entry.author?.slice(0, 50)} — {entry.year}
                </span>
                <span className="bib-entry-key">{entry.key}</span>
              </div>
            ))}
        </div>
      ))}
    </div>
  )
}
```

#### Step 4: Add CSS for Groups

**File:** `src/renderer/styles/index.css`

```css
/* Group header row */
.bib-group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-weight: 600;
  font-size: 13px;
  cursor: grab;
  user-select: none;
  border-bottom: 1px solid var(--border-color);
  background: var(--sidebar-bg);
  position: sticky;
  top: 0;
  z-index: 1;
}
.bib-group-header:hover {
  background: var(--tab-hover-bg);
}

.bib-group-chevron {
  width: 12px;
  font-size: 11px;
  color: var(--text-secondary);
}

.bib-group-count {
  color: var(--text-secondary);
  font-weight: 400;
  font-size: 12px;
  margin-left: auto;
}

/* Drag visual feedback */
.bib-group-header:active {
  opacity: 0.7;
  cursor: grabbing;
}

.bib-entry {
  padding: 6px 12px 6px 28px; /* indent under group */
  cursor: grab;
  border-bottom: 1px solid var(--border-color);
}
.bib-entry:hover {
  background: var(--tab-hover-bg);
}

/* Mode selector */
.bib-panel-header {
  display: flex;
  gap: 6px;
  padding: 8px;
  border-bottom: 1px solid var(--border-color);
}
.bib-panel-header select {
  background: var(--input-bg);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 4px;
  font-size: 12px;
}
```

#### Step 5: Wire Up the Store

**File:** `src/renderer/store/useAppStore.ts`

Add to `UserSettings` interface:
```typescript
bibGroupMode: 'flat' | 'author' | 'year' | 'tag' | 'type'
```

Add default in initial state:
```typescript
bibGroupMode: 'flat',
```

Add setter action:
```typescript
setBibGroupMode: (mode) => set(state => ({
  ...state, bibGroupMode: mode
})),
```

#### Step 6: (Optional) Zotero Search Modal Grouping

Apply the same grouping to `ZoteroCiteModal.tsx` search results:

- After search results come back from `zoteroSearch()`, group them by the
  selected mode before rendering.
- Add a small mode toggle at the top of the modal results area.
- Group headers are clickable to select/deselect all entries in the group.

This is lower priority since the BibPanel is the primary grouping surface.

---

## How the Drag-and-Drop Flow Works End-to-End

```
User drags group header "2023 (3)"
    │
    ▼
onDragStart sets dataTransfer:
    text/plain = "\cite{smith2023,jones2023,lee2023}"
    effectAllowed = "copy"
    │
    ▼
User drops on Monaco editor
    │
    ▼
EditorPane.onDrop (already implemented):
    1. e.preventDefault()
    2. text = e.dataTransfer.getData('text/plain')
    3. target = editor.getTargetAtClientPoint(e.clientX, e.clientY)
    4. editor.executeEdits('bib-drop', [{ range, text }])
    │
    ▼
"\cite{smith2023,jones2023,lee2023}" inserted at drop position
    │
    ▼
Auto-compile triggers (if enabled)
```

**No changes needed to `EditorPane.tsx`** — the existing drop handler already
accepts any `text/plain` content and inserts it at the cursor.

---

## Comparison: Zotero-Style Graph vs. TextEx Grouping

| Aspect | Zotero-Style | TextEx (this feature) |
|--------|-------------|----------------------|
| **Visualization** | Force-directed graph (PixiJS + WebGL) | Collapsible list (React DOM) |
| **Grouping** | Hub nodes in graph layout | Section headers in sidebar |
| **Interaction** | Click node → select in Zotero | Drag header → insert `\cite{}` |
| **Threshold** | 90th percentile (auto) | Optional; show all groups by default |
| **Modes** | related, author, tag | author, year, tag, type, flat |
| **Physics** | WebAssembly force simulation | None needed (list layout) |
| **Complexity** | ~500 lines TypeScript + WASM | ~150 lines TypeScript + CSS |

We borrow the **grouping algorithm concept** (attribute extraction → frequency
map → optional threshold) but use a simple **collapsible list UI** instead of a
graph, since TextEx is a text editor, not a visualization tool.

---

## Task Breakdown

| # | Task | Effort | Files |
|---|------|--------|-------|
| 1 | Add `bibGroupMode` to Zustand store | Small | `useAppStore.ts` |
| 2 | Write `groupEntries()` + `extractGroupKey()` utility | Small | `BibPanel.tsx` or new utility |
| 3 | Rewrite BibPanel with collapsible groups + group drag | Medium | `BibPanel.tsx` |
| 4 | Add CSS for group headers, chevrons, counts | Small | `index.css` |
| 5 | Add mode `<select>` dropdown to BibPanel header | Small | `BibPanel.tsx` |
| 6 | (Optional) Apply grouping to ZoteroCiteModal results | Medium | `ZoteroCiteModal.tsx` |
| 7 | (Optional) Add 90th-percentile threshold for large libraries | Small | `BibPanel.tsx` |
| 8 | Test drag-and-drop with groups | Small | Manual QA |

Total estimated scope: **~200 lines of new/changed code** across 3–4 files.

---

## Quick Start

To implement, start with tasks 1→2→3→4→5 in order. The optional tasks (6, 7)
can be added later. The existing `EditorPane.tsx` drop handler requires **zero
changes** — it already inserts any dropped `text/plain` at the cursor position.
