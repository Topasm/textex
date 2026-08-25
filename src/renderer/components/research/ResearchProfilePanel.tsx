import { useEffect, useRef, useState } from 'react'
import { Database, Download, Plus, RefreshCw, Save, Sparkles, Trash2 } from 'lucide-react'
import type {
  ResearchPerson,
  ResearchProfile,
  ResearchResource,
  ResearchSourceIndex
} from '../../../shared/types'
import { documentRegistry } from '../../models/documentRegistry'
import {
  alternateGitRemote,
  applicableResearchProfileSuggestionFields,
  applyResearchProfileSuggestion,
  suggestResearchProfileFromLatex,
  type ResearchProfileSuggestionField
} from '../../services/researchProfileSuggestions'
import {
  clearResearchProfileDraft,
  setResearchProfileDraftDirty
} from '../../services/researchProfileDraft'
import { useEditorStore } from '../../store/useEditorStore'
import { useProjectStore } from '../../store/useProjectStore'

const EMPTY_PROFILE: ResearchProfile = {
  version: 1,
  paper: { title: '', authors: [] },
  resources: [],
  instructions: []
}

const RESOURCE_KINDS: Array<{ value: ResearchResource['kind']; label: string }> = [
  { value: 'git', label: 'Git repository' },
  { value: 'website', label: 'Website' },
  { value: 'dataset', label: 'Dataset' },
  { value: 'documentation', label: 'Documentation' }
]

const CHAT_ACCESS_OPTIONS: Array<{ value: ResearchResource['chatAccess']; label: string }> = [
  { value: 'none', label: 'No access' },
  { value: 'metadata', label: 'Metadata only' },
  { value: 'indexed-read', label: 'Read indexed source' },
  { value: 'snapshot', label: 'Read saved snapshot' }
]

function chatAccessOptions(
  kind: ResearchResource['kind']
): Array<{ value: ResearchResource['chatAccess']; label: string }> {
  return CHAT_ACCESS_OPTIONS.filter(({ value }) =>
    kind === 'git' ? value !== 'snapshot' : value !== 'indexed-read'
  )
}

function safeChatAccess(
  kind: ResearchResource['kind'],
  access: ResearchResource['chatAccess']
): ResearchResource['chatAccess'] {
  if (access === 'none' || access === 'metadata') return access
  if (kind === 'git' && access === 'indexed-read') return access
  if (kind !== 'git' && access === 'snapshot') return access
  return 'metadata'
}

function createId(prefix: string): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function copyProfile(profile: ResearchProfile): ResearchProfile {
  return {
    ...profile,
    paper: { ...profile.paper, authors: profile.paper.authors.map((author) => ({ ...author })) },
    resources: profile.resources.map((resource) => ({ ...resource })),
    instructions: [...profile.instructions]
  }
}

function optionalText(value: string | undefined, preserveWhitespace = false): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  return preserveWhitespace ? value : trimmed
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T
}

