export const MAX_CITATION_KEY_BYTES = 512

/** Citation keys accepted across drag payloads, persisted Chat sources, and native lookups. */
export function isSafeCitationKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_CITATION_KEY_BYTES &&
    /^[A-Za-z0-9:_-]+$/u.test(value)
  )
}
