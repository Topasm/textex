import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { LEARNING_HINTS, type LearningHint, type LearningHintId } from '../../shared/learningHints'
import { useLearningStore } from '../store/useLearningStore'
import { useNotificationStore } from '../store/useNotificationStore'
import { useUiStore } from '../store/useUiStore'

const FEATURE_HINT_DELAY_MS = 6_500
let hintShownThisSession = false

interface FeatureHintContext {
  filePath: string | null
  pdfPath: string | null
  projectRoot: string | null
  pdfViewMode: 'continuous' | 'single'
  isSidebarOpen: boolean
  isResearchPanelOpen: boolean
  suppressed: boolean
}

function hintIsRelevant(id: LearningHintId, context: FeatureHintContext): boolean {
  const hasTexDocument = Boolean(context.filePath?.toLocaleLowerCase().endsWith('.tex'))
  switch (id) {
    case 'workspace-pair-swipe':
      return Boolean(context.projectRoot && hasTexDocument)
    case 'pdf-page-swipe':
      return Boolean(context.pdfPath && context.pdfViewMode === 'single')
    case 'panel-tab-swipe':
      return Boolean(context.projectRoot && (context.isSidebarOpen || context.isResearchPanelOpen))
    case 'source-pdf-sync':
      return Boolean(hasTexDocument && context.pdfPath)
  }
}

export function resetFeatureHintSessionForTests(): void {
  hintShownThisSession = false
}

/**
 * Teaches one relevant feature per application session without interrupting
 * the editor. Dismissing or opening the guide persists that hint choice, so
 * later sessions can reveal the next useful capability instead of repeating
 * the same tip forever.
 */
export function useFeatureHints(context: FeatureHintContext): void {
  const { t } = useTranslation()
  const dismissedHintIds = useLearningStore((state) => state.dismissedHintIds)
  const notificationCount = useNotificationStore((state) => state.notifications.length)

  const nextHint: LearningHint | undefined = LEARNING_HINTS.find(
    (hint) => !dismissedHintIds.includes(hint.id) && hintIsRelevant(hint.id, context)
  )

  useEffect(() => {
    if (hintShownThisSession || context.suppressed || notificationCount > 0 || !nextHint) {
      return
    }

    const timer = window.setTimeout(() => {
      if (hintShownThisSession) return
      hintShownThisSession = true
      const dismissHint = (): void => useLearningStore.getState().dismissHint(nextHint.id)
      useNotificationStore.getState().pushNotification({
        id: `learning-hint-${nextHint.id}`,
        tone: 'info',
        message: t(nextHint.messageKey),
        action: {
          label: t('learning.openGuide'),
          run: () => useUiStore.getState().requestHelp(nextHint.sectionId)
        },
        dismissible: true,
        timeoutMs: null,
        onDismiss: dismissHint
      })
    }, FEATURE_HINT_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [context.suppressed, nextHint, notificationCount, t])
}
