import { useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'
import { templates } from '../data/templates'

function TemplateGallery() {
  const isOpen = useAppStore((s) => s.isTemplateGalleryOpen)
  const setOpen = useAppStore((s) => s.setTemplateGalleryOpen)

  const handleSelect = useCallback(
    async (content: string) => {
      // Save as new file from template
      try {
        const result = await window.api.saveFileAs(content)
        if (result) {
          useAppStore.getState().openFileInTab(result.filePath, content)
          useAppStore.getState().setDirty(false)
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
              onClick={() => handleSelect(t.content)}
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
