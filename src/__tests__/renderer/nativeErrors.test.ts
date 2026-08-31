import { beforeEach, describe, expect, it } from 'vitest'
import { normalizeNativeError } from '../../shared/appError'
import i18n from '../../renderer/i18n'
import { describeNativeError } from '../../renderer/services/nativeErrors'

describe('describeNativeError', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('keeps the native AI failure detail visible', () => {
    const error = normalizeNativeError({
      code: 'ai',
      message: 'AI operation failed: codex CLI timed out',
      data: { detail: 'codex CLI timed out' }
    })

    expect(describeNativeError(error)).toBe('The AI request failed: codex CLI timed out')
  })
})
