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

### Inserting Citations (Search)
1.  Press `Ctrl+Shift+Z` (or `Cmd+Shift+Z` on macOS) to open the Zotero search modal.
2.  Type to search your library (title, author, year, etc.).
3.  Select a reference using `Up`/`Down` arrows.
4.  Press `Enter` to insert the citation key (e.g., `\cite{knuth1984}`).
    -   Press `Ctrl+Enter` (or `Cmd+Enter`) to insert immediately.
5.  **Show in Zotero:** Hover over a result and click **Show in Zotero ↗** to open the paper in your Zotero library.

### Inserting Citations (Zotero Picker)
1.  Press `Ctrl+Shift+C` to open the native "Cite as You Write" (CAYW) picker window from Zotero.
2.  Select your references in the Zotero popup.
3.  Click OK to insert them into TextEx.

### Exporting to .bib
TextEx automatically manages your `.bib` file, but you can also manually trigger a sync if needed. When you compile, TextEx ensures the bibliography is updated.
