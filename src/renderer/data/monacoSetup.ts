import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import 'monaco-editor/features/register.all'

// TextEx provides LaTeX and BibTeX language services itself. A generic editor
// worker is sufficient for model synchronization and diff computation, so do
// not bundle Monaco's unused TypeScript, JSON, CSS, and HTML workers.
self.MonacoEnvironment = {
  ...self.MonacoEnvironment,
  getWorker: () => new EditorWorker()
}

loader.config({ monaco })

export { monaco }
