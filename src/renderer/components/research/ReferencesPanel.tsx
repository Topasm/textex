import { useEffect, useRef, useState } from 'react'
import BibPanel from '../BibPanel'
import { ZoteroReferences } from './ZoteroReferences'
import { OnlineReferences } from './OnlineReferences'
import { useProjectStore } from '../../store/useProjectStore'
import { parseZoteroCollectionDragData, TEXTEX_ZOTERO_COLLECTION_MIME } from './referenceActions'
import type { ZoteroCollectionDragPayload } from './referenceActions'
import type { ReferenceDragPayload } from './referenceActions'
import type { ResearchConfig } from '../../../shared/types'

interface ReferencesPanelProps {
  onAddToChat?: (payload: ReferenceDragPayload) => void
}

export function ReferencesPanel({ onAddToChat }: ReferencesPanelProps = {}) {
  const source = useProjectStore((state) => state.researchReferenceSource)
  const projectRoot = useProjectStore((state) => state.projectRoot)
  const [pendingCollection, setPendingCollection] = useState<ZoteroCollectionDragPayload | null>(
    null
  )
  const [pendingConfig, setPendingConfig] = useState<ResearchConfig | null>(null)
  const [keepSynchronized, setKeepSynchronized] = useState(true)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const projectGeneration = useRef(0)
  const importInFlight = useRef(false)

  useEffect(() => {
    const generation = ++projectGeneration.current
    importInFlight.current = false
    setPendingCollection(null)
    setPendingConfig(null)
    setKeepSynchronized(true)
    setImporting(false)
    setError('')
    return () => {
      if (projectGeneration.current === generation) projectGeneration.current += 1
    }
  }, [projectRoot])

  const isCurrentProject = (generation: number, root: string) =>
    projectGeneration.current === generation && useProjectStore.getState().projectRoot === root

  const receiveCollection = (event: React.DragEvent) => {
    const payload = parseZoteroCollectionDragData(
      event.dataTransfer.getData(TEXTEX_ZOTERO_COLLECTION_MIME)
    )
    if (!payload) return
    event.preventDefault()
    setError('')
    setPendingCollection(payload)
    setPendingConfig(null)
    useProjectStore.getState().setResearchReferenceSource('project')
    const generation = projectGeneration.current
    const root = projectRoot
    if (!root) {
      setError('Open a project before importing a Zotero collection.')
      return
    }
    void window.api
      .researchLoadConfig()
      .then((config) => {
        if (isCurrentProject(generation, root)) setPendingConfig(config)
      })
      .catch((caught) => {
        if (isCurrentProject(generation, root)) {
          setError(caught instanceof Error ? caught.message : String(caught))
        }
      })
  }

  const importCollection = async () => {
    if (!pendingCollection || !pendingConfig || !projectRoot || importInFlight.current) return
    const generation = projectGeneration.current
    const root = projectRoot
    const collection = pendingCollection
    importInFlight.current = true
    setImporting(true)
    setError('')
    try {
      const separator = root.includes('\\') ? '\\' : '/'
      const target = `${root.replace(/[\\/]$/, '')}${separator}${pendingConfig.zoteroFile}`
      await window.api.zoteroSyncCollection(collection.collection.key, target, collection.port)
      if (!isCurrentProject(generation, root)) return
      await window.api.researchSaveConfig({
        ...pendingConfig,
        zoteroCollection: collection.collection.key,
        syncOnOpen: keepSynchronized
      })
      if (!isCurrentProject(generation, root)) return
      const entries = await window.api.findBibInProject(root)
      if (!isCurrentProject(generation, root)) return
      useProjectStore.getState().setBibEntries(entries)
      useProjectStore.getState().invalidateDirectory(root)
      setPendingCollection(null)
      setPendingConfig(null)
    } catch (caught) {
      if (isCurrentProject(generation, root)) {
        setError(caught instanceof Error ? caught.message : String(caught))
      }
    } finally {
      if (isCurrentProject(generation, root)) {
        importInFlight.current = false
        setImporting(false)
      }
    }
  }
  return (
    <div className="references-panel">
      <div className="reference-source-tabs" role="tablist">
        {(['project', 'zotero', 'online'] as const).map((value) => (
          <button
            key={value}
            id={`reference-source-tab-${value}`}
            role="tab"
            aria-selected={source === value}
            aria-controls={`reference-source-panel-${value}`}
            tabIndex={source === value ? 0 : -1}
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
              <span>
                Target: <code>{pendingConfig?.zoteroFile ?? 'Loading project settings…'}</code>
              </span>
            </p>
            <label className="research-check-row">
              <input
                type="checkbox"
                checked={keepSynchronized}
                onChange={(event) => setKeepSynchronized(event.target.checked)}
              />
              Keep synchronized when this project opens
            </label>
            {error && (
              <div className="research-status" role="alert">
                {error}
              </div>
            )}
            <div className="bibliography-registration-actions">
              <button
                type="button"
                onClick={() => {
                  setPendingCollection(null)
                  setPendingConfig(null)
                }}
                disabled={importing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => void importCollection()}
                disabled={importing || !projectRoot || !pendingConfig}
              >
                {importing ? 'Importing…' : 'Import'}
              </button>
            </div>
          </section>
        </div>
      )}
      <div
        className="reference-source-content"
        id={`reference-source-panel-${source}`}
        role="tabpanel"
        aria-labelledby={`reference-source-tab-${source}`}
      >
        {source === 'project' && <BibPanel onAddToChat={onAddToChat} />}
        {source === 'zotero' && <ZoteroReferences onAddToChat={onAddToChat} />}
        {source === 'online' && <OnlineReferences onAddToChat={onAddToChat} />}
      </div>
    </div>
  )
}
