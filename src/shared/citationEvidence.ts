/** Persisted excerpts are observations of source text, never semantic claim verification. */
export interface CitationEvidence {
  id: string
  citekey: string
  pdf: string
  page: number
  quote: string
  sha256: string
  savedAt: string
}

export const CITATION_EVIDENCE_FILE = 'citation-evidence.json'
export const MAX_EVIDENCE_QUOTE = 4000
export const MAX_EVIDENCE_RECORDS = 500

export function normalizeEvidenceText(text: string): string {
  return text.normalize('NFKC').replace(/\s+/gu, ' ').trim()
}

export function evidenceQuoteMatches(text: string, quote: string): boolean {
  const normalized = normalizeEvidenceText(quote)
  return (
    normalized.length > 0 &&
    quote.length <= MAX_EVIDENCE_QUOTE &&
    normalizeEvidenceText(text).includes(normalized)
  )
}

export function isRelativeEvidencePdf(path: string): boolean {
  return (
    path.length <= 1024 &&
    !/^[\\/]|:|[\p{Cc}\p{Cf}]/u.test(path) &&
    path.split(/[\\/]/u).every((part) => part.length > 0 && part !== '.' && part !== '..') &&
    /\.pdf$/iu.test(path)
  )
}

export function parseCitationEvidence(content: string): CitationEvidence[] {
  if (content.length > 3_000_000) throw new Error('Invalid citation evidence file')
  const data: unknown = JSON.parse(content)
  if (
    !data ||
    typeof data !== 'object' ||
    !('version' in data) ||
    data.version !== 1 ||
    !('entries' in data) ||
    !Array.isArray(data.entries) ||
    data.entries.length > MAX_EVIDENCE_RECORDS
  )
    throw new Error('Invalid citation evidence file')
  const ids = new Set<string>()
  return data.entries.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid citation evidence entry')
    const e = entry as Record<string, unknown>
    if (
      typeof e.id !== 'string' ||
      !/^[\da-f-]{36}$/iu.test(e.id) ||
      ids.has(e.id) ||
      typeof e.citekey !== 'string' ||
      !e.citekey.trim() ||
      e.citekey.length > 256 ||
      typeof e.pdf !== 'string' ||
      !isRelativeEvidencePdf(e.pdf) ||
      typeof e.page !== 'number' ||
      !Number.isSafeInteger(e.page) ||
      e.page < 1 ||
      typeof e.quote !== 'string' ||
      !e.quote.trim() ||
      e.quote.length > MAX_EVIDENCE_QUOTE ||
      typeof e.sha256 !== 'string' ||
      !/^[\da-f]{64}$/u.test(e.sha256) ||
      typeof e.savedAt !== 'string' ||
      !Number.isFinite(Date.parse(e.savedAt))
    )
      throw new Error('Invalid citation evidence entry')
    ids.add(e.id)
    return {
      id: e.id,
      citekey: e.citekey,
      pdf: e.pdf,
      page: e.page,
      quote: e.quote,
      sha256: e.sha256,
      savedAt: e.savedAt
    }
  })
}
