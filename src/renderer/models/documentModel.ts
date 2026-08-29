/**
 * Revision/save metadata for one open document.
 *
 * Text is owned by the bound editor buffer. A full string is materialized only
 * when a caller explicitly asks for a DocumentSnapshot (save, compile, full
 * analysis, and similar cold paths).
 */

export type DocumentChangeSource =
  'editor' | 'format' | 'external' | 'programmatic' | 'history-restore' | 'prose-view'

export interface DocumentRevisionSnapshot {
  readonly documentId: string
  readonly revision: number
}

export interface DocumentSnapshot extends DocumentRevisionSnapshot {
  readonly text: string
}

export type DocumentModelEvent =
  | {
      readonly kind: 'content'
      readonly source: DocumentChangeSource
      readonly before: DocumentRevisionSnapshot
      readonly after: DocumentRevisionSnapshot
    }
  | {
      readonly kind: 'save-point'
      readonly snapshot: DocumentRevisionSnapshot
      readonly previousSavedRevision: number
      readonly savedRevision: number
    }
  | {
      readonly kind: 'reload'
      readonly before: DocumentRevisionSnapshot
      readonly after: DocumentRevisionSnapshot
    }

export type DocumentModelListener = (event: DocumentModelEvent) => void

function nextRevision(current: number): number {
  if (current >= Number.MAX_SAFE_INTEGER) throw new Error('Document revision space exhausted')
  return current + 1
}

function freezeEvent<T extends DocumentModelEvent>(event: T): T {
  return Object.freeze(event)
}

export class DocumentModel {
  readonly #documentId: string
  readonly #listeners = new Set<DocumentModelListener>()
  readonly #ownedRevisions = new WeakSet<DocumentRevisionSnapshot>()

  #materializeText: () => string
  #revision = 0
  #savedRevision = 0
  #requiresExplicitSave = false
  #cachedRevisionSnapshot: DocumentRevisionSnapshot | null = null
  #cachedMaterializedSnapshot: DocumentSnapshot | null = null

  constructor(documentId: string, materializeText: () => string) {
    if (!documentId) throw new Error('Document id must not be empty')
    this.#documentId = documentId
    this.#materializeText = materializeText
  }

  get documentId(): string {
    return this.#documentId
  }

  get revision(): number {
    return this.#revision
  }

  get savedRevision(): number {
    return this.#savedRevision
  }

  get isDirty(): boolean {
    return this.#revision !== this.#savedRevision
  }

  /** Prevents restored history from being persisted by an automatic compile. */
  get requiresExplicitSave(): boolean {
    return this.#requiresExplicitSave
  }

  /** Returns an O(1), text-free checkpoint for stale-result validation. */
  revisionSnapshot(): DocumentRevisionSnapshot {
    if (!this.#cachedRevisionSnapshot) {
      const snapshot = Object.freeze({ documentId: this.#documentId, revision: this.#revision })
      this.#ownedRevisions.add(snapshot)
      this.#cachedRevisionSnapshot = snapshot
    }
    return this.#cachedRevisionSnapshot
  }

  /** Materializes the current editor buffer for a cold-path consumer. */
  snapshot(): DocumentSnapshot {
    if (!this.#cachedMaterializedSnapshot) {
      const revision = this.revisionSnapshot()
      const snapshot = Object.freeze({ ...revision, text: this.#materializeText() })
      this.#ownedRevisions.add(snapshot)
      this.#cachedMaterializedSnapshot = snapshot
    }
    return this.#cachedMaterializedSnapshot
  }

  /** Rebinds materialization after the bootstrap buffer moves to Monaco. */
  bindMaterializer(materializeText: () => string): void {
    this.#materializeText = materializeText
    this.#cachedMaterializedSnapshot = null
  }

  /** Records an already-applied incremental or programmatic buffer change. */
  recordChange(source: DocumentChangeSource = 'editor'): DocumentRevisionSnapshot {
    const before = this.revisionSnapshot()
    this.#revision = nextRevision(this.#revision)
    if (source === 'history-restore') this.#requiresExplicitSave = true
    else if (source === 'editor') this.#requiresExplicitSave = false
    this.#invalidateSnapshots()
    const after = this.revisionSnapshot()
    this.#emit(freezeEvent({ kind: 'content', source, before, after }))
    return after
  }

  /** Records a disk replacement and establishes the new revision as clean. */
  recordReload(): DocumentRevisionSnapshot {
    const before = this.revisionSnapshot()
    this.#revision = nextRevision(this.#revision)
    this.#savedRevision = this.#revision
    this.#requiresExplicitSave = false
    this.#invalidateSnapshots()
    const after = this.revisionSnapshot()
    this.#emit(freezeEvent({ kind: 'reload', before, after }))
    return after
  }

  markSaved(revision: number = this.#revision): boolean {
    if (revision !== this.#revision) return false
    this.#requiresExplicitSave = false
    if (revision === this.#savedRevision) return true

    const previousSavedRevision = this.#savedRevision
    this.#savedRevision = revision
    this.#emit(
      freezeEvent({
        kind: 'save-point',
        snapshot: this.revisionSnapshot(),
        previousSavedRevision,
        savedRevision: revision
      })
    )
    return true
  }

  /** True only for the current revision of this exact model incarnation. */
  isCurrent(snapshot: DocumentRevisionSnapshot): boolean {
    return this.#ownedRevisions.has(snapshot) && snapshot.revision === this.#revision
  }

  commitIfCurrent<T>(
    snapshot: DocumentRevisionSnapshot,
    commit: (current: DocumentSnapshot) => T
  ): T | null {
    if (!this.isCurrent(snapshot)) return null
    return commit(this.snapshot())
  }

  subscribe(listener: DocumentModelListener): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  #invalidateSnapshots(): void {
    this.#cachedRevisionSnapshot = null
    this.#cachedMaterializedSnapshot = null
  }

  #emit(event: DocumentModelEvent): void {
    for (const listener of this.#listeners) listener(event)
  }
}
