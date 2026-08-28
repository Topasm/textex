import i18n from '../i18n'
import { nativeErrorCode, nativeErrorData } from '../../shared/appError'
import { errorMessage } from '../utils/errorMessage'

/**
 * Localized, user-facing text for a rejected native call.
 *
 * Native errors cross the boundary as `{ code, message, data }`, so the code
 * selects an `errors.*` template and `data` fills its placeholders. Anything
 * without a known code — a renderer-side throw, a Tauri transport failure, or
 * a native error this build has no message for — falls back to the English
 * sentence, which keeps the text readable instead of blank.
 */
export function describeNativeError(error: unknown): string {
  const code = nativeErrorCode(error)
  const fallback = errorMessage(error)
  if (!code) return fallback
  return String(i18n.t(`errors.${code}`, { ...nativeErrorData(error), defaultValue: fallback }))
}
