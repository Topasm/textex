import {
  CITATION_EVIDENCE_FILE,
  parseCitationEvidence,
  type CitationEvidence
} from '../../shared/citationEvidence'
import { useProjectStore } from '../store/useProjectStore'
import { normalizeDocumentId } from '../models/documentRegistry'
import i18n from '../i18n'

const listeners = new Set<() => void>()
let writes: Promise<unknown> = Promise.resolve()

export function subscribeCitationEvidence(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function checkEvidenceProject(root: string): void {
  if (useProjectStore.getState().projectRoot !== root)
    throw new Error(i18n.t('citationEvidence.stale'))
}

async function evidencePath(root: string, create: boolean): Promise<string | null> {
  checkEvidenceProject(root)
  const entries = await window.api.readDirectory(root)
  checkEvidenceProject(root)
  const existing = entries.filter((entry) => entry.name.toLowerCase() === CITATION_EVIDENCE_FILE)
  if (existing.length > 1 || (existing[0] && existing[0].type !== 'file'))
    throw new Error(i18n.t('citationEvidence.invalidFile'))
  const directory = root.replace(/[\\/]$/u, '')
  return existing[0]
    ? `${directory}/${existing[0].name}`
    : create
      ? `${directory}/${CITATION_EVIDENCE_FILE}`
      : null
}

export async function loadCitationEvidence(root: string): Promise<CitationEvidence[]> {
  const path = await evidencePath(root, false)
  if (!path) return []
  const loaded = await window.api.readFile(path)
  checkEvidenceProject(root)
  if (normalizeDocumentId(loaded.filePath) !== normalizeDocumentId(path))
    throw new Error(i18n.t('citationEvidence.invalidFile'))
  try {
    return parseCitationEvidence(loaded.content)
  } catch {
    throw new Error(i18n.t('citationEvidence.invalidFile'))
  }
}

function updateCitationEvidence(
  root: string,
  update: (entries: CitationEvidence[]) => CitationEvidence[],
  signal: AbortSignal
): Promise<void> {
  const operation = writes
    .catch(() => {})
    .then(async () => {
      signal.throwIfAborted()
      const entries = await loadCitationEvidence(root)
      signal.throwIfAborted()
      const content = JSON.stringify({ version: 1, entries: update(entries) }, null, 2) + '\n'
      parseCitationEvidence(content)
      const path = await evidencePath(root, true)
      checkEvidenceProject(root)
      signal.throwIfAborted()
      const result = await window.api.saveFile(content, path!)
      if (!result.success) throw new Error(i18n.t('citationEvidence.invalidFile'))
      checkEvidenceProject(root)
      for (const listener of listeners) listener()
    })
  writes = operation
  return operation
}

export function saveCitationEvidence(
  root: string,
  entry: CitationEvidence,
  signal: AbortSignal
): Promise<void> {
  return updateCitationEvidence(root, (entries) => [...entries, entry], signal)
}

export function removeCitationEvidence(
  root: string,
  id: string,
  signal: AbortSignal
): Promise<void> {
  return updateCitationEvidence(
    root,
    (entries) => entries.filter((entry) => entry.id !== id),
    signal
  )
}
