# NeuroTeX — MVP Requirements

## Definition

The MVP is the smallest functional version of NeuroTeX that delivers the core
value proposition: **edit LaTeX and see a PDF preview, with no external TeX
installation required**.

---

## Must-Have Features (MVP)

### 1. File Operations
- [ ] Open a `.tex` file from disk via native file dialog.
- [ ] Save the current file (`Ctrl/Cmd+S`).
- [ ] Save As to a new location (`Ctrl/Cmd+Shift+S`).
- [ ] Track unsaved changes (dirty indicator in title bar / toolbar).

### 2. Code Editor
- [ ] Monaco Editor embedded in the left pane.
- [ ] Basic LaTeX syntax highlighting.
- [ ] Word wrap enabled by default.
- [ ] Standard editor features (undo, redo, find/replace via Monaco built-ins).

### 3. Compilation
- [ ] Bundled Tectonic binary resolved per platform (win/mac/linux).
- [ ] Manual compile via button or `Ctrl/Cmd+Enter`.
- [ ] Auto-compile on 1-second idle after typing.
- [ ] Compilation stderr streamed to a log panel in real time.

### 4. PDF Preview
- [ ] Display compiled PDF in the right pane using react-pdf.
- [ ] Scroll through multi-page documents.
- [ ] Re-render on successful recompile without losing scroll position.

### 5. Error Display
- [ ] Log panel shows Tectonic stderr output.
- [ ] Log panel auto-opens on compilation failure.
- [ ] Status bar shows current compile state (idle / compiling / error).

### 6. Packaging
- [ ] Builds to a distributable installer for at least one platform.
- [ ] Tectonic binary is included in the packaged app.

---

## Nice-to-Have (Post-MVP)

These are explicitly **out of scope** for the first release:

- [ ] Draggable split-pane divider.
- [ ] PDF zoom controls.
- [ ] SyncTeX (click source ↔ PDF jump).
- [ ] Multi-file project support.
- [ ] LaTeX snippet insertion / template gallery.
- [ ] Dark/light theme toggle.
- [ ] Custom font size setting.
- [ ] Auto-update mechanism.
- [ ] BibTeX / bibliography support UI.
- [ ] Git integration.
- [ ] Spell checker.
- [ ] Export to other formats (HTML, DOCX via Pandoc).

---

## Prerequisites Before Coding

1. **Download Tectonic binary** for your development OS from
   [Tectonic Releases](https://github.com/tectonic-typesetting/tectonic/releases).
   Place it in `resources/bin/{platform}/`.

2. **Verify Tectonic works** by running it from the command line:
   ```bash
   ./resources/bin/linux/tectonic -X compile test.tex
   ```

3. **Node.js ≥ 18** installed.

4. **Internet access** for the first compilation (Tectonic downloads packages).

---

## Acceptance Criteria

The MVP is complete when:

1. A user can install the app on their OS without any prior TeX installation.
2. They can open or create a `.tex` file.
3. They can type LaTeX and see a PDF preview update within a few seconds.
4. Compilation errors are displayed clearly.
5. They can save their work.
