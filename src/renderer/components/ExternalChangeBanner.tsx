import { useTranslation } from 'react-i18next'
import { useUiStore } from '../store/useUiStore'
import { useEditorStore } from '../store/useEditorStore'

function ExternalChangeBanner() {
  const { t } = useTranslation()
  const conflicts = useUiStore((s) => s.externalChangeConflicts)
  const activeFilePath = useEditorStore((s) => s.activeFilePath)

  // Only show banner for the currently active file if it has a conflict
  if (!activeFilePath || !conflicts.includes(activeFilePath)) return null

  const fileName = activeFilePath.split(/[\\/]/).pop() || activeFilePath

  const handleReload = async () => {
    try {
      const { content } = await window.api.readFile(activeFilePath)
      useEditorStore.getState().reloadFileContent(activeFilePath, content)
    } catch {
      // ignore read errors
    }
    useUiStore.getState().removeExternalChangeConflict(activeFilePath)
  }

  const handleKeep = () => {
    useUiStore.getState().removeExternalChangeConflict(activeFilePath)
  }

  return (
    <div className="update-banner external-change-banner">
      <span className="update-banner-message">
        {t('externalChange.message', { file: fileName })}
      </span>
      <button onClick={handleReload}>{t('externalChange.reload')}</button>
      <button className="update-dismiss" onClick={handleKeep}>
        {t('externalChange.keep')}
      </button>
    </div>
  )
}

export default ExternalChangeBanner
