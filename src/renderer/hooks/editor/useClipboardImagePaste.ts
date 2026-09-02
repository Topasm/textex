import { useCallback } from 'react'
import i18n from '../../i18n'
import type { EditorAdapter } from '../../editor/EditorAdapter'
import { useNotificationStore } from '../../store/useNotificationStore'
import { useProjectStore } from '../../store/useProjectStore'
import { findClipboardImage } from '../../utils/clipboardImage'
import { generateFigureSnippet } from '../../utils/figureSnippet'
import { importImageIntoProject, MAX_IMPORTED_IMAGE_BYTES } from '../../utils/imageImport'

function formatByteLimit(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`
}

/**
 * Turns a clipboard image into a figure: the bytes are copied into the
 * project's images directory and the cursor position receives an
 * `\includegraphics` figure environment citing the copy.
 */
export function useClipboardImagePaste() {
  const projectRoot = useProjectStore((state) => state.projectRoot)
  const pushNotification = useNotificationStore((state) => state.pushNotification)

  const handlePaste = useCallback(
    async (event: React.ClipboardEvent, editorAdapter: EditorAdapter | null): Promise<boolean> => {
      const image = findClipboardImage(event.clipboardData)
      if (!image) return false

      // Claim the paste before Monaco sees it, so an image never lands in the
      // document as the text flavor the clipboard also carries.
      event.preventDefault()
      event.stopPropagation()

      if (!projectRoot) {
        pushNotification({
          id: 'clipboard-image:no-project',
          tone: 'warning',
          message: i18n.t('notifications.clipboardImageNoProject')
        })
        return true
      }
      if (image.file.size > MAX_IMPORTED_IMAGE_BYTES) {
        pushNotification({
          id: 'clipboard-image:too-large',
          tone: 'warning',
          message: i18n.t('notifications.clipboardImageTooLarge', {
            limit: formatByteLimit(MAX_IMPORTED_IMAGE_BYTES)
          })
        })
        return true
      }
      if (!editorAdapter) return true

      try {
        const bytes = new Uint8Array(await image.file.arrayBuffer())
        const imported = await importImageIntoProject(projectRoot, image.fileName, bytes)
        const snippet = generateFigureSnippet(imported.relativePath, imported.fileName)
        const position = editorAdapter.getPosition()
        if (!position) return true
        editorAdapter.applyEdits('clipboard-image-paste', [
          { range: { start: position, end: position }, text: snippet, forceMoveMarkers: true }
        ])
        editorAdapter.focus()
        pushNotification({
          id: 'clipboard-image:inserted',
          tone: 'success',
          message: i18n.t('notifications.clipboardImageInserted', { file: imported.relativePath })
        })
      } catch (error) {
        pushNotification({
          id: 'clipboard-image:failed',
          tone: 'error',
          message: i18n.t('notifications.clipboardImageFailed', {
            error: error instanceof Error ? error.message : String(error)
          })
        })
      }
      return true
    },
    [projectRoot, pushNotification]
  )

  return { handlePaste }
}
