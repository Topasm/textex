import { useCallback, useMemo } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { BibEntry, CitationGroup } from '../../shared/types'
import { logError } from '../utils/errorMessage'

type BibGroupMode = 'flat' | 'author' | 'year' | 'type' | 'custom'

interface GroupedBib {
  label: string
  entries: BibEntry[]
}

function extractGroupKey(entry: BibEntry, mode: BibGroupMode): string {
  switch (mode) {
    case 'author': {
      const author = entry.author?.split(/\band\b/i)[0]?.trim() ?? 'Unknown'
      return author.split(',')[0]?.trim() || author
    }
    case 'year':
      return entry.year || 'Unknown'
    case 'type':
      return entry.type || 'misc'
    default:
      return ''
  }
}

function groupEntries(entries: BibEntry[], mode: BibGroupMode): GroupedBib[] {
  if (mode === 'flat' || mode === 'custom') {
    return [{ label: '', entries }]
  }

  const buckets: Record<string, BibEntry[]> = {}
  for (const entry of entries) {
    const key = extractGroupKey(entry, mode)
    ;(buckets[key] ??= []).push(entry)
  }

  return Object.entries(buckets)
    .map(([label, entries]) => ({ label, entries }))
    .sort((a, b) => b.entries.length - a.entries.length)
}

export function useCitationGroupOps() {
  const citationGroups = useAppStore((s) => s.citationGroups)
  const setCitationGroups = useAppStore((s) => s.setCitationGroups)
  const projectRoot = useAppStore((s) => s.projectRoot)

  const saveGroups = useCallback(
    (groups: CitationGroup[]) => {
      setCitationGroups(groups)
      if (projectRoot) {
        window.api.saveCitationGroups(projectRoot, groups).catch((err) => logError('saveCitationGroups', err))
      }
    },
    [setCitationGroups, projectRoot]
  )

  const createGroup = useCallback(() => {
    const name = prompt('Group name:')
    if (!name?.trim()) return
    const newGroup: CitationGroup = {
      id: crypto.randomUUID(),
      name: name.trim(),
      citekeys: []
    }
    saveGroups([...citationGroups, newGroup])
  }, [citationGroups, saveGroups])

  const deleteGroup = useCallback(
    (groupId: string) => {
      saveGroups(citationGroups.filter((g) => g.id !== groupId))
    },
    [citationGroups, saveGroups]
  )

  const renameGroup = useCallback(
    (groupId: string, newName: string) => {
      saveGroups(
        citationGroups.map((g) => (g.id === groupId ? { ...g, name: newName } : g))
      )
    },
    [citationGroups, saveGroups]
  )

  const addToGroup = useCallback(
    (groupId: string, citekey: string) => {
      saveGroups(
        citationGroups.map((g) =>
          g.id === groupId && !g.citekeys.includes(citekey)
            ? { ...g, citekeys: [...g.citekeys, citekey] }
            : g
        )
      )
    },
    [citationGroups, saveGroups]
  )

  const removeFromGroup = useCallback(
    (groupId: string, citekey: string) => {
      saveGroups(
        citationGroups.map((g) =>
          g.id === groupId ? { ...g, citekeys: g.citekeys.filter((k) => k !== citekey) } : g
        )
      )
    },
    [citationGroups, saveGroups]
  )

  // Keys assigned to any custom group
  const assignedKeys = useMemo(() => {
    const set = new Set<string>()
    for (const g of citationGroups) {
      for (const k of g.citekeys) set.add(k)
    }
    return set
  }, [citationGroups])

  return {
    citationGroups,
    createGroup,
    deleteGroup,
    renameGroup,
    addToGroup,
    removeFromGroup,
    assignedKeys
  }
}

export { groupEntries }
export type { GroupedBib, BibGroupMode }
