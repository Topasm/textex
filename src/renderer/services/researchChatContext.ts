import type {
  ResearchChatContext,
  ResearchChatSessionContext,
  ResearchProfile,
  ResearchResource
} from '../../shared/types'
import { compactResearchChatOnlineReference } from './researchChatSession'
import { buildReferenceChatContext, type ReferenceChatContextItem } from './referenceChatContext'

export type SessionReferenceContextItem = ReferenceChatContextItem & {
  /** Preserve a restored project/Zotero card summary across subsequent saves. */
  persistedSource?: string
}

export function paperContext(profile: ResearchProfile): ResearchChatContext | null {
  const paper = profile.paper
  const content = [
    paper.title && `Title: ${paper.title}`,
    paper.abstract && `Abstract: ${paper.abstract}`,
    paper.doi && `DOI: ${paper.doi}`,
    paper.arxiv && `arXiv: ${paper.arxiv}`,
    paper.venue && `Venue: ${paper.venue}`,
    paper.website && `Website: ${paper.website}`
  ]
    .filter(Boolean)
    .join('\n')
  return content ? { kind: 'paper', label: paper.title || 'Paper metadata', content } : null
}

export function authorContext(profile: ResearchProfile): ResearchChatContext | null {
  if (profile.paper.authors.length === 0) return null
  return {
    kind: 'author',
    label: 'Paper authors',
    content: profile.paper.authors
      .map((author) =>
        [
          author.name,
          author.role && `role=${author.role}`,
          author.homepage && `homepage=${author.homepage}`,
          author.github && `github=${author.github}`,
          author.orcid && `orcid=${author.orcid}`
        ]
          .filter(Boolean)
          .join('; ')
      )
      .join('\n')
  }
}

export function resourceMetadataContext(resource: ResearchResource): ResearchChatContext {
  const source = resource.url || resource.sshUrl || resource.localPath
  return {
    kind: resource.kind === 'git' ? 'repository' : 'website',
    resourceId: resource.id,
    label: resource.label || resource.id,
    source,
    content: [
      `Resource kind: ${resource.kind}`,
      resource.url && `URL: ${resource.url}`,
      resource.sshUrl && `SSH remote: ${resource.sshUrl}`,
      resource.localPath && `Local path: ${resource.localPath}`,
      resource.branch && `Branch: ${resource.branch}`
    ]
      .filter(Boolean)
      .join('\n')
  }
}

export function persistedReference(item: SessionReferenceContextItem): ResearchChatSessionContext {
  const descriptor = item.descriptor
  if (descriptor.source === 'online') {
    return {
      id: item.id,
      kind: 'reference',
      label: item.label,
      source: item.display.url,
      referenceSource: 'online',
      onlineReference: compactResearchChatOnlineReference(descriptor.reference)
    }
  }
  const summary =
    item.persistedSource ??
    [item.display.authors?.join(', '), item.display.year].filter(Boolean).join(' · ')
  return {
    id: item.id,
    kind: 'reference',
    label: item.label,
    ...(summary ? { source: summary } : {}),
    citekey: descriptor.citekey,
    referenceSource: descriptor.source
  }
}

export function restoredReference(
  context: ResearchChatSessionContext
): SessionReferenceContextItem | null {
  if (context.kind !== 'reference' || !context.referenceSource) return null
  if (context.referenceSource === 'online') {
    if (!context.onlineReference) return null
    const restored = buildReferenceChatContext({
      source: 'online',
      reference: context.onlineReference
    })
    return { ...restored, id: context.id, label: context.label }
  }
  if (!context.citekey) return null
  return {
    id: context.id,
    label: context.label,
    descriptor: { source: context.referenceSource, citekey: context.citekey },
    display: {},
    ...(context.source ? { persistedSource: context.source } : {})
  }
}

export function referenceRequestContext(item: ReferenceChatContextItem): ResearchChatContext {
  if (item.descriptor.source === 'online') {
    return {
      kind: 'reference',
      label: item.label,
      reference: { source: 'online', onlineReference: item.descriptor.reference }
    }
  }
  return {
    kind: 'reference',
    label: item.label,
    reference: { source: item.descriptor.source, citekey: item.descriptor.citekey }
  }
}
