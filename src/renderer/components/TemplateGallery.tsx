import { useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'
import { templates } from '../data/templates'
import { openProject } from '../utils/openProject'

function TemplateGallery() {
  const isOpen = useAppStore((s) => s.isTemplateGalleryOpen)
  const setOpen = useAppStore((s) => s.setTemplateGalleryOpen)

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

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) setOpen(false)
    },
    [setOpen]
  )

  if (!isOpen) return null

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal">
        <button className="modal-close" onClick={() => setOpen(false)}>
          {'\u00D7'}
        </button>
        <h2>New from Template</h2>
        <p>Choose a template to start a new document.</p>
        <div className="template-grid">
          {templates.map((t) => (
            <div
              key={t.name}
              className="template-card"
              onClick={() => handleSelect(t.name, t.content)}
            >
              <h3>{t.name}</h3>
              <p>{t.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default TemplateGallery
