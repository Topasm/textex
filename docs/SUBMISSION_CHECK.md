# Submission Check

Submission Check is a deterministic, read-only preflight for the current LaTeX
paper. It is available from the Current Paper reference-health card, the app
command palette, and Research Chat's `/submission-check` command. Results open
as a secondary References view rather than adding another top-level panel.

## Checks

The native scanner resolves `%! TeX root`, follows project-contained `\input`,
`\include`, and `\subfile` references, and reports structured findings for:

- missing TeX inputs, figures, and bibliography files;
- undefined citations and cross-references;
- duplicate and unused labels;
- classic BibTeX usage without `\bibliographystyle`;
- author names, email addresses, and acknowledgement content that may violate
  anonymous-submission requirements.

Each finding has a stable code, severity, source file, and line. Selecting a
finding uses the same project-contained navigation path as compiler diagnostics.
The check reads saved project files and never changes sources, bibliography
data, compiler settings, or Zotero.

## Safety and scope

- The selected file and resolved magic root must be `.tex` files inside the
  active project.
- Canonical containment checks prevent included files and symlinks from
  escaping the project.
- A scan is limited to 256 TeX files, 2 MiB per source or bibliography file,
  and 16 MiB total for each source and bibliography phase.
- Results are deterministically sorted and contain no timestamps.
- Venue presets, PDF font embedding, image resolution, and PDF metadata checks
  are intentionally deferred until they can be implemented accurately across
  every supported platform.
