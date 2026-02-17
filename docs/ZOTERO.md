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
2.  Ensure **Zotero Integration** is enabled.
3.  If you changed the port in Zotero, update the **Zotero Port** setting in TextEx.

## Usage

### Inserting Citations (Inline Search)
1.  Press `Ctrl+Shift+Z` (or `Cmd+Shift+Z` on macOS) to focus the Zotero search bar in the toolbar, or click it directly.
2.  Type 3+ characters to search your library (title, author, year, etc.).
3.  A dropdown appears with matching results. Navigate with `Up`/`Down` arrow keys.
4.  Press `Enter` to toggle selection on the highlighted result (multi-select with checkboxes).
5.  Press `Ctrl+Enter` (or `Cmd+Enter`) to insert `\cite{key1,key2}` at the cursor.
6.  Press `Escape` to close the dropdown.
7.  **Drag and Drop:** You can also drag a reference from the "Bib" panel in the sidebar directly into the editor to insert its citation.

### Exporting to .bib
TextEx automatically manages your `.bib` file, but you can also manually trigger a sync if needed. When you compile, TextEx ensures the bibliography is updated.
