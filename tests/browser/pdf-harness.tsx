import { flushAllPendingDocumentEdits } from '../../src/renderer/services/pendingDocumentEdits'
import Toolbar from '../../src/renderer/components/Toolbar'
import { WorkspaceSourcePane } from '../../src/renderer/components/WorkspaceSourcePane'
import { ResearchUiHarness, UiHarness } from './ui-harness'
import { ReferenceEvidence } from '../../src/renderer/components/research/ReferenceEvidence'
import { NotesPanel } from '../../src/renderer/components/research/NotesPanel'
import 'monaco-editor/editor/contrib/find/browser/findController'
import { requestLocalSearch } from '../../src/renderer/services/localSearch'
import { useLocalSearchRequest } from '../../src/renderer/hooks/useLocalSearchRequest'
import { usePendingActions } from '../../src/renderer/hooks/editor/usePendingActions'
import { useHorizontalResize } from '../../src/renderer/hooks/useHorizontalResize'
import { useClickNavigation } from '../../src/renderer/hooks/editor/useClickNavigation'
import { documentRegistry } from '../../src/renderer/models/documentRegistry'
import { sentenceSearchText } from '../../src/renderer/utils/sentenceSelection'
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import * as monaco from 'monaco-editor/editor/editor.api'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import PreviewPane from '../../src/renderer/components/PreviewPane'
import ProsePane from '../../src/renderer/components/ProsePane'
import { MonacoEditorAdapter } from '../../src/renderer/editor/MonacoEditorAdapter'
import type { EditorAdapter } from '../../src/renderer/editor/EditorAdapter'
import { usePreviewSourceHighlight } from '../../src/renderer/hooks/editor/usePreviewSourceHighlight'
import { useCompileStore } from '../../src/renderer/store/useCompileStore'
import { useEditorStore } from '../../src/renderer/store/useEditorStore'
import { usePdfStore } from '../../src/renderer/store/usePdfStore'
import { useProjectStore } from '../../src/renderer/store/useProjectStore'
import { useSettingsStore } from '../../src/renderer/store/useSettingsStore'
import { pdfFixture, multipagePdfFixture, citationPdfFixture, sentencePdfFixture } from './pdf-fixture'
import { parseAuxContent } from '../../src/shared/auxparser'
import i18n from '../../src/renderer/i18n'
import '../../src/renderer/styles/index.css'
import '../../src/renderer/styles/flat.css'
import '../../src/renderer/styles/responsive.css'
import '../../src/renderer/styles/research-panel-responsive.css'
import '../../src/renderer/styles/workspace-controls.css'

self.MonacoEnvironment = { getWorker: () => new EditorWorker() }
const sourcePath = '/project/main.tex'
const source = new URLSearchParams(location.search).has('sentences')
  ? '\\begin{document}\nFirst sentence. The \\textbf{efficient} method works. Last sentence.\n\\end{document}'
  : '\\begin{document}\nThe efficient method works.\n\\end{document}'