function normalizeProfileForSave(profile: ResearchProfile): ResearchProfile {
  return {
    ...profile,
    paper: withoutUndefined({
      ...profile.paper,
      abstract: optionalText(profile.paper.abstract, true),
      doi: optionalText(profile.paper.doi),
      arxiv: optionalText(profile.paper.arxiv),
      venue: optionalText(profile.paper.venue),
      website: optionalText(profile.paper.website),
      authors: profile.paper.authors.map((author) =>
        withoutUndefined({
          ...author,
          role: optionalText(author.role),
          email: optionalText(author.email),
          homepage: optionalText(author.homepage),
          github: optionalText(author.github),
          orcid: optionalText(author.orcid)
        })
      )
    }),
    resources: profile.resources.map((resource) =>
      withoutUndefined({
        ...resource,
        url: optionalText(resource.url),
        sshUrl: optionalText(resource.sshUrl),
        localPath: optionalText(resource.localPath),
        branch: optionalText(resource.branch)
      })
    ),
    instructions: profile.instructions.map((instruction) => instruction.trim()).filter(Boolean)
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isLatexDocument(filePath: string | null): filePath is string {
  return Boolean(filePath && /\.tex$/iu.test(filePath))
}

function suggestionFieldLabel(field: ResearchProfileSuggestionField): string {
  if (field === 'doi') return 'DOI'
  if (field === 'arxiv') return 'arXiv'
  return field
}

export function ResearchProfilePanel() {
  const projectRoot = useProjectStore((state) => state.projectRoot)
  const activeFilePath = useEditorStore((state) => state.activeFilePath)
  const activeRevision = useEditorStore((state) => state.revision)
  const [profile, setProfile] = useState<ResearchProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [sourceIndexes, setSourceIndexes] = useState<Record<string, ResearchSourceIndex>>({})
  const [indexErrors, setIndexErrors] = useState<Record<string, string>>({})
  const [indexingResourceId, setIndexingResourceId] = useState<string | null>(null)
  const [gitResourceId, setGitResourceId] = useState<string | null>(null)
  const loadGeneration = useRef(0)
  const saveGeneration = useRef(0)
  const indexGeneration = useRef(0)
  const editRevision = useRef(0)
  const manuallyEditedMetadata = useRef(new Set<ResearchProfileSuggestionField>())
  const saveInFlight = useRef(false)
  const sourceOperationInFlight = useRef(false)

  useEffect(
    () => () => {
      clearResearchProfileDraft()
    },
    []
  )

  useEffect(() => {
    const generation = ++loadGeneration.current
    const root = projectRoot
    saveGeneration.current += 1
    indexGeneration.current += 1
    editRevision.current = 0
    manuallyEditedMetadata.current.clear()
    saveInFlight.current = false
    sourceOperationInFlight.current = false
    clearResearchProfileDraft()
    setStatus('')
    setSaving(false)
    setSourceIndexes({})
    setIndexErrors({})
    setIndexingResourceId(null)
    setGitResourceId(null)
    if (!projectRoot) {
      setProfile(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setProfile(null)
    void window.api
      .researchProfileLoad()
      .then((loaded) => {
        if (
          loadGeneration.current === generation &&
          useProjectStore.getState().projectRoot === root
        ) {
          setProfile(copyProfile(loaded))
          editRevision.current = 0
          clearResearchProfileDraft()
        }
      })
      .catch((error: unknown) => {
        if (
          loadGeneration.current === generation &&
          useProjectStore.getState().projectRoot === root
        ) {
          setStatus(error instanceof Error ? error.message : String(error))
        }
      })
      .finally(() => {
        if (
          loadGeneration.current === generation &&
          useProjectStore.getState().projectRoot === root
        )
          setLoading(false)
      })
  }, [projectRoot])

  const update = (recipe: (current: ResearchProfile) => ResearchProfile) => {
    setProfile((current) => (current ? recipe(current) : current))
    editRevision.current += 1
    setResearchProfileDraftDirty(true)
    setStatus('')
  }

  const updatePaper = (field: keyof ResearchProfile['paper'], value: string) => {
    if (field === 'title' || field === 'doi' || field === 'arxiv') {
      manuallyEditedMetadata.current.add(field)
    }
    update((current) => ({ ...current, paper: { ...current.paper, [field]: value } }))
  }

  const updateAuthor = (id: string, field: keyof ResearchPerson, value: string) => {
    manuallyEditedMetadata.current.add('authors')
    update((current) => ({
      ...current,
      paper: {
        ...current.paper,
        authors: current.paper.authors.map((author) =>
          author.id === id ? { ...author, [field]: value } : author
        )
      }
    }))
  }

  useEffect(() => {
    if (!profile || !isLatexDocument(activeFilePath)) return
    const snapshot = documentRegistry.snapshot(activeFilePath)
    if (!snapshot) return

    const suggestion = suggestResearchProfileFromLatex(snapshot.text)
    const fields = applicableResearchProfileSuggestionFields(
      profile,
      suggestion,
      manuallyEditedMetadata.current
    )
    if (fields.length === 0) return

    setProfile(applyResearchProfileSuggestion(profile, suggestion, manuallyEditedMetadata.current))
    editRevision.current += 1
    setResearchProfileDraftDirty(true)
    setStatus(
      `Filled from ${activeFilePath.split(/[\\/]/u).pop()}: ${fields.map(suggestionFieldLabel).join(', ')}.`
    )
  }, [activeFilePath, activeRevision, profile])

  const updateResource = <K extends keyof ResearchResource>(
    id: string,
    field: K,
    value: ResearchResource[K]
  ) => {
    update((current) => ({
      ...current,
      resources: current.resources.map((resource) =>
        resource.id === id ? { ...resource, [field]: value } : resource
      )
    }))
  }

  const updateResourceKind = (id: string, kind: ResearchResource['kind']) => {
    update((current) => ({
      ...current,
      resources: current.resources.map((resource) =>
        resource.id === id
          ? { ...resource, kind, chatAccess: safeChatAccess(kind, resource.chatAccess) }
          : resource
      )
    }))
  }

  const suggestFromDocument = () => {
    if (!isLatexDocument(activeFilePath)) {
      setStatus('Open a .tex document before requesting profile suggestions.')
      return
    }
    const snapshot = documentRegistry.snapshot(activeFilePath)
    if (!snapshot) {
      setStatus('The active document is not available.')
      return
    }

    const suggestion = suggestResearchProfileFromLatex(snapshot.text)
    const added = profile ? applicableResearchProfileSuggestionFields(profile, suggestion) : []
    if (!profile || added.length === 0) {
      setStatus('No suggestions were found for empty profile fields.')
      return
    }

    update((current) => applyResearchProfileSuggestion(current, suggestion))
    setStatus(`Added from the active document: ${added.map(suggestionFieldLabel).join(', ')}.`)
  }

  const fillAlternateGitRemote = (resource: ResearchResource, field: 'url' | 'sshUrl') => {
    const value = resource[field] ?? ''
    const alternate = alternateGitRemote(value)
    const shouldFillAlternate = Boolean(alternate && !resource[field === 'url' ? 'sshUrl' : 'url'])
    if (!shouldFillAlternate) return
    update((current) => ({
      ...current,
      resources: current.resources.map((item) =>
        item.id !== resource.id
          ? item
          : field === 'url'
            ? { ...item, sshUrl: alternate }
            : { ...item, url: alternate }
      )
    }))
    setStatus(`Added the matching ${field === 'url' ? 'SSH' : 'HTTPS'} Git remote.`)
  }

  const updateResourceLocalPath = (resource: ResearchResource, localPath: string) => {
    setSourceIndexes((current) => {
      const next = { ...current }
      delete next[resource.id]
      return next
    })
    setIndexErrors((current) => {
      const next = { ...current }
      delete next[resource.id]
      return next
    })
    updateResource(resource.id, 'localPath', localPath)
  }

  const indexSource = async (resource: ResearchResource) => {
    const localPath = resource.localPath?.trim()
    if (!localPath || !projectRoot || sourceOperationInFlight.current) return
    const generation = ++indexGeneration.current
    const root = projectRoot
    sourceOperationInFlight.current = true
    setIndexingResourceId(resource.id)
    setIndexErrors((current) => {
      const next = { ...current }
      delete next[resource.id]
      return next
    })
    setStatus(`Indexing ${resource.label || 'source'}…`)
    try {
      const result = await window.api.researchSourceIndex(resource.id, localPath)
      if (
        indexGeneration.current === generation &&
        useProjectStore.getState().projectRoot === root
      ) {
        setSourceIndexes((current) => ({ ...current, [resource.id]: result }))
        setStatus(`Indexed ${result.fileCount} source files.`)
      }
    } catch (error) {
      if (
        indexGeneration.current === generation &&
        useProjectStore.getState().projectRoot === root
      ) {
        const message = error instanceof Error ? error.message : String(error)
        setIndexErrors((current) => ({ ...current, [resource.id]: message }))
        setStatus(`Source indexing failed: ${message}`)
      }
    } finally {
      if (indexGeneration.current === generation) {
        sourceOperationInFlight.current = false
        setIndexingResourceId(null)
      }
    }
  }

  const runGitAction = async (resource: ResearchResource, action: 'clone' | 'fetch') => {
    if (!profile || !projectRoot || saveInFlight.current || sourceOperationInFlight.current) return
    sourceOperationInFlight.current = true
    const verb = action === 'clone' ? 'clone this repository' : 'fetch updates'
    if (
      !window.confirm(
        `Save this profile and ${verb} using your existing Git/SSH credentials?\n\n${resource.label || resource.id}`
      )
    ) {
      sourceOperationInFlight.current = false
      return
    }

    const generation = ++indexGeneration.current
    const root = projectRoot
    const revision = editRevision.current
    saveInFlight.current = true
    setGitResourceId(resource.id)
    setStatus(`${action === 'clone' ? 'Cloning' : 'Fetching'} ${resource.label || 'source'}…`)
    try {
      const saved = await window.api.researchProfileSave(normalizeProfileForSave(profile))
      if (indexGeneration.current !== generation || useProjectStore.getState().projectRoot !== root)
        return
      if (editRevision.current === revision) {
        setProfile(copyProfile(saved))
        clearResearchProfileDraft()
      }
      const result =
        action === 'clone'
          ? await window.api.researchSourceClone(resource.id)
          : await window.api.researchSourceFetch(resource.id)
      if (indexGeneration.current !== generation || useProjectStore.getState().projectRoot !== root)
        return
      setStatus(
        `${result.action === 'cloned' ? 'Cloned' : 'Fetched'} ${resource.label || 'source'} at ${result.localPath}.${result.output ? `\n${result.output}` : ''}`
      )
    } catch (error) {
      if (
        indexGeneration.current === generation &&
        useProjectStore.getState().projectRoot === root
      ) {
        const message = error instanceof Error ? error.message : String(error)
        setIndexErrors((current) => ({ ...current, [resource.id]: message }))
        setStatus(`Git ${action} failed: ${message}`)
      }
    } finally {
      if (indexGeneration.current === generation) {
        saveInFlight.current = false
        sourceOperationInFlight.current = false
        setGitResourceId(null)
      }
    }
  }

  const save = async () => {
    if (!profile || !projectRoot || saveInFlight.current) return
    saveInFlight.current = true
    const generation = ++saveGeneration.current
    const root = projectRoot
    const revision = editRevision.current
    setSaving(true)
    setStatus('Saving…')
    try {
      const saved = await window.api.researchProfileSave(normalizeProfileForSave(profile))
      if (
        saveGeneration.current === generation &&
        useProjectStore.getState().projectRoot === root
      ) {
        if (editRevision.current === revision) {
          setProfile(copyProfile(saved))
          clearResearchProfileDraft()
          setStatus('Research profile saved.')
        } else {
          setStatus('Profile saved. You have newer unsaved changes.')
        }
      }
    } catch (error) {
      if (
        saveGeneration.current === generation &&
        useProjectStore.getState().projectRoot === root
      ) {
        setStatus(error instanceof Error ? error.message : String(error))
      }
    } finally {
      if (saveGeneration.current === generation) {
        saveInFlight.current = false
        setSaving(false)
      }
    }
  }

  if (!projectRoot) {
    return <div className="research-empty">Open a project to configure its research profile.</div>
  }

  if (loading) {
    return (
      <div className="research-empty" role="status">
        Loading research profile…
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="research-profile-panel">
        <p className="research-status" role="alert">
          {status || 'The research profile could not be loaded.'}
        </p>
        <button
          className="research-primary-action"
          onClick={() => {
            setProfile(copyProfile(EMPTY_PROFILE))
            editRevision.current += 1
            setResearchProfileDraftDirty(true)
            setStatus('')
          }}
        >
          Create an empty profile
        </button>
      </div>
    )
  }

  const hasPublicationIdentifiers = Boolean(
    profile.paper.doi?.trim() || profile.paper.arxiv?.trim()
  )

  return (
    <form
      className="research-profile-panel"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <p className="research-muted">
        Empty title, author, DOI, and arXiv fields are filled from explicit commands in the active
        .tex document. Values you enter are never overwritten.
      </p>

      <ProfileSection title="Paper" open>
        <button
          className="research-profile-suggest"
          type="button"
          disabled={!isLatexDocument(activeFilePath)}
          onClick={suggestFromDocument}
        >
          <Sparkles size={14} /> Fill empty fields from document
        </button>
        <ProfileField
          label="Title"
          value={profile.paper.title}
          onChange={(value) => updatePaper('title', value)}
        />
        <ProfileField
          label="Abstract"
          value={profile.paper.abstract ?? ''}
          multiline
          onChange={(value) => updatePaper('abstract', value)}
        />
        <div className="research-profile-field-grid">
          <ProfileField
            label="Venue"
            value={profile.paper.venue ?? ''}
            onChange={(value) => updatePaper('venue', value)}
          />
          <ProfileField
            label="Project website"
            type="url"
            value={profile.paper.website ?? ''}
            onChange={(value) => updatePaper('website', value)}
          />
        </div>
        <ProfileSection
          title={`Publication identifiers (${hasPublicationIdentifiers ? 'configured' : 'optional'})`}
          open={hasPublicationIdentifiers}
        >
          <p className="research-muted">
            Add these only when the paper has a published DOI or arXiv identifier.
          </p>
          <div className="research-profile-field-grid">
            <ProfileField
              label="DOI"
              value={profile.paper.doi ?? ''}
              onChange={(value) => updatePaper('doi', value)}
            />
            <ProfileField
              label="arXiv"
              value={profile.paper.arxiv ?? ''}
              onChange={(value) => updatePaper('arxiv', value)}
            />
          </div>
        </ProfileSection>
      </ProfileSection>

      <ProfileSection title={`Authors (${profile.paper.authors.length})`}>
        <div className="research-profile-items">
          {profile.paper.authors.map((author, index) => (
            <div className="research-profile-card" key={author.id}>
              <div className="research-profile-card-heading">
                <strong>{author.name || `Author ${index + 1}`}</strong>
                <button
                  type="button"
                  aria-label={`Remove ${author.name || `author ${index + 1}`}`}
                  title="Remove author"
                  onClick={() => {
                    manuallyEditedMetadata.current.add('authors')
                    update((current) => ({
                      ...current,
                      paper: {
                        ...current.paper,
                        authors: current.paper.authors.filter((item) => item.id !== author.id)
                      }
                    }))
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="research-profile-field-grid">
                <ProfileField
                  label="Name"
                  value={author.name}
                  onChange={(value) => updateAuthor(author.id, 'name', value)}
                />
                <ProfileField
                  label="Role"
                  value={author.role ?? ''}
                  onChange={(value) => updateAuthor(author.id, 'role', value)}
                />
                <ProfileField
                  label="Homepage"
                  type="url"
                  value={author.homepage ?? ''}
                  onChange={(value) => updateAuthor(author.id, 'homepage', value)}
                />
                <ProfileField
                  label="GitHub"
                  type="url"
                  value={author.github ?? ''}
                  onChange={(value) => updateAuthor(author.id, 'github', value)}
                />
                <ProfileField
                  label="ORCID"
                  value={author.orcid ?? ''}
                  onChange={(value) => updateAuthor(author.id, 'orcid', value)}
                />
                <ProfileField
                  label="Email"
                  type="email"
                  value={author.email ?? ''}
                  onChange={(value) => updateAuthor(author.id, 'email', value)}
                />
              </div>
            </div>
          ))}
        </div>
        <button
          className="research-profile-add"
          type="button"
          onClick={() => {
            manuallyEditedMetadata.current.add('authors')
            const author: ResearchPerson = { id: createId('author'), name: '' }
            update((current) => ({
              ...current,
              paper: { ...current.paper, authors: [...current.paper.authors, author] }
            }))
          }}
        >
          <Plus size={14} /> Add author
        </button>
      </ProfileSection>

      <ProfileSection title={`Resources (${profile.resources.length})`} open>
        <p className="research-muted">
          Credentials are never stored here. SSH repositories use your configured SSH agent.
        </p>
        <div className="research-profile-items">
          {profile.resources.map((resource, index) => (
            <div className="research-profile-card" key={resource.id}>
              <div className="research-profile-card-heading">
                <strong>{resource.label || `Resource ${index + 1}`}</strong>
                <button
                  type="button"
                  aria-label={`Remove ${resource.label || `resource ${index + 1}`}`}
                  title="Remove resource"
                  onClick={() =>
                    update((current) => ({
                      ...current,
                      resources: current.resources.filter((item) => item.id !== resource.id)
                    }))
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="research-profile-field-grid">
                <label className="research-profile-field">
                  <span>Kind</span>
                  <select
                    value={resource.kind}
                    onChange={(event) =>
                      updateResourceKind(
                        resource.id,
                        event.target.value as ResearchResource['kind']
                      )
                    }
                  >
                    {RESOURCE_KINDS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <ProfileField
                  label="Label"
                  value={resource.label}
                  onChange={(value) => updateResource(resource.id, 'label', value)}
                />
                <ProfileField
                  label="URL"
                  type="url"
                  value={resource.url ?? ''}
                  onChange={(value) => updateResource(resource.id, 'url', value)}
                  onBlur={
                    resource.kind === 'git'
                      ? () => fillAlternateGitRemote(resource, 'url')
                      : undefined
                  }
                />
                <label className="research-profile-field">
                  <span>Chat access</span>
                  <select
                    value={resource.chatAccess}
                    onChange={(event) =>
                      updateResource(
                        resource.id,
                        'chatAccess',
                        event.target.value as ResearchResource['chatAccess']
                      )
                    }
                  >
                    {chatAccessOptions(resource.kind).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {resource.kind === 'git' && (
                  <>
                    <ProfileField
                      label="SSH URL"
                      value={resource.sshUrl ?? ''}
                      onChange={(value) => updateResource(resource.id, 'sshUrl', value)}
                      onBlur={() => fillAlternateGitRemote(resource, 'sshUrl')}
                    />
                    <ProfileField
                      label="Local path"
                      value={resource.localPath ?? ''}
                      onChange={(value) => updateResourceLocalPath(resource, value)}
                    />
                    <ProfileField
                      label="Branch"
                      value={resource.branch ?? ''}
                      onChange={(value) => updateResource(resource.id, 'branch', value)}
                    />
                  </>
                )}
              </div>
              {resource.kind === 'git' &&
                resource.chatAccess === 'indexed-read' &&
                resource.localPath?.trim() && (
                  <div className="research-profile-index-controls">
                    <div className="research-profile-source-actions">
                      <button
                        className="research-profile-index"
                        type="button"
                        disabled={gitResourceId !== null || indexingResourceId !== null}
                        onClick={() => void runGitAction(resource, 'clone')}
                      >
                        <Download size={14} />
                        {gitResourceId === resource.id ? 'Working…' : 'Clone'}
                      </button>
                      <button
                        className="research-profile-index"
                        type="button"
                        disabled={gitResourceId !== null || indexingResourceId !== null}
                        onClick={() => void runGitAction(resource, 'fetch')}
                      >
                        <RefreshCw size={14} /> Fetch
                      </button>
                    </div>
                    <button
                      className="research-profile-index"
                      type="button"
                      disabled={indexingResourceId !== null || gitResourceId !== null}
                      onClick={() => void indexSource(resource)}
                    >
                      <Database size={14} />
                      {indexingResourceId === resource.id ? 'Indexing…' : 'Index source'}
                    </button>
                    {sourceIndexes[resource.id] && (
                      <div className="research-profile-index-result" role="status">
                        <span>{sourceIndexes[resource.id].fileCount} files</span>
                        <span>{formatBytes(sourceIndexes[resource.id].totalBytes)}</span>
                        {sourceIndexes[resource.id].truncated && (
                          <span className="warning">Index limit reached</span>
                        )}
                      </div>
                    )}
                    {indexErrors[resource.id] && (
                      <div className="research-profile-index-error" role="alert">
                        {indexErrors[resource.id]}
                      </div>
                    )}
                  </div>
                )}
            </div>
          ))}
        </div>
        <button
          className="research-profile-add"
          type="button"
          onClick={() => {
            const resource: ResearchResource = {
              id: createId('resource'),
              kind: 'git',
              label: '',
              url: '',
              chatAccess: 'metadata'
            }
            update((current) => ({ ...current, resources: [...current.resources, resource] }))
          }}
        >
          <Plus size={14} /> Add resource
        </button>
      </ProfileSection>

      <ProfileSection title="Chat access & instructions">
        <p className="research-muted">
          Only instructions you enter here guide Chat. Resource content remains untrusted reference
          material.
        </p>
        <label className="research-profile-field">
          <span>Project-specific instructions, one per line</span>
          <textarea
            rows={6}
            value={profile.instructions.join('\n')}
            placeholder="Compare implementation claims against the paper."
            onChange={(event) =>
              update((current) => ({
                ...current,
                instructions: event.target.value ? event.target.value.split('\n') : []
              }))
            }
          />
        </label>
      </ProfileSection>

      <div className="research-profile-footer">
        <button
          className="research-profile-save"
          type="submit"
          disabled={saving || gitResourceId !== null}
        >
          <Save size={14} /> {saving ? 'Saving…' : 'Save profile'}
        </button>
        {status && (
          <span className="research-profile-save-status" role="status">
            {status}
          </span>
        )}
      </div>
    </form>
  )
}

function ProfileSection({
  title,
  open = false,
  children
}: {
  title: string
  open?: boolean
  children: React.ReactNode
}) {
  return (
    <details className="research-profile-section" {...(open ? { open: true } : {})}>
      <summary>{title}</summary>
      <div className="research-profile-section-content">{children}</div>
    </details>
  )
}

function ProfileField({
  label,
  value,
  onChange,
  onBlur,
  type = 'text',
  multiline = false
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: (value: string) => void
  type?: 'text' | 'url' | 'email'
  multiline?: boolean
}) {
  return (
    <label className={`research-profile-field${multiline ? ' wide' : ''}`}>
      <span>{label}</span>
      {multiline ? (
        <textarea
          rows={4}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => onBlur?.(event.currentTarget.value)}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => onBlur?.(event.currentTarget.value)}
        />
      )}
    </label>
  )
}
