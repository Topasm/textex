import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  NATIVE_ERROR_CODES,
  NativeError,
  hasNativeErrorCode,
  isNativeErrorPayload,
  nativeErrorCode,
  nativeErrorData,
  normalizeNativeError
} from '../../shared/appError'
import en from '../../renderer/i18n/locales/en.json'

const root = process.cwd()
const errorSource = readFileSync(resolve(root, 'src-tauri/src/error.rs'), 'utf8')

function capture(source: string, pattern: RegExp, description: string): string {
  const match = source.match(pattern)
  if (!match?.groups?.body) throw new Error(`Could not parse ${description}`)
  return match.groups.body
}

const rustCodes = [
  ...capture(
    errorSource,
    /pub fn code\(&self\) -> &'static str \{\n\s*match self \{(?<body>[\s\S]*?)\n\s*\}\n\s*\}/u,
    'AppError::code() in src-tauri/src/error.rs'
  ).matchAll(/=> "(?<code>[A-Za-z0-9]+)",/gu)
].map((match) => match.groups!.code)

describe('native error contract', () => {
  it('parses every arm of the Rust code table', () => {
    expect(rustCodes.length).toBe(NATIVE_ERROR_CODES.length)
  })

  it('exposes exactly the codes the native side can send', () => {
    expect([...rustCodes].sort()).toEqual([...NATIVE_ERROR_CODES].sort())
  })

  it('has an English message for every code', () => {
    const messages = en.errors as Record<string, string>
    const missing = NATIVE_ERROR_CODES.filter((code) => !messages[code])
    expect(missing).toEqual([])
  })
})

describe('normalizeNativeError', () => {
  it('turns a serialized AppError into a NativeError that still reads as an Error', () => {
    const error = normalizeNativeError({
      code: 'compilerNotFound',
      message: 'LaTeX compiler executable was not found. Checked: /usr/bin',
      data: { checkedPaths: '/usr/bin' }
    })

    expect(error).toBeInstanceOf(NativeError)
    expect(error.message).toBe('LaTeX compiler executable was not found. Checked: /usr/bin')
    expect(nativeErrorCode(error)).toBe('compilerNotFound')
    expect(nativeErrorData(error)).toEqual({ checkedPaths: '/usr/bin' })
  })

  it('accepts a payload without data', () => {
    const error = normalizeNativeError({
      code: 'compilationCancelled',
      message: 'LaTeX compilation was cancelled',
      data: null
    })

    expect(hasNativeErrorCode(error, 'compilationCancelled')).toBe(true)
    expect(nativeErrorData(error)).toEqual({})
  })

  it('preserves a Tauri transport string as a plain Error', () => {
    const error = normalizeNativeError('missing signing key')

    expect(error).not.toBeInstanceOf(NativeError)
    expect(error.message).toBe('missing signing key')
    expect(nativeErrorCode(error)).toBeNull()
  })

  it('passes an existing Error through untouched', () => {
    const original = new Error('renderer failure')
    expect(normalizeNativeError(original)).toBe(original)
  })

  it('reports no code for a native code this build does not know', () => {
    const error = normalizeNativeError({ code: 'someFutureCode', message: 'later', data: null })

    expect(error).toBeInstanceOf(NativeError)
    expect(nativeErrorCode(error)).toBeNull()
    expect(hasNativeErrorCode(error, 'compilationCancelled')).toBe(false)
  })

  it('rejects payloads that are not the native error shape', () => {
    expect(isNativeErrorPayload({ code: 'io' })).toBe(false)
    expect(isNativeErrorPayload({ message: 'io' })).toBe(false)
    expect(isNativeErrorPayload(['io'])).toBe(false)
    expect(isNativeErrorPayload(null)).toBe(false)
  })
})
