import { useCallback } from 'react'
import { useAppStore } from '../../store/useAppStore'
import type { editor as monacoEditor } from 'monaco-editor'

type Monaco = typeof import('monaco-editor')

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp'])

export function useSmartImageDrop() {
  const projectRoot = useAppStore((s) => s.projectRoot)

  const handleDrop = useCallback(
    async (
      e: React.DragEvent,
      editor: monacoEditor.IStandaloneCodeEditor | null,
      monaco: Monaco | null
    ) => {
      // Only handle if files are dropped
      if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) {
        return
      }

      const file = e.dataTransfer.files[0]
      const ext = '.' + file.name.split('.').pop()?.toLowerCase()

      if (!IMAGE_EXTENSIONS.has(ext)) {
        return
      }

      e.preventDefault()
      e.stopPropagation()

      if (!projectRoot || !editor || !monaco) {
        console.warn('SmartImageDrop: Missing projectRoot or editor instance')
        return
      }

      try {
        // 1. Ensure 'images' directory exists
        // We can't simply join paths in renderer without 'path' module, but we know projectRoot is absolute
        // Rely on backend to handle separator or just append /images for now (assuming linux/mac or handle win in backend)
        // Actually backend `path.join` is safer. Let's use string concatenation with forward slash which works in most JS envs for display,
        // but for backend operations we should send pure paths.

        // Better approach: Let's assume standard forward slash for internal logic or just use string concat carefully.
        // Since `projectRoot` comes from backend, it uses OS specific separators.
        const sep = projectRoot.includes('\\') ? '\\' : '/'
        const imagesDir = `${projectRoot}${sep}images`

        await window.api.createDirectory(imagesDir)

        // 2. Copy File
        const destPath = `${imagesDir}${sep}${file.name}`
        // The file object from DragEvent has a 'path' property in Electron!
        // But standard File object doesn't. Electron adds it.
        interface ElectronFile extends File {
          path: string
        }
        const sourcePath = (file as ElectronFile).path

        if (sourcePath) {
          await window.api.copyFile(sourcePath, destPath)
        } else {
          console.error('SmartImageDrop: Could not get source path from dropped file')
          return
        }

        // 3. Generate LaTeX Snippet
        const relPath = `images/${file.name}`
        const label = `fig:${file.name.replace(/\.[^/.]+$/, '').replace(/\s+/g, '-')}`
        const snippet = `
\\begin{figure}[htbp]
  \\centering
  \\includegraphics[width=0.8\\linewidth]{${relPath}}
  \\caption{Caption for ${file.name}}
  \\label{${label}}
\\end{figure}
`

        // 4. Insert into Editor
        const target = editor.getTargetAtClientPoint(e.clientX, e.clientY)
        if (target?.position) {
          const pos = target.position
          editor.executeEdits('image-drop', [
            {
              range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
              text: snippet,
              forceMoveMarkers: true
            }
          ])
          editor.setPosition(pos)
          editor.focus()
        } else {
          // Fallback to current cursor if drop target not found (rare)
          const pos = editor.getPosition()
          if (pos) {
            editor.executeEdits('image-drop', [
              {
                range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
                text: snippet,
                forceMoveMarkers: true
              }
            ])
          }
        }
      } catch (err) {
        console.error('SmartImageDrop: Failed to process image drop', err)
        alert('Failed to import image: ' + (err instanceof Error ? err.message : String(err)))
      }
    },
    [projectRoot]
  )

  return { handleDrop }
}
