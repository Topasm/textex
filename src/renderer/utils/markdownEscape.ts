/** Characters the notes Markdown renderer prints literally after a backslash. */
const MARKDOWN_SPECIAL = /[\\`*_{}[\]<>#!|]/u
const MARKDOWN_SPECIALS = new RegExp(MARKDOWN_SPECIAL.source, 'gu')

/** Matches one backslash escape; group 1 is the literal character. */
export const MARKDOWN_ESCAPE_RE = new RegExp(`\\\\(${MARKDOWN_SPECIAL.source})`, 'u')

/** Escapes text so the notes renderer shows it verbatim (see MARKDOWN_ESCAPE_RE). */
export function escapeMarkdownText(text: string): string {
  return text.replace(MARKDOWN_SPECIALS, '\\$&')
}
