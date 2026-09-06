import { ResearchChatPanel } from '../../src/renderer/components/research/ResearchChatPanel'
import { ZoteroReferences } from '../../src/renderer/components/research/ZoteroReferences'
import { useEffect, useState } from 'react'
import { AiEditReview } from '../../src/renderer/components/AiEditReview'
import LogPanel from '../../src/renderer/components/LogPanel'
import { ReferenceRow } from '../../src/renderer/components/research/ReferenceRow'
import { IconSystemProvider } from '../../src/renderer/components/ui/IconSystem'
import { useCompileStore } from '../../src/renderer/store/useCompileStore'
import { documentRegistry } from '../../src/renderer/models/documentRegistry'
import type { ReferenceRow as ReferenceRowModel } from '../../src/renderer/services/referenceListModel'

const noop = () => {}
const entry = { key: 'method2026', type: 'article', title: 'Efficient Attention for Long-Context Scientific Document Understanding', author: 'Kim, Park and Lee', year: '2026', doi: '10.1000/paper' }
const row: ReferenceRowModel = { id: 'project:method2026', citekey: entry.key, itemKey: null, title: entry.title, author: entry.author, year: entry.year, origin: 'cited', citationCount: 3, citationLocations: [{ file: '/project/main.tex', line: 2 }], possibleDuplicates: [], possibleMatch: null, matchKind: null, entry, zoteroItem: null, broken: false, citable: true }

export function UiHarness() {
  const [expanded, setExpanded] = useState(true)
  const width = Number(new URLSearchParams(location.search).get('width') ?? 320)
  useEffect(() => {
    useCompileStore.setState({ compileStatus: 'error', diagnostics: [
      { file: 'main.tex', line: 42, severity: 'error', message: 'Undefined control sequence in a long paragraph explaining the method and attention mechanism.' },
      { file: 'main.tex', line: 87, severity: 'warning', message: 'Citation method2026 on page 3 undefined on input line 87.' }
    ] })
  }, [])
  return <IconSystemProvider><main style={{ display: 'flex', alignItems: 'flex-start', gap: 24, padding: 16 }}>
    <div data-testid="review-panel" style={{ width, minWidth: width, containerType: 'inline-size', containerName: 'panel' }}>
      <AiEditReview edit={{ filePath: '/project/main.tex', projectRoot: '/project', appliedSnapshot: documentRegistry.snapshot('/project/main.tex')!, before: 'Original sentence', after: 'Revised sentence', isCurrent: () => true }} onUndo={noop} onCompile={async () => {}} />
      <LogPanel onFixWithChat={noop} onFixWithCli={async () => {}} />
    </div>
    <div data-testid="reference-panel" style={{ width, minWidth: width, containerType: 'inline-size', containerName: 'panel' }}>
      <ReferenceRow row={row} projectRoot="/project" port={23119} expanded={expanded} busy={false} zoteroState="unavailable" onToggleExpanded={() => setExpanded(!expanded)} onCite={noop} onAddToBibliography={noop} onAddAndCite={noop} onOpenInZotero={noop} onOpenLocation={noop} onFindSource={noop} onAddToChat={noop} />
    </div>
  </main></IconSystemProvider>
}

export function ResearchUiHarness() {
  const width = Number(new URLSearchParams(location.search).get('width') ?? 320)
  return <IconSystemProvider><main style={{ display: 'flex', alignItems: 'flex-start', gap: 24, padding: 16 }}>
    <div data-testid="chat-panel" style={{ width, minWidth: width, height: 700, containerType: 'inline-size', containerName: 'research-panel panel' }}>
      <ResearchChatPanel onAiDraft={noop} />
    </div>
    <div data-testid="manager-panel" style={{ width, minWidth: width, height: 700, containerType: 'inline-size', containerName: 'research-panel panel' }}>
      <ZoteroReferences onOpenProjectGroups={noop} onOpenSubmission={noop} />
    </div>
  </main></IconSystemProvider>
}
