import { useEffect, useState } from 'react'
import type { BibEntry, ZoteroCollectionItem, ZoteroItemDetail } from '../../../shared/types'
import { buildReferenceHealth } from '../../services/referenceHealth'
import { loadZoteroInventory } from '../../services/zoteroInventoryCache'
import { loadZoteroItemDetail } from '../../services/zoteroItemDetailCache'
import { useProjectStore } from '../../store/useProjectStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useZoteroSyncStore } from '../../store/useZoteroSyncStore'

interface CitationMatch {
  item: ZoteroCollectionItem
  detail: ZoteroItemDetail | null
}

interface PreviewResult {
  entries: BibEntry[]
  projectRoot: string
  port: number
  dataRevision: number
  matches: Map<string, CitationMatch>
  loading: boolean
  unavailable: boolean
}

/** Read extra metadata only for an opened popup, keeping local .bib details immediate. */
export function useZoteroCitationPreview(entries: BibEntry[], active: boolean) {
  const projectRoot = useProjectStore((state) => state.projectRoot)
  const enabled = useSettingsStore((state) => state.settings.zoteroEnabled)
  const port = useSettingsStore((state) => state.settings.zoteroPort)
  const dataRevision = useZoteroSyncStore((state) => state.dataRevision)
  const [result, setResult] = useState<PreviewResult | null>(null)

  useEffect(() => {
    if (!active || !enabled || !projectRoot) return
    let cancelled = false
    const isCurrent = () =>
      !cancelled &&
      useProjectStore.getState().projectRoot === projectRoot &&
      useSettingsStore.getState().settings.zoteroPort === port &&
      useSettingsStore.getState().settings.zoteroEnabled &&
      useZoteroSyncStore.getState().dataRevision === dataRevision
    const base = { entries, projectRoot, port, dataRevision }
    const matches = new Map<string, CitationMatch>()
    setResult({ ...base, matches, loading: true, unavailable: false })
    void loadZoteroInventory(port, '/0')
      .then(async (inventory) => {
        if (!isCurrent()) return
        // Reuse exact, unambiguous DOI/arXiv/citekey matching from the sidebar.
        for (const { entry, zoteroItem } of buildReferenceHealth(entries, [], inventory).project) {
          if (zoteroItem) matches.set(entry.key, { item: zoteroItem, detail: null })
        }
        setResult({
          ...base,
          matches: new Map(matches),
          loading: matches.size > 0,
          unavailable: false
        })
        await Promise.all(
          [...matches].map(async ([key, match]) => {
            const detail = await loadZoteroItemDetail(port, match.item.itemKey).catch(() => null)
            if (!isCurrent()) return
            matches.set(key, { item: match.item, detail })
            setResult({ ...base, matches: new Map(matches), loading: true, unavailable: false })
          })
        )
        if (isCurrent())
          setResult({ ...base, matches: new Map(matches), loading: false, unavailable: false })
      })
      .catch(() => {
        if (isCurrent()) setResult({ ...base, matches, loading: false, unavailable: true })
      })
    return () => {
      cancelled = true
    }
  }, [active, enabled, entries, projectRoot, port, dataRevision])

  const current =
    active &&
    enabled &&
    result?.entries === entries &&
    result.projectRoot === projectRoot &&
    result.port === port &&
    result.dataRevision === dataRevision
      ? result
      : null
  return {
    enabled,
    port,
    matches: current?.matches,
    loading: current?.loading ?? (active && enabled && !!projectRoot),
    unavailable: current?.unavailable ?? false
  }
}
