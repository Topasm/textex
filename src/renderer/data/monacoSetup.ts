import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'

// Monaco's `register.all` entrypoint eagerly includes IDE features and quick-access
// surfaces that TextEx never exposes. Keep this list aligned with the editor options
// and providers registered by EditorPane so the lazy editor boundary
// remains useful without removing normal editing or local language behavior.
import 'monaco-editor/features/bracketMatching/register'
import 'monaco-editor/features/clipboard/register'
import 'monaco-editor/features/codeAction/register'
import 'monaco-editor/features/codeEditor/register'
import 'monaco-editor/features/codelens/register'
import 'monaco-editor/features/codicon/register'
import 'monaco-editor/features/comment/register'
import 'monaco-editor/features/contextmenu/register'
import 'monaco-editor/features/cursorUndo/register'
import 'monaco-editor/features/diffEditor/register'
import 'monaco-editor/features/dnd/register'
import 'monaco-editor/features/documentSymbols/register'
import 'monaco-editor/features/find/register'
import 'monaco-editor/features/folding/register'
import 'monaco-editor/features/fontZoom/register'
import 'monaco-editor/features/format/register'
import 'monaco-editor/features/gotoError/register'
import 'monaco-editor/features/gotoLine/register'
import 'monaco-editor/features/gotoSymbol/register'
import 'monaco-editor/features/hover/register'
import 'monaco-editor/features/indentation/register'
import 'monaco-editor/features/lineSelection/register'
import 'monaco-editor/features/linesOperations/register'
import 'monaco-editor/features/links/register'
import 'monaco-editor/features/multicursor/register'
import 'monaco-editor/features/quickCommand/register'
import 'monaco-editor/features/readOnlyMessage/register'
import 'monaco-editor/features/referenceSearch/register'
import 'monaco-editor/features/rename/register'
import 'monaco-editor/features/semanticTokens/register'
import 'monaco-editor/features/smartSelect/register'
import 'monaco-editor/features/snippet/register'
import 'monaco-editor/features/stickyScroll/register'
import 'monaco-editor/features/suggest/register'
import 'monaco-editor/features/toggleTabFocusMode/register'
import 'monaco-editor/features/tokenization/register'
import 'monaco-editor/features/unicodeHighlighter/register'
import 'monaco-editor/features/unusualLineTerminators/register'
import 'monaco-editor/features/wordHighlighter/register'
import 'monaco-editor/features/wordOperations/register'
import 'monaco-editor/features/wordPartOperations/register'

// TextEx provides LaTeX and BibTeX language services itself. A generic editor
// worker is sufficient for model synchronization and diff computation, so do
// not bundle Monaco's unused TypeScript, JSON, CSS, and HTML workers.
self.MonacoEnvironment = {
  ...self.MonacoEnvironment,
  getWorker: () => new EditorWorker()
}

loader.config({ monaco })

export { monaco }
