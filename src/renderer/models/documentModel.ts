/**
 * Canonical, editor-engine-independent state for one open document.
 *
 * The editor adapter supplies text changes, while React/Zustand should only
 * mirror lightweight metadata derived from this model. Long-running work must
 * capture a snapshot and validate it before publishing a result.
 */

export type DocumentChangeSource = 'editor' | 'format' | 'external' | 'programmatic'

export interface DocumentSnapshot {
  readonly documentId: string
  /** Monotonic content revision for this model instance. */
  readonly revision: number
  /** Immutable string reference; taking a snapshot does not copy its bytes. */
  readonly text: string
}

export type DocumentModelEvent =
  | {
      readonly kind: 'content'
      readonly source: DocumentChangeSource
      readonly before: DocumentSnapshot
      readonly after: DocumentSnapshot
    }
  | {
      readonly kind: 'save-point'
      readonly snapshot: DocumentSnapshot
      readonly previousSavedRevision: number
      readonly savedRevision: number
    }
  | {
      readonly kind: 'reload'
      readonly before: DocumentSnapshot
      readonly after: DocumentSnapshot
    }

export type DocumentModelListener = (event: DocumentModelEvent) => void

export type DiskReloadResult =
  | { readonly status: 'applied'; readonly snapshot: DocumentSnapshot }
  | { readonly status: 'unchanged'; readonly snapshot: DocumentSnapshot }
  | { readonly status: 'dirty'; readonly snapshot: DocumentSnapshot }
  | { readonly status: 'stale'; readonly snapshot: DocumentSnapshot }

function nextRevision(current: number): number {
  if (current >= Number.MAX_SAFE_INTEGER) {
    throw new Error('Document revision space exhausted')
  }
  return current + 1
}

function freezeEvent<T extends DocumentModelEvent>(event: T): T {
  return Object.freeze(event)
}

export class DocumentModel {
  readonly #documentId: string
  readonly #listeners = new Set<DocumentModelListener>()
  readonly #ownedSnapshots = new WeakSet<DocumentSnapshot>()

  #text: string
  #revision = 0
  #savedRevision = 0
  #cachedSnapshot: DocumentSnapshot | null = null

  constructor(documentId: string, text: string) {
    if (!documentId) throw new Error('Document id must not be empty')
    this.#documentId = documentId
    this.#text = text
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

  /**
   * Returns an immutable O(1) snapshot. JavaScript strings are immutable, so
   * the text is shared until a later edit supplies a different string.
   */
  snapshot(): DocumentSnapshot {
    if (!this.#cachedSnapshot) {
      const snapshot: DocumentSnapshot = Object.freeze({
        documentId: this.#documentId,
        revision: this.#revision,
        text: this.#text
      })
      this.#ownedSnapshots.add(snapshot)
      this.#cachedSnapshot = snapshot
    }
    return this.#cachedSnapshot
  }

  /** Applies editor/programmatic text without copying it into UI state. */
  updateText(text: string, source: DocumentChangeSource = 'editor'): DocumentSnapshot {
    if (text === this.#text) return this.snapshot()

    const before = this.snapshot()
    this.#text = text
    this.#revision = nextRevision(this.#revision)
    this.#invalidateSnapshot()
    const after = this.snapshot()
    this.#emit(freezeEvent({ kind: 'content', source, before, after }))
    return after
  }

  /**
   * Marks a revision clean only if it is still current. A user can keep typing
   * while I/O is in flight; completion of that older save must not clear the
   * dirty state of newer edits.
   */
  markSaved(revision: number = this.#revision): boolean {
    if (revision !== this.#revision) return false
    if (revision === this.#savedRevision) return true

    const previousSavedRevision = this.#savedRevision
    this.#savedRevision = revision
    this.#emit(
      freezeEvent({
        kind: 'save-point',
        snapshot: this.snapshot(),
        previousSavedRevision,
        savedRevision: revision
      })
    )
    return true
  }

  /**
   * Applies a watcher read only when the document is still the clean revision
   * observed before that asynchronous read began.
   */
  reloadFromDisk(text: string, observedSnapshot: DocumentSnapshot): DiskReloadResult {
    const current = this.snapshot()
    if (!this.isCurrent(observedSnapshot)) return { status: 'stale', snapshot: current }
    if (this.isDirty) return { status: 'dirty', snapshot: current }

    if (text === current.text) {
      this.markSaved(current.revision)
      return { status: 'unchanged', snapshot: this.snapshot() }
    }

    const before = current
    this.#text = text
    this.#revision = nextRevision(this.#revision)
    this.#savedRevision = this.#revision
    this.#invalidateSnapshot()
    const after = this.snapshot()
    this.#emit(freezeEvent({ kind: 'reload', before, after }))
    return { status: 'applied', snapshot: after }
  }

  /** Replaces the buffer with an explicitly accepted disk version and marks it clean. */
  replaceFromDisk(text: string): DocumentSnapshot {
    const before = this.snapshot()
    if (text === before.text) {
      this.#savedRevision = this.#revision
      return before
    }

    this.#text = text
    this.#revision = nextRevision(this.#revision)
    this.#savedRevision = this.#revision
    this.#invalidateSnapshot()
    const after = this.snapshot()
    this.#emit(freezeEvent({ kind: 'reload', before, after }))
    return after
  }

  /** True only for the current revision of this exact model incarnation. */
  isCurrent(snapshot: DocumentSnapshot): boolean {
    return this.#owns(snapshot) && snapshot.revision === this.#revision
  }

  /** Publishes an asynchronous result only if its input snapshot is current. */
  commitIfCurrent<T>(
    snapshot: DocumentSnapshot,
    commit: (current: DocumentSnapshot) => T
  ): T | null {
    if (!this.isCurrent(snapshot)) return null
    return commit(this.snapshot())
  }

  subscribe(listener: DocumentModelListener): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  #owns(snapshot: DocumentSnapshot): boolean {
    return this.#ownedSnapshots.has(snapshot)
  }

  #invalidateSnapshot(): void {
    this.#cachedSnapshot = null
  }

  #emit(event: DocumentModelEvent): void {
    for (const listener of this.#listeners) listener(event)
  }
}
