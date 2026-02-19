import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUiStore } from '../store/useUiStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { openProject } from '../utils/openProject'
import type { Template } from '../data/templates'

function TemplateGallery() {
  const { t } = useTranslation()
  const isOpen = useUiStore((s) => s.isTemplateGalleryOpen)
  const setOpen = useUiStore((s) => s.setTemplateGalleryOpen)

  const [templates, setTemplates] = useState<Template[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addName, setAddName] = useState('')
  const [addDescription, setAddDescription] = useState('')
  const [addContent, setAddContent] = useState('')

  const loadTemplates = useCallback(async () => {
    try {
      const list = await window.api.listTemplates()
      setTemplates(list)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates')
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      loadTemplates()
      setShowAddForm(false)
      setAddName('')
      setAddDescription('')
      setAddContent('')
    }
  }, [isOpen, loadTemplates])

  const handleSelect = useCallback(
    async (templateName: string, content: string) => {
      try {
        const settings = useSettingsStore.getState().settings
        const finalContent = content
          .replace(/{{AUTHOR}}/g, settings.name || 'Author Name')
          .replace(/{{EMAIL}}/g, settings.email || 'your.email@example.com')
          .replace(/{{AFFILIATION}}/g, settings.affiliation || 'Institution')

        const result = await window.api.createTemplateProject(templateName, finalContent)
        if (result) {
          await openProject(result.projectPath)
        }
      } catch {
        // user cancelled
      }
      setOpen(false)
    },
    [setOpen]
  )

  const handleAdd = useCallback(async () => {
    if (!addName.trim() || !addContent.trim()) return
    try {
      await window.api.addTemplate(addName.trim(), addDescription.trim(), addContent)
      setShowAddForm(false)
      setAddName('')
      setAddDescription('')
      setAddContent('')
      await loadTemplates()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add template')
    }
  }, [addName, addDescription, addContent, loadTemplates])

  const handleRemove = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation()
      try {
        await window.api.removeTemplate(id)
        await loadTemplates()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove template')
      }
    },
    [loadTemplates]
  )

  const handleImportZip = useCallback(async () => {
    try {
      const result = await window.api.importTemplateZip()
      if (result) {
        await loadTemplates()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import template')
    }
  }, [loadTemplates])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) setOpen(false)
    },
    [setOpen]
  )

  if (!isOpen) return null

  const builtIn = templates.filter((t) => t.builtIn)
  const custom = templates.filter((t) => !t.builtIn)

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal">
        <button className="modal-close" onClick={() => setOpen(false)}>
          {'\u00D7'}
        </button>
        <h2>{t('templateGallery.title')}</h2>
        <p>{t('templateGallery.description')}</p>

        {error && (
          <div className="template-error">
            {error}
            <button onClick={() => setError(null)}>{'\u00D7'}</button>
          </div>
        )}

        <div className="template-actions">
          <button
            className="template-action-btn"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? t('templateGallery.cancel') : t('templateGallery.addCustom')}
          </button>
          <button className="template-action-btn" onClick={handleImportZip}>
            {t('templateGallery.importZip')}
          </button>
        </div>

        {showAddForm && (
          <div className="template-add-form">
            <input
              type="text"
              placeholder={t('templateGallery.templateName')}
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
            />
            <input
              type="text"
              placeholder={t('templateGallery.templateDescription')}
              value={addDescription}
              onChange={(e) => setAddDescription(e.target.value)}
            />
            <textarea
              placeholder={t('templateGallery.latexContent')}
              value={addContent}
              onChange={(e) => setAddContent(e.target.value)}
              rows={6}
            />
            <button
              className="template-action-btn"
              onClick={handleAdd}
              disabled={!addName.trim() || !addContent.trim()}
            >
              {t('templateGallery.saveTemplate')}
            </button>
          </div>
        )}

        <h3 className="template-section-label">{t('templateGallery.builtIn')}</h3>
        <div className="template-grid">
          {builtIn.map((tmpl) => (
            <div
              key={tmpl.id}
              className="template-card"
              onClick={() => handleSelect(tmpl.name, tmpl.content)}
            >
              <h3>{tmpl.name}</h3>
              <p>{tmpl.description}</p>
            </div>
          ))}
        </div>

        {custom.length > 0 && (
          <>
            <h3 className="template-section-label">{t('templateGallery.custom')}</h3>
            <div className="template-grid">
              {custom.map((tmpl) => (
                <div
                  key={tmpl.id}
                  className="template-card"
                  onClick={() => handleSelect(tmpl.name, tmpl.content)}
                >
                  <h3>{tmpl.name}</h3>
                  <p>{tmpl.description}</p>
                  <button
                    className="template-card-delete"
                    onClick={(e) => handleRemove(tmpl.id, e)}
                    title={t('templateGallery.removeTemplate')}
                  >
                    {'\u2715'}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default TemplateGallery
