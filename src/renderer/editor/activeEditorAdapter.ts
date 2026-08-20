import type { EditorAdapter } from './EditorAdapter'

type Listener = () => void

let activeAdapter: EditorAdapter | null = null
const listeners = new Set<Listener>()

export function getActiveEditorAdapter(): EditorAdapter | null {
  return activeAdapter
}

export function setActiveEditorAdapter(adapter: EditorAdapter | null): void {
  if (activeAdapter === adapter) return
  activeAdapter = adapter
  for (const listener of listeners) listener()
}

export function subscribeActiveEditorAdapter(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