let pdfRevision = 1
let editedSentence: string | undefined
let diskSource = source
window.api = {
  readCompiledPdf: async () => ({ data: new URLSearchParams(location.search).has('sentences') ? sentencePdfFixture(editedSentence) : new URLSearchParams(location.search).has('citations') ? citationPdfFixture() : new URLSearchParams(location.search).has('multipage') ? multipagePdfFixture() : pdfFixture(pdfRevision), mimeType: 'application/pdf' }),
  openExternal: async (url: string) => { sessionStorage.setItem('opened-url', url) },
  getProjectIndex: async () => ({ root: '/project', generation: 1, entries: [{ type: 'file', path: '/project/reference.pdf', relativePath: 'reference.pdf', parentRelativePath: '', name: 'reference.pdf' }] }),
  readFileBase64: async () => ({ data: 'data:application/pdf;base64,' + btoa(String.fromCharCode(...pdfFixture(pdfRevision))), mimeType: 'application/pdf' }),
  readDirectory: async () => sessionStorage.getItem('evidence') ? [{ name: 'citation-evidence.json', path: '/project/citation-evidence.json', type: 'file' }] : [],
  readFile: async (filePath: string) => ({ filePath, content: filePath === sourcePath ? diskSource : sessionStorage.getItem('evidence') }),
  saveFile: async (content: string) => { sessionStorage.setItem('evidence', content); return { success: true } },
  synctexInverse: async () => ({ file: sourcePath, line: 2, column: 1 }),
  synctexForward: async () => ({ page: 1, x: 60, y: 60 })
} as unknown as typeof window.api
if (new URLSearchParams(location.search).has('sentences')) {
  Object.assign(window.api, { aiProcessCustom: async () => 'The method is effective.' })
  useSettingsStore.setState((state) => ({ settings: { ...state.settings, aiEnabled: true } }))
}
if (new URLSearchParams(location.search).has('notes')) {
  Object.assign(window.api, {
    readDirectory: async () => [{ name: 'TODO.md', path: '/project/TODO.md', type: 'file' }],
    readFile: async (filePath: string) => ({ filePath, content: sessionStorage.getItem('notes') ?? '# Notes\nKeep existing notes.' }),
    saveFile: async (content: string) => { sessionStorage.setItem('notes', content); return { success: true } }
  })
}
if (new URLSearchParams(location.search).has('research-ui')) {
  void i18n.changeLanguage(new URLSearchParams(location.search).get('locale') ?? 'en')
  Object.assign(window.api, {
    researchProfileLoad: async () => ({ version: 1, paper: { title: 'Scientific Document Understanding', authors: [{ id: 'ada', name: 'Ada' }] }, resources: [], instructions: [] }),
    researchChatSessionLoad: async () => ({ projectRoot: '/project', projectEpoch: '1', revision: '0', session: { version: 1, messages: [], selectedContexts: [] } }),
    researchChatSessionSave: async (scope: object, session: object) => ({ ...scope, revision: '1', session }),
    aiHasApiKey: async () => true,
    aiCheckCli: async () => ({ available: true }),
    aiCheckCodexCli: async () => ({ available: true }),
    aiResearchChat: () => new Promise(() => {}),
    aiCancelResearchChat: async () => true,
    researchLoadConfig: async () => ({ version: 1, referencesFile: 'references.bib', zoteroFile: 'zotero.bib', zoteroCollection: 'METHODS' }),
    zoteroLibraryTree: async () => [{ key: '/0', name: 'My Library', itemCount: 0, collections: [{ key: 'METHODS', name: 'Long-Context Scientific Document Understanding', parentKey: null, itemCount: 0 }] }],
    zoteroCollectionItems: async () => ({ items: [], totalResults: 0 }),
    scanCitations: async () => []
  })
  useSettingsStore.setState((state) => ({ settings: { ...state.settings, zoteroSyncMode: 'off', aiProvider: 'anthropic', aiModel: 'claude-sonnet-4-6' } }))
}
useEditorStore.getState().openFileInTab(sourcePath, source)
useProjectStore.setState({ projectRoot: '/project' })
if (new URLSearchParams(location.search).has('citations')) {
  useProjectStore.setState({
    bibEntries: [
      { key: 'method2026', type: 'article', title: 'An efficient method', author: 'Kim and Park', year: '2026', journal: 'Methods Journal', doi: '10.1000/method' },
      { key: 'author2025', type: 'book', title: 'A useful reference', author: 'Lee', year: '2025' }
    ],
    auxCitationMap: parseAuxContent('\\bibcite{method2026}{1}\n\\bibcite{author2025}{2}')
  })
  if (new URLSearchParams(location.search).has('zotero')) {
    useSettingsStore.setState((state) => ({ settings: { ...state.settings, zoteroEnabled: true } }))
    Object.assign(window.api, {
      zoteroCollectionItems: async () => ({ items: [{ itemKey: 'ABCD2345', citekey: 'method2026', title: 'An efficient method in Zotero', author: 'Kim and Park', year: '2026', type: 'journalArticle', doi: '10.1000/method', arxivId: null }], totalResults: 1 }),
      zoteroItemDetail: async () => ({ itemKey: 'ABCD2345', abstract: 'An abstract from the Zotero library.', publication: 'Methods Journal', url: 'https://example.org/method' }),
      zoteroOpenItem: async (key: string) => { sessionStorage.setItem('opened-zotero', key); return { success: true } }
    })
  }
}
useSettingsStore.setState((state) => ({
  settings: { ...state.settings, scrollSyncEnabled: false }
}))
useCompileStore.getState().setPdfPath('/cache/main.pdf', {
  documentId: sourcePath,
  revision: useEditorStore.getState().revision
})
useCompileStore.getState().setCompileStatus('success')

