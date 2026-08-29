/**
 * Native error contract shared by the desktop renderer, the CLI, and the MCP
 * server.
 *
 * Tauri commands reject with `{ code, message, data }` (see
 * `AppError::serialize` in `src-tauri/src/error.rs`). The code is the stable
 * part: features branch on it and the renderer localizes it. `message` is an
 * English fallback that stays useful in logs and bug reports, and `data`
 * carries the interpolation values for a localized message.
 *
 * `NATIVE_ERROR_CODES` mirrors `AppError::code()`; the two lists are kept in
 * sync by `src/__tests__/shared/appError.test.ts`.
 */

export const NATIVE_ERROR_CODES = [
  'invalidPath',
  'projectNotOpen',
  'outsideProject',
  'notAFile',
  'notADirectory',
  'fileTooLarge',
  'nonUtf8Path',
  'io',
  'worker',
  'watcher',
  'gitIo',
  'gitFailed',
  'gitOutputTooLarge',
  'gitSafety',
  'packageData',
  'projectIndex',
  'syncTex',
  'referenceIndex',
  'researchSource',
  'history',
  'recovery',
  'projectData',
  'spellcheck',
  'template',
  'export',
  'submissionCheck',
  'externalUrl',
  'performance',
  'systemTerminal',
  'zotero',
  'ai',
  'settings',
  'updater',
  'recentProjectUnauthorized',
  'statePoisoned',
  'compilationSuperseded',
  'compilationCancelled',
  'compilationTimedOut',
  'compilerNotFound',
  'compilerIo',
  'compilerFailed',
  'compiledPdfMissing',
  'runtimePath',
  'compilerWorker'
] as const

export type NativeErrorCode = (typeof NATIVE_ERROR_CODES)[number]

const KNOWN_CODES = new Set<string>(NATIVE_ERROR_CODES)

export interface NativeErrorPayload {
  code: string
  message: string
  data: Record<string, unknown> | null
}

/**
 * A rejected native call, carrying its code and interpolation data.
 *
 * It extends `Error` so every existing `errorMessage(err)` call site keeps
 * reading the English sentence unchanged; only code that asks for `.code`
 * sees the new contract.
 */
export class NativeError extends Error {
  readonly code: string
  readonly data: Record<string, unknown> | null

  constructor(payload: NativeErrorPayload) {
    super(payload.message)
    this.name = 'NativeError'
    this.code = payload.code
    this.data = payload.data
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isNativeErrorPayload(value: unknown): value is NativeErrorPayload {
  if (!isRecord(value)) return false
  if (typeof value.code !== 'string' || value.code.length === 0) return false
  if (typeof value.message !== 'string') return false
  return value.data === null || value.data === undefined || isRecord(value.data)
}

/**
 * Converts a native rejection into an `Error`.
 *
 * A structured payload becomes a `NativeError`; anything else (a Tauri
 * transport string, a renderer-side throw) is preserved as a plain `Error` so
 * callers never have to guess whether they were handed an object.
 */
export function normalizeNativeError(value: unknown): Error {
  if (isNativeErrorPayload(value)) {
    return new NativeError({
      code: value.code,
      message: value.message,
      data: isRecord(value.data) ? value.data : null
    })
  }
  if (value instanceof Error) return value
  return new Error(typeof value === 'string' ? value : String(value))
}

/** Returns the code only when the native side sent one this build knows. */
export function nativeErrorCode(value: unknown): NativeErrorCode | null {
  if (!(value instanceof NativeError)) return null
  return KNOWN_CODES.has(value.code) ? (value.code as NativeErrorCode) : null
}

export function hasNativeErrorCode(value: unknown, ...codes: NativeErrorCode[]): boolean {
  const code = nativeErrorCode(value)
  return code !== null && codes.includes(code)
}

/** Interpolation values for a localized message, never `undefined`. */
export function nativeErrorData(value: unknown): Record<string, unknown> {
  return value instanceof NativeError && value.data ? value.data : {}
}
