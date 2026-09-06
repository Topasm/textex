import { ResearchUiHarness, UiHarness } from './ui-harness'
import { ReferenceEvidence } from '../../src/renderer/components/research/ReferenceEvidence'
import 'monaco-editor/editor/contrib/find/browser/findController'
import { requestLocalSearch } from '../../src/renderer/services/localSearch'
import { useLocalSearchRequest } from '../../src/renderer/hooks/useLocalSearchRequest'
import { usePendingActions } from '../../src/renderer/hooks/editor/usePendingActions'
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
import { pdfFixture, multipagePdfFixture } from './pdf-fixture'
import i18n from '../../src/renderer/i18n'
import '../../src/renderer/styles/index.css'
import '../../src/renderer/styles/flat.css'
import '../../src/renderer/styles/responsive.css'
import '../../src/renderer/styles/research-panel-responsive.css'
import '../../src/renderer/styles/workspace-controls.css'

self.MonacoEnvironment = { getWorker: () => new EditorWorker() }
const sourcePath = '/project/main.tex'
const source = '\\begin{document}\nThe efficient method works.\n\\end{document}'
let pdfRevision = 1
window.api = {
  readCompiledPdf: async () => ({ data: new URLSearchParams(location.search).has('multipage') ? multipagePdfFixture() : pdfFixture(pdfRevision), mimeType: 'application/pdf' }),
  getProjectIndex: async () => ({ root: '/project', generation: 1, entries: [{ type: 'file', path: '/project/reference.pdf', relativePath: 'reference.pdf', parentRelativePath: '', name: 'reference.pdf' }] }),
  readFileBase64: async () => ({ data: 'data:application/pdf;base64,' + btoa(String.fromCharCode(...pdfFixture(pdfRevision))), mimeType: 'application/pdf' }),
  readDirectory: async () => sessionStorage.getItem('evidence') ? [{ name: 'citation-evidence.json', path: '/project/citation-evidence.json', type: 'file' }] : [],
  readFile: async (filePath: string) => ({ filePath, content: sessionStorage.getItem('evidence') }),
  saveFile: async (content: string) => { sessionStorage.setItem('evidence', content); return { success: true } },
  synctexInverse: async () => ({ file: sourcePath, line: 2, column: 1 })
} as unknown as typeof window.api
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
useSettingsStore.setState((state) => ({
  settings: { ...state.settings, scrollSyncEnabled: false }
}))
useCompileStore.getState().setPdfPath('/cache/main.pdf', {
  documentId: sourcePath,
  revision: useEditorStore.getState().revision
})
useCompileStore.getState().setCompileStatus('success')

function SourceEditor() {
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
    const cursorListener = editor.onDidChangeCursorPosition(({ position }) => {
      host.current!.dataset.cursorLine = String(position.lineNumber)
    })
    refresh()
    refreshJump()
    refreshSearch()
    return () => {
      editorInstance.current = null
      cursorListener.dispose()
      adapter.current?.dispose()
      adapter.current = null
      editor.dispose()
    }
  }, [refresh, refreshJump, refreshSearch])
  return <div ref={host} data-testid="source-editor" style={{ height: 600 }} />
}

function Harness() {
  const [markdown, setMarkdown] = useState(false)
  const highlight = useEditorStore((state) => state.previewSourceHighlight)
  if (new URLSearchParams(location.search).has('research-ui')) return <ResearchUiHarness />
  if (new URLSearchParams(location.search).has('ui')) return <UiHarness />
  if (new URLSearchParams(location.search).has('evidence')) return <>
    <button onClick={() => { pdfRevision++ }}>Replace reference PDF</button>
    <ReferenceEvidence citekey="method2026" />
  </>
  return (
    <>
      <nav>
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
      </nav>
      <main style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: 650 }}>
        {markdown ? <ProsePane /> : <SourceEditor />}
        <PreviewPane />
      </main>
    </>
  )
}
createRoot(document.getElementById('root')!).render(<Harness />)
