import { useState } from 'react'
import BibPanel from '../BibPanel'
import { ZoteroReferences } from './ZoteroReferences'
import { OnlineReferences } from './OnlineReferences'
import { useProjectStore } from '../../store/useProjectStore'
import { parseZoteroCollectionDragData, TEXTEX_ZOTERO_COLLECTION_MIME } from './referenceActions'
import type { ZoteroCollectionDragPayload } from './referenceActions'

export function ReferencesPanel() {
  const source = useProjectStore((state) => state.researchReferenceSource)
  const projectRoot = useProjectStore((state) => state.projectRoot)
  const [pendingCollection, setPendingCollection] = useState<ZoteroCollectionDragPayload | null>(
    null
  )
  const [keepSynchronized, setKeepSynchronized] = useState(true)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')

  const receiveCollection = (event: React.DragEvent) => {
    const payload = parseZoteroCollectionDragData(
      event.dataTransfer.getData(TEXTEX_ZOTERO_COLLECTION_MIME)
    )
    if (!payload) return
    event.preventDefault()
    setError('')
    setPendingCollection(payload)
    useProjectStore.getState().setResearchReferenceSource('project')
  }

  const importCollection = async () => {
    if (!pendingCollection || !projectRoot || importing) return
    setImporting(true)
    setError('')
    try {
      const config = await window.api.researchLoadConfig()
      const separator = projectRoot.includes('\\') ? '\\' : '/'
      const target = `${projectRoot.replace(/[\\/]$/, '')}${separator}${config.zoteroFile}`
      await window.api.zoteroSyncCollection(
        pendingCollection.collection.key,
        target,
        pendingCollection.port
      )
      await window.api.researchSaveConfig({
        ...config,
        zoteroCollection: pendingCollection.collection.key,
        syncOnOpen: keepSynchronized
      })
      const entries = await window.api.findBibInProject(projectRoot)
      useProjectStore.getState().setBibEntries(entries)
      useProjectStore.getState().invalidateDirectory(projectRoot)
      setPendingCollection(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setImporting(false)
    }
  }
  return (
    <div className="references-panel">
      <div className="reference-source-tabs" role="tablist">
        {(['project', 'zotero', 'online'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={source === value}
            className={source === value ? 'active' : ''}
            onClick={() => useProjectStore.getState().setResearchReferenceSource(value)}
            onDragOver={(event) => {
              if (
                value === 'project' &&
                event.dataTransfer.types.includes(TEXTEX_ZOTERO_COLLECTION_MIME)
              ) {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'copy'
              }
            }}
            onDrop={value === 'project' ? receiveCollection : undefined}
          >
            {value[0].toUpperCase() + value.slice(1)}
          </button>
        ))}
      </div>
      {pendingCollection && (
        <div className="modal-overlay" role="presentation">
          <section
            className="bibliography-registration-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="collection-import-title"
          >
            <h2 id="collection-import-title">Sync collection?</h2>
            <p>
              <strong>{pendingCollection.collection.name}</strong>
              <br />
              {pendingCollection.collection.itemCount} references
              <br />
              Target: zotero.bib
            </p>
            <label className="research-check-row">
              <input
                type="checkbox"
                checked={keepSynchronized}
                onChange={(event) => setKeepSynchronized(event.target.checked)}
              />
              Keep synchronized when this project opens
            </label>
            {error && <div className="research-status">{error}</div>}
            <div className="bibliography-registration-actions">
              <button type="button" onClick={() => setPendingCollection(null)} disabled={importing}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => void importCollection()}
                disabled={importing || !projectRoot}
              >
                {importing ? 'Importing…' : 'Import'}
              </button>
            </div>
          </section>
        </div>
      )}
      <div className="reference-source-content">
        {source === 'project' && <BibPanel />}
        {source === 'zotero' && <ZoteroReferences />}
        {source === 'online' && <OnlineReferences />}
      </div>
    </div>
  )
}
