import { useCallback } from 'react'
import type { EditorAdapter } from '../../editor/EditorAdapter'
import { useProjectStore } from '../../store/useProjectStore'
import { generateFigureSnippet } from '../../utils/figureSnippet'
import { IMAGE_EXTENSIONS } from '../../utils/imageExtensions'

export const MAX_DROPPED_IMAGE_BYTES = 50 * 1024 * 1024

export function droppedImageFileName(name: string): string | null {
  const sourceName = name.split(/[\\/]/).pop()?.trim()
  if (!sourceName || sourceName === '.' || sourceName === '..') return null

  const extensionIndex = sourceName.lastIndexOf('.')
  if (extensionIndex <= 0 || extensionIndex === sourceName.length - 1) return null
  const extension = sourceName.slice(extensionIndex).toLowerCase()
  const stem = sourceName
    .slice(0, extensionIndex)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .replace(/-{2,}/g, '-')

  return `${stem || 'image'}${extension}`
}

export function useSmartImageDrop() {
  const projectRoot = useProjectStore((state) => state.projectRoot)

  const handleDrop = useCallback(
    async (event: React.DragEvent, editorAdapter: EditorAdapter | null) => {
      if (!event.dataTransfer.files || event.dataTransfer.files.length === 0) return

      const file = event.dataTransfer.files[0]
      const fileName = droppedImageFileName(file.name)
      if (!fileName) return
      const extension = '.' + fileName.split('.').pop()?.toLowerCase()
      if (!IMAGE_EXTENSIONS.has(extension)) return

      event.preventDefault()
      event.stopPropagation()

      if (file.size > MAX_DROPPED_IMAGE_BYTES) {
        alert('Image files larger than 50 MB cannot be imported.')
        return
      }

      if (!projectRoot || !editorAdapter) {
        console.warn('SmartImageDrop: Missing projectRoot or editor instance')
        return
      }

      try {
        const separator = projectRoot.includes('\\') ? '\\' : '/'
        const imagesDirectory = `${projectRoot}${separator}images`
        await window.api.createDirectory(imagesDirectory)

        const destinationPath = `${imagesDirectory}${separator}${fileName}`
        const bytes = new Uint8Array(await file.arrayBuffer())
        const imported = await window.api.writeFileBinary(destinationPath, bytes)
        const importedFileName = imported.filePath.split(/[\\/]/).pop() || fileName

        const snippet = generateFigureSnippet(`images/${importedFileName}`, importedFileName)
        const targetPosition = editorAdapter.getPositionAtClientPoint(event.clientX, event.clientY)

        if (targetPosition) {
          editorAdapter.applyEdits('image-drop', [
            {
              range: { start: targetPosition, end: targetPosition },
              text: snippet,
              forceMoveMarkers: true
            }
          ])
          editorAdapter.setPosition(targetPosition)
          editorAdapter.focus()
        } else {
          const position = editorAdapter.getPosition()
          if (position) {
            editorAdapter.applyEdits('image-drop', [
              {
                range: { start: position, end: position },
                text: snippet,
                forceMoveMarkers: true
              }
            ])
          }
        }
      } catch (error) {
        console.error('SmartImageDrop: Failed to process image drop', error)
        alert('Failed to import image: ' + (error instanceof Error ? error.message : String(error)))
      }
    },
    [projectRoot]
  )

  return { handleDrop }
}
