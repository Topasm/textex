import { useCallback, useMemo } from 'react'
import { useProjectStore } from '../store/useProjectStore'
import type { CitationGroup } from '../../shared/types'
import { logError } from '../utils/errorMessage'

export function useCitationGroupOps() {
  const citationGroups = useProjectStore((s) => s.citationGroups)
  const setCitationGroups = useProjectStore((s) => s.setCitationGroups)
  const projectRoot = useProjectStore((s) => s.projectRoot)

  const saveGroups = useCallback(
    (groups: CitationGroup[]) => {
      setCitationGroups(groups)
      if (projectRoot) {
        window.api
          .saveCitationGroups(projectRoot, groups)
          .catch((err) => logError('saveCitationGroups', err))
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
      saveGroups(citationGroups.map((g) => (g.id === groupId ? { ...g, name: newName } : g)))
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
