import i18n from '../i18n'
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

/**
 * Human-readable summary of one planned Zotero change.
 *
 * Read outside React (plan previews are built before render), so it resolves
 * translations through the shared i18n instance rather than a `t` prop.
 */
export function zoteroOperationLabel(operation: ZoteroMutationOperation): string {
  const t = i18n.t.bind(i18n)
  switch (operation.kind) {
    case 'createCollection':
      return t('researchPanel.zoteroPlan.createCollection', {
        name: operation.name,
        parent: operation.parentLabel
      })
    case 'moveCollection':
      return t('researchPanel.zoteroPlan.moveCollection', {
        path: operation.path,
        parent: operation.parentLabel
      })
    case 'renameCollection':
      return t('researchPanel.zoteroPlan.renameCollection', {
        path: operation.path,
        name: operation.newName
      })
    case 'updateItem': {
      const changes = [
        operation.addTags.length > 0 &&
          t('researchPanel.zoteroPlan.addTags', { tags: operation.addTags.join(', ') }),
        operation.removeTags.length > 0 &&
          t('researchPanel.zoteroPlan.removeTags', { tags: operation.removeTags.join(', ') }),
        operation.addCollections.length > 0 &&
          t('researchPanel.zoteroPlan.addToCollections', {
            collections: operation.addCollections.map((collection) => collection.path).join(', ')
          }),
        operation.removeCollections.length > 0 &&
          t('researchPanel.zoteroPlan.removeFromCollections', {
            collections: operation.removeCollections.map((collection) => collection.path).join(', ')
          })
      ]
        .filter(Boolean)
        .join('; ')
      return t('researchPanel.zoteroPlan.updateItem', { title: operation.title, changes })
    }
  }
}