function SourceEditor() {
  const registerClickNavigation = useClickNavigation()
  const host = useRef<HTMLDivElement>(null)
  const adapter = useRef<EditorAdapter | null>(null)
  const editorInstance = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const refreshSearch = useLocalSearchRequest('document', () => {
    if (!editorInstance.current) return false
    editorInstance.current.trigger('search', 'actions.find', {})
    return true
  })
  const refresh = usePreviewSourceHighlight(adapter)
  const refreshJump = usePendingActions(adapter)
  useEffect(() => {
    const editor = monaco.editor.create(host.current!, {
      value: source,
      language: 'plaintext',
      automaticLayout: true
    })
    editorInstance.current = editor
    adapter.current = new MonacoEditorAdapter(editor, monaco, sourcePath)
    const buffer = adapter.current.getDocumentBuffer()
    if (buffer) documentRegistry.bindBuffer(sourcePath, buffer)
    const documentChange = adapter.current.onDidChangeDocument(() => useEditorStore.getState().recordEditorChange(sourcePath))
    const cursorListener = editor.onDidChangeCursorPosition(({ position }) => {
      host.current!.dataset.cursorLine = String(position.lineNumber)
    })
    const clickNavigation = registerClickNavigation(editor)
    refresh()
    refreshJump()
    refreshSearch()
    return () => {
      editorInstance.current = null
      cursorListener.dispose()
      documentChange.dispose()
      clickNavigation.dispose()
      adapter.current?.dispose()
      adapter.current = null
      editor.dispose()
    }
  }, [refresh, refreshJump, refreshSearch, registerClickNavigation])
  return <div ref={host} data-testid="source-editor" style={{ height: 600 }} />
}

function Harness() {
  const pdfOnly = usePdfStore((state) => state.pdfOnly)
  const workspace = new URLSearchParams(location.search).has('workspace')
  const [markdown, setMarkdown] = useState(false)
  const startResize = useHorizontalResize({ onMove: () => {} })
  const highlight = useEditorStore((state) => state.previewSourceHighlight)
  if (new URLSearchParams(location.search).has('notes')) return <NotesPanel />
  if (new URLSearchParams(location.search).has('research-ui')) return <ResearchUiHarness />
  if (new URLSearchParams(location.search).has('ui')) return <UiHarness />
  if (new URLSearchParams(location.search).has('evidence')) return <>
    <button onClick={() => { pdfRevision++ }}>Replace reference PDF</button>
    <ReferenceEvidence citekey="method2026" />
  </>
  const compile = async () => {
          flushAllPendingDocumentEdits()
          const snapshot = documentRegistry.snapshot(sourcePath)!
          diskSource = snapshot.text
          sessionStorage.setItem('compiled-source', snapshot.text)
          editedSentence = sentenceSearchText(snapshot.text.split('\n')[1].slice('First sentence. '.length, -' Last sentence.'.length))
          useCompileStore.getState().setPdfPath('/cache/main.pdf', { documentId: sourcePath, revision: snapshot.revision })
          useCompileStore.getState().setCompileStatus('success')
        }
  return (
    <>
      {workspace && <Toolbar onSave={() => {}} onCompile={compile} onOpenFolder={() => {}}
        onReturnHome={() => {}} onOpenCommandPalette={() => {}} onOpenSettings={() => {}} />}
      <nav>
        <button onMouseDown={startResize}>Resize panel</button>
        <button onClick={() => useSettingsStore.setState((state) => ({ settings: { ...state.settings, pdfViewMode: 'single' } }))}>Single page</button>
        <button onClick={() => requestLocalSearch('document')}>Find document</button>
        <button onClick={() => usePdfStore.getState().setZoomLevel(180)}>Zoom in</button>
        <button onClick={() => usePdfStore.getState().setZoomLevel(80)}>Zoom out</button>
        <button onClick={() => setMarkdown(!markdown)}>Toggle Markdown</button>
        <button
          onClick={() => {
            pdfRevision++
            useCompileStore.getState().setPdfPath('/cache/main.pdf', {
              documentId: sourcePath,
              revision: useEditorStore.getState().revision
            })
          }}
        >
          Recompile
        </button>
        <output data-testid="source-highlight">{highlight?.text}</output>
        <output data-testid="source-range" hidden>{JSON.stringify(highlight?.range)}</output>
      </nav>
      <main className={`editor-main-content${pdfOnly ? ' pdf-workspace' : ''}`} style={{ display: 'flex', height: 650, flex: 'none' }}>
        <WorkspaceSourcePane onCompile={compile}>{markdown ? <ProsePane /> : <SourceEditor />}</WorkspaceSourcePane>
        <div className="preview-pane" style={{ width: '50%' }}><PreviewPane onCompile={compile} /></div>
      </main>
    </>
  )
}
createRoot(document.getElementById('root')!).render(<Harness />)
