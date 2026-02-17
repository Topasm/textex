/**
 * Extract a human-readable message from an unknown error value.
 */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Log an error with context. Used to replace silent `catch(() => {})` blocks
 * where errors should at least be visible during development.
 */
export function logError(context: string, err: unknown): void {
  console.error(`[${context}]`, err instanceof Error ? err.message : err)
}
