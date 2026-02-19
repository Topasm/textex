import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { openProject } from '../utils/openProject'
import type { Template } from '../data/templates'

function TemplateGallery() {
  const isOpen = useAppStore((s) => s.isTemplateGalleryOpen)
  const setOpen = useAppStore((s) => s.setTemplateGalleryOpen)

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
        const settings = useAppStore.getState().settings
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
        <h2>New from Template</h2>
        <p>Choose a template to start a new document.</p>

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
            {showAddForm ? 'Cancel' : '+ Add Custom'}
          </button>
          <button className="template-action-btn" onClick={handleImportZip}>
            Import ZIP
          </button>
        </div>

        {showAddForm && (
          <div className="template-add-form">
            <input
              type="text"
              placeholder="Template name"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={addDescription}
              onChange={(e) => setAddDescription(e.target.value)}
            />
            <textarea
              placeholder="LaTeX content"
              value={addContent}
              onChange={(e) => setAddContent(e.target.value)}
              rows={6}
            />
            <button
              className="template-action-btn"
              onClick={handleAdd}
              disabled={!addName.trim() || !addContent.trim()}
            >
              Save Template
            </button>
          </div>
        )}

        <h3 className="template-section-label">Built-in</h3>
        <div className="template-grid">
          {builtIn.map((t) => (
            <div
              key={t.id}
              className="template-card"
              onClick={() => handleSelect(t.name, t.content)}
            >
              <h3>{t.name}</h3>
              <p>{t.description}</p>
            </div>
          ))}
        </div>

        {custom.length > 0 && (
          <>
            <h3 className="template-section-label">Custom</h3>
            <div className="template-grid">
              {custom.map((t) => (
                <div
                  key={t.id}
                  className="template-card"
                  onClick={() => handleSelect(t.name, t.content)}
                >
                  <h3>{t.name}</h3>
                  <p>{t.description}</p>
                  <button
                    className="template-card-delete"
                    onClick={(e) => handleRemove(t.id, e)}
                    title="Remove template"
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
