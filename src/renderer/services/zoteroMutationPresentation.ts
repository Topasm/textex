import type { ZoteroMutationOperation } from '../../shared/types'

export function isLikelyZoteroMutation(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (normalized.startsWith('/zotero ')) return true
  const namesZoteroObject = /(zotero|collection|컬렉션|tag|태그)/iu.test(normalized)
  const requestsMutation =
    /(create|make|move|rename|add|remove|change|organize|생성|만들|옮|이동|이름|추가|제거|삭제|변경|정리)/iu.test(
      normalized
    )
  return namesZoteroObject && requestsMutation
}

export function zoteroOperationLabel(operation: ZoteroMutationOperation): string {
  switch (operation.kind) {
    case 'createCollection':
      return `Create “${operation.name}” in ${operation.parentLabel}`
    case 'moveCollection':
      return `Move “${operation.path}” to ${operation.parentLabel}`
    case 'renameCollection':
      return `Rename “${operation.path}” to “${operation.newName}”`
    case 'updateItem': {
      const changes = [
        operation.addTags.length > 0 && `add ${operation.addTags.join(', ')}`,
        operation.removeTags.length > 0 && `remove ${operation.removeTags.join(', ')}`,
        operation.addCollections.length > 0 &&
          `add to ${operation.addCollections.map((collection) => collection.path).join(', ')}`,
        operation.removeCollections.length > 0 &&
          `remove from ${operation.removeCollections.map((collection) => collection.path).join(', ')}`
      ]
        .filter(Boolean)
        .join('; ')
      return `${operation.title}: ${changes}`
    }
  }
}
