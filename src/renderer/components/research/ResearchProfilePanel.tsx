import { useEffect, useRef, useState } from 'react'
import { ICON_SIZE } from '../ui/IconSystem'
import { useTranslation } from 'react-i18next'
import { Database, Download, Plus, RefreshCw, Save, Sparkles, Trash2 } from 'lucide-react'
import i18n from '../../i18n'
import type {
  ResearchPerson,
  ResearchProfile,
  ResearchResource,
  ResearchSourceIndex
} from '../../../shared/types'
import { documentRegistry } from '../../models/documentRegistry'
import { describeNativeError } from '../../services/nativeErrors'
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

// Only the stable values live here; labels resolve through i18n at render time
// so switching language re-renders the options.
const RESOURCE_KINDS: ReadonlyArray<ResearchResource['kind']> = [
  'git',
  'website',
  'dataset',
  'documentation'
]

const CHAT_ACCESS_VALUES: ReadonlyArray<ResearchResource['chatAccess']> = [
  'none',
  'metadata',
  'indexed-read',
  'snapshot'
]

function chatAccessOptions(
  kind: ResearchResource['kind']
): ReadonlyArray<ResearchResource['chatAccess']> {
  return CHAT_ACCESS_VALUES.filter((value) =>
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
  return String(
    i18n.t(`researchPanel.profileForm.suggestionField.${field}`, { defaultValue: field })
  )
}

export function ResearchProfilePanel() {
  const { t } = useTranslation()
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
          setStatus(describeNativeError(error))
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
      t('researchPanel.profileForm.filledFromDocument', {
        file: activeFilePath.split(/[\\/]/u).pop(),
        fields: fields.map(suggestionFieldLabel).join(', ')
      })
    )
  }, [activeFilePath, activeRevision, profile, t])

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
      setStatus(t('researchPanel.profileForm.openTexFirst'))
      return
    }
    const snapshot = documentRegistry.snapshot(activeFilePath)
    if (!snapshot) {
      setStatus(t('researchPanel.profileForm.documentUnavailable'))
      return
    }

    const suggestion = suggestResearchProfileFromLatex(snapshot.text)
    const added = profile ? applicableResearchProfileSuggestionFields(profile, suggestion) : []
    if (!profile || added.length === 0) {
      setStatus(t('researchPanel.profileForm.noSuggestions'))
      return
    }

    update((current) => applyResearchProfileSuggestion(current, suggestion))
    setStatus(
      t('researchPanel.profileForm.addedFromDocument', {
        fields: added.map(suggestionFieldLabel).join(', ')
      })
    )
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
    setStatus(
      t('researchPanel.profileForm.addedGitRemote', { kind: field === 'url' ? 'SSH' : 'HTTPS' })
    )
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
    setStatus(
      t('researchPanel.profileForm.indexing', {
        label: resource.label || t('researchPanel.profileForm.fallbackSource')
      })
    )
    try {
      const result = await window.api.researchSourceIndex(resource.id, localPath)
      if (
        indexGeneration.current === generation &&
        useProjectStore.getState().projectRoot === root
      ) {
        setSourceIndexes((current) => ({ ...current, [resource.id]: result }))
        setStatus(t('researchPanel.profileForm.indexed', { count: result.fileCount }))
      }
    } catch (error) {
      if (
        indexGeneration.current === generation &&
        useProjectStore.getState().projectRoot === root
      ) {
        const message = describeNativeError(error)
        setIndexErrors((current) => ({ ...current, [resource.id]: message }))
        setStatus(t('researchPanel.profileForm.indexFailed', { reason: message }))
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
    const verb =
      action === 'clone'
        ? t('researchPanel.profileForm.gitVerbClone')
        : t('researchPanel.profileForm.gitVerbFetch')
    if (
      !window.confirm(
        t('researchPanel.profileForm.gitConfirm', { verb, label: resource.label || resource.id })
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
    setStatus(
      action === 'clone'
        ? t('researchPanel.profileForm.cloning', {
            label: resource.label || t('researchPanel.profileForm.fallbackSource')
          })
        : t('researchPanel.profileForm.fetching', {
            label: resource.label || t('researchPanel.profileForm.fallbackSource')
          })
    )
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
      const label = resource.label || t('researchPanel.profileForm.fallbackSource')
      const summary =
        result.action === 'cloned'
          ? t('researchPanel.profileForm.cloned', { label, path: result.localPath })
          : t('researchPanel.profileForm.fetched', { label, path: result.localPath })
      setStatus(result.output ? `${summary}\n${result.output}` : summary)
    } catch (error) {
      if (
        indexGeneration.current === generation &&
        useProjectStore.getState().projectRoot === root
      ) {
        const message = describeNativeError(error)
        setIndexErrors((current) => ({ ...current, [resource.id]: message }))
        setStatus(
          action === 'clone'
            ? t('researchPanel.profileForm.gitCloneFailed', { reason: message })
            : t('researchPanel.profileForm.gitFetchFailed', { reason: message })
        )
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
    setStatus(t('researchPanel.profileForm.saving'))
    try {
      const saved = await window.api.researchProfileSave(normalizeProfileForSave(profile))
      if (
        saveGeneration.current === generation &&
        useProjectStore.getState().projectRoot === root
      ) {
        if (editRevision.current === revision) {
          setProfile(copyProfile(saved))
          clearResearchProfileDraft()
          setStatus(t('researchPanel.profileForm.saved'))
        } else {
          setStatus(t('researchPanel.profileForm.savedStale'))
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
    return <div className="research-empty">{t('researchPanel.profileForm.openProjectFirst')}</div>
  }

  if (loading) {
    return (
      <div className="research-empty" role="status">
        {t('researchPanel.profileForm.loading')}
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="research-profile-panel">
        <p className="research-status" role="alert">
          {status || t('researchPanel.profileForm.loadFailed')}
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
          {t('researchPanel.profileForm.createEmpty')}
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
      <p className="research-muted">{t('researchPanel.profileForm.autofillNotice')}</p>

      <ProfileSection title={t('researchPanel.profileForm.sectionPaper')} open>
        <button
          className="research-profile-suggest"
          type="button"
          disabled={!isLatexDocument(activeFilePath)}
          onClick={suggestFromDocument}
        >
          <Sparkles size={ICON_SIZE.compact} /> {t('researchPanel.profileForm.fillFromDocument')}
        </button>
        <ProfileField
          label={t('researchPanel.profileForm.fieldTitle')}
          value={profile.paper.title}
          onChange={(value) => updatePaper('title', value)}
        />
        <ProfileField
          label={t('researchPanel.profileForm.fieldAbstract')}
          value={profile.paper.abstract ?? ''}
          multiline
          onChange={(value) => updatePaper('abstract', value)}
        />
        <div className="research-profile-field-grid">
          <ProfileField
            label={t('researchPanel.profileForm.fieldVenue')}
            value={profile.paper.venue ?? ''}
            onChange={(value) => updatePaper('venue', value)}
          />
          <ProfileField
            label={t('researchPanel.profileForm.fieldWebsite')}
            type="url"
            value={profile.paper.website ?? ''}
            onChange={(value) => updatePaper('website', value)}
          />
        </div>
        <ProfileSection
          title={
            hasPublicationIdentifiers
              ? t('researchPanel.profileForm.sectionIdentifiersConfigured')
              : t('researchPanel.profileForm.sectionIdentifiersOptional')
          }
          open={hasPublicationIdentifiers}
        >
          <p className="research-muted">{t('researchPanel.profileForm.identifiersNotice')}</p>
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

      <ProfileSection
        title={t('researchPanel.profileForm.sectionAuthors', {
          count: profile.paper.authors.length
        })}
      >
        <div className="research-profile-items">
          {profile.paper.authors.map((author, index) => (
            <div className="research-profile-card" key={author.id}>
              <div className="research-profile-card-heading">
                <strong>
                  {author.name ||
                    t('researchPanel.profileForm.authorFallback', { index: index + 1 })}
                </strong>
                <button
                  type="button"
                  aria-label={t('researchPanel.profileForm.removeNamed', {
                    name:
                      author.name ||
                      t('researchPanel.profileForm.authorFallback', { index: index + 1 })
                  })}
                  title={t('researchPanel.profileForm.removeAuthor')}
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
                  <Trash2 size={ICON_SIZE.compact} />
                </button>
              </div>
              <div className="research-profile-field-grid">
                <ProfileField
                  label={t('researchPanel.profileForm.fieldName')}
                  value={author.name}
                  onChange={(value) => updateAuthor(author.id, 'name', value)}
                />
                <ProfileField
                  label={t('researchPanel.profileForm.fieldRole')}
                  value={author.role ?? ''}
                  onChange={(value) => updateAuthor(author.id, 'role', value)}
                />
                <ProfileField
                  label={t('researchPanel.profileForm.fieldHomepage')}
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
                  label={t('researchPanel.profileForm.fieldEmail')}
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
          <Plus size={ICON_SIZE.compact} /> {t('researchPanel.profileForm.addAuthor')}
        </button>
      </ProfileSection>

      <ProfileSection
        title={t('researchPanel.profileForm.sectionResources', { count: profile.resources.length })}
        open
      >
        <p className="research-muted">{t('researchPanel.profileForm.credentialsNotice')}</p>
        <div className="research-profile-items">
          {profile.resources.map((resource, index) => (
            <div className="research-profile-card" key={resource.id}>
              <div className="research-profile-card-heading">
                <strong>
                  {resource.label ||
                    t('researchPanel.profileForm.resourceFallback', { index: index + 1 })}
                </strong>
                <button
                  type="button"
                  aria-label={t('researchPanel.profileForm.removeNamed', {
                    name:
                      resource.label ||
                      t('researchPanel.profileForm.resourceFallback', { index: index + 1 })
                  })}
                  title={t('researchPanel.profileForm.removeResource')}
                  onClick={() =>
                    update((current) => ({
                      ...current,
                      resources: current.resources.filter((item) => item.id !== resource.id)
                    }))
                  }
                >
                  <Trash2 size={ICON_SIZE.compact} />
                </button>
              </div>
              <div className="research-profile-field-grid">
                <label className="research-profile-field">
                  <span>{t('researchPanel.profileForm.fieldKind')}</span>
                  <select
                    value={resource.kind}
                    onChange={(event) =>
                      updateResourceKind(
                        resource.id,
                        event.target.value as ResearchResource['kind']
                      )
                    }
                  >
                    {RESOURCE_KINDS.map((value) => (
                      <option key={value} value={value}>
                        {t(`researchPanel.profileForm.resourceKind.${value}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <ProfileField
                  label={t('researchPanel.profileForm.fieldLabel')}
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
                  <span>{t('researchPanel.profileForm.fieldChatAccess')}</span>
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
                    {chatAccessOptions(resource.kind).map((value) => (
                      <option key={value} value={value}>
                        {t(`researchPanel.profileForm.chatAccess.${value}`)}
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
                      label={t('researchPanel.profileForm.fieldLocalPath')}
                      value={resource.localPath ?? ''}
                      onChange={(value) => updateResourceLocalPath(resource, value)}
                    />
                    <ProfileField
                      label={t('researchPanel.profileForm.fieldBranch')}
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
                        <Download size={ICON_SIZE.compact} />
                        {gitResourceId === resource.id
                          ? t('researchPanel.profileForm.working')
                          : t('researchPanel.profileForm.clone')}
                      </button>
                      <button
                        className="research-profile-index"
                        type="button"
                        disabled={gitResourceId !== null || indexingResourceId !== null}
                        onClick={() => void runGitAction(resource, 'fetch')}
                      >
                        <RefreshCw size={ICON_SIZE.compact} />{' '}
                        {t('researchPanel.profileForm.fetch')}
                      </button>
                    </div>
                    <button
                      className="research-profile-index"
                      type="button"
                      disabled={indexingResourceId !== null || gitResourceId !== null}
                      onClick={() => void indexSource(resource)}
                    >
                      <Database size={ICON_SIZE.compact} />
                      {indexingResourceId === resource.id
                        ? t('researchPanel.profileForm.indexingShort')
                        : t('researchPanel.profileForm.indexSource')}
                    </button>
                    {sourceIndexes[resource.id] && (
                      <div className="research-profile-index-result" role="status">
                        <span>
                          {t('researchPanel.profileForm.fileCount', {
                            count: sourceIndexes[resource.id].fileCount
                          })}
                        </span>
                        <span>{formatBytes(sourceIndexes[resource.id].totalBytes)}</span>
                        {sourceIndexes[resource.id].truncated && (
                          <span className="warning">
                            {t('researchPanel.profileForm.indexLimitReached')}
                          </span>
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
          <Plus size={ICON_SIZE.compact} /> {t('researchPanel.profileForm.addResource')}
        </button>
      </ProfileSection>

      <ProfileSection title={t('researchPanel.profileForm.sectionInstructions')}>
        <p className="research-muted">{t('researchPanel.profileForm.instructionsNotice')}</p>
        <label className="research-profile-field">
          <span>{t('researchPanel.profileForm.instructionsLabel')}</span>
          <textarea
            rows={6}
            value={profile.instructions.join('\n')}
            placeholder={t('researchPanel.profileForm.instructionsPlaceholder')}
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
          <Save size={ICON_SIZE.compact} />{' '}
          {saving
            ? t('researchPanel.profileForm.saving')
            : t('researchPanel.profileForm.saveProfile')}
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
