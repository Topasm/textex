import i18n from '../i18n'
import { useCompileStore } from '../store/useCompileStore'
import { useNotificationStore } from '../store/useNotificationStore'
import { useUiStore } from '../store/useUiStore'
import { hasNativeErrorCode, nativeErrorCode } from '../../shared/appError'
import { describeNativeError } from './nativeErrors'
import { openProblemsPanel } from './appCommands'

/**
 * Surfaces a failed compile.
 *
 * A failed build used to change only the status-bar dot, so a background auto
 * compile could fail unnoticed while the author kept typing, and even a manual
 * compile left the reason buried in a panel the author had to know to open.
 *
 * Every failure reuses one notification id, so a document that fails on each
 * keystroke replaces its notification instead of stacking a wall of them.
 */
export const COMPILE_FAILURE_NOTIFICATION_ID = 'compile-failure'

export type CompileOrigin = 'manual' | 'automatic'

/** The first thing worth reading: an engine error beats a parsed diagnostic. */
function failureReason(error: unknown): string {
  if (nativeErrorCode(error) !== null && !hasNativeErrorCode(error, 'compilerFailed')) {
    return describeNativeError(error)
  }
  const firstError = useCompileStore
    .getState()
    .diagnostics.find((diagnostic) => diagnostic.severity === 'error')
  if (firstError) {
    return i18n.t('notifications.compileProblem', {
      line: firstError.line,
      message: firstError.message
    })
  }
  return describeNativeError(error)
}

export function reportCompileFailure(error: unknown, origin: CompileOrigin): void {
  // A missing engine is a setup problem, not a document problem: the Problems
  // view would only repeat the same sentence, so point at the fix instead.
  const isSetupFailure = hasNativeErrorCode(error, 'compilerNotFound')

  // The author asked for this build, so put the detail in front of them.
  const openedProblems = !isSetupFailure && origin === 'manual' && openProblemsPanel()

  useNotificationStore.getState().pushNotification({
    id: COMPILE_FAILURE_NOTIFICATION_ID,
    tone: 'error',
    message: i18n.t('notifications.compileFailed', { reason: failureReason(error) }),
    action: isSetupFailure
      ? {
          label: i18n.t('notifications.openSettings'),
          run: () => useUiStore.getState().requestSettings(),
          dismissOnRun: true
        }
      : openedProblems
        ? undefined
        : {
            label: i18n.t('notifications.viewProblems'),
            run: () => {
              openProblemsPanel()
            },
            dismissOnRun: true
          }
  })
}

/** Clears a previous failure once a build succeeds or is superseded. */
export function clearCompileFailure(): void {
  useNotificationStore.getState().dismissNotification(COMPILE_FAILURE_NOTIFICATION_ID)
}
