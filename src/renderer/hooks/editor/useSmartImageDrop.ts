import { useCallback } from 'react'
import type { EditorAdapter } from '../../editor/EditorAdapter'
import { useProjectStore } from '../../store/useProjectStore'
import { generateFigureSnippet } from '../../utils/figureSnippet'
import { IMAGE_EXTENSIONS } from '../../utils/imageExtensions'

export function useSmartImageDrop() {
  const projectRoot = useProjectStore((state) => state.projectRoot)

  const handleDrop = useCallback(
    async (event: React.DragEvent, editorAdapter: EditorAdapter | null) => {
      if (!event.dataTransfer.files || event.dataTransfer.files.length === 0) return

      const file = event.dataTransfer.files[0]
      const extension = '.' + file.name.split('.').pop()?.toLowerCase()
      if (!IMAGE_EXTENSIONS.has(extension)) return

      event.preventDefault()
      event.stopPropagation()

      if (!projectRoot || !editorAdapter) {
        console.warn('SmartImageDrop: Missing projectRoot or editor instance')
        return
      }

      try {
        const separator = projectRoot.includes('\\') ? '\\' : '/'
        const imagesDirectory = `${projectRoot}${separator}images`
        await window.api.createDirectory(imagesDirectory)

        const destinationPath = `${imagesDirectory}${separator}${file.name}`
        interface ElectronFile extends File {
          path: string
        }
        const sourcePath = (file as ElectronFile).path

        if (sourcePath) {
          await window.api.copyFile(sourcePath, destinationPath)
        } else {
          console.error('SmartImageDrop: Could not get source path from dropped file')
          return
        }

        const snippet = generateFigureSnippet(`images/${file.name}`, file.name)
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
