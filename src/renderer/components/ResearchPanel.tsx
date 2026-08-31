import { useCallback, useEffect, useRef, useState } from 'react'
import { ICON_SIZE } from './ui/IconSystem'
import { BookOpen, MessageSquare, PanelRightClose, ScrollText, Settings2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCompileStore } from '../store/useCompileStore'
import { useProjectStore, type ResearchPanelTab } from '../store/useProjectStore'
import { useNotificationStore } from '../store/useNotificationStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { useResearchPanelResize } from '../hooks/useResearchPanelResize'
import { usePanelTabSwipe } from '../hooks/usePanelTabSwipe'
import type { AnimatedPresencePhase } from '../hooks/useAnimatedPresence'
import { RESEARCH_PANEL_WIDTH_MAX, RESEARCH_PANEL_WIDTH_MIN } from '../constants'
import { getKeyboardResizeValue } from '../utils/keyboardResize'
import { errorMessage } from '../utils/errorMessage'
import {
  clearResearchProfileDraft,
  confirmResearchProfileDraftDiscard
} from '../services/researchProfileDraft'
import { ResearchChatPanel } from './research/ResearchChatPanel'
import { ReferencesPanel } from './research/ReferencesPanel'
import { ResearchProfilePanel } from './research/ResearchProfilePanel'
import LogPanel from './LogPanel'
import {
  parseReferenceDragData,
  TEXTEX_REFERENCE_MIME,
  type ReferenceDragPayload
} from './research/referenceActions'

/** Swipe order, matching the tab strip left to right. */
const RESEARCH_TAB_ORDER: ResearchPanelTab[] = ['chat', 'references', 'profile', 'problems']

interface ResearchPanelProps {
  onAiDraft: () => void
  onCompile?: () => Promise<void>
  presencePhase?: AnimatedPresencePhase
}

export interface PendingChatReference {
  token: number
  projectRoot: string
  payload: ReferenceDragPayload
}

export interface PendingChatPrompt {
  token: number
  projectRoot: string
  prompt: string
}

export function ResearchPanel({
  onAiDraft,
  onCompile,
  presencePhase = 'entered'
}: ResearchPanelProps) {
  const { t } = useTranslation()
  const open = useProjectStore((state) => state.isResearchPanelOpen)
  const tab = useProjectStore((state) => state.researchPanelTab)
  const width = useProjectStore((state) => state.researchPanelWidth)
  const projectRoot = useProjectStore((state) => state.projectRoot)
  const pendingResearchSelection = useProjectStore((state) => state.pendingResearchSelection)
  const diagnostics = useCompileStore((state) => state.diagnostics)
  const aiProvider = useSettingsStore((state) => state.settings.aiProvider)
  const problemCount = diagnostics.length
  const problemsLabel =
    problemCount === 0
      ? t('logPanel.problems')
      : t('logPanel.problemsCount', { count: problemCount })
  const panelRef = useRef<HTMLDivElement>(null)
  const [isCompact, setIsCompact] = useState(() => window.innerWidth < 1200)
  const [chatDropActive, setChatDropActive] = useState(false)
  const [pendingChatReference, setPendingChatReference] = useState<PendingChatReference | null>(
    null
  )
  const [pendingChatPrompt, setPendingChatPrompt] = useState<PendingChatPrompt | null>(null)
  const [mountedTabs, setMountedTabs] = useState<Set<ResearchPanelTab>>(() =>
    open ? new Set([tab]) : new Set()
  )
  const nextChatReferenceToken = useRef(0)
  const nextChatPromptToken = useRef(0)
  const startResize = useResearchPanelResize(panelRef, open)
  const repairCli = aiProvider === 'claude-cli' ? 'claude' : 'codex'
  const repairCliName = repairCli === 'claude' ? 'Claude Code' : 'Codex CLI'

  const resizePanelByKeyboard = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = useProjectStore.getState().researchPanelWidth
    const next = getKeyboardResizeValue(event, current, {
      min: RESEARCH_PANEL_WIDTH_MIN,
      max: RESEARCH_PANEL_WIDTH_MAX,
      step: 10,
      largeStep: 40,
      invertArrows: true
    })
    if (next === null) return
    event.preventDefault()
    useProjectStore.getState().setResearchPanelWidth(next)
  }, [])

  useEffect(() => {
    setChatDropActive(false)
    setPendingChatReference(null)
    setPendingChatPrompt(null)
  }, [projectRoot])

  useEffect(() => {
    if (!open) return
    setMountedTabs((current) => {
      if (current.has(tab)) return current
      return new Set(current).add(tab)
    })
  }, [open, tab])

  const leaveProfile = useCallback(() => {
    if (tab !== 'profile') return true
    if (!confirmResearchProfileDraftDiscard()) return false
    clearResearchProfileDraft()
    return true
  }, [tab])

  const queueChatReference = useCallback(
    (payload: ReferenceDragPayload) => {
      if (!projectRoot) {
        useNotificationStore.getState().pushNotification({
          tone: 'warning',
          message: t('researchPanel.openProjectForChatReference')
        })
        return
      }
      if (!leaveProfile()) return
      nextChatReferenceToken.current += 1
      setPendingChatReference({
        token: nextChatReferenceToken.current,
        projectRoot,
        payload
      })
      useProjectStore.getState().setResearchPanelTab('chat')
    },
    [leaveProfile, projectRoot, t]
  )

  const queueChatPrompt = useCallback(
    (prompt: string) => {
      if (!projectRoot || !prompt.trim()) return
      if (!leaveProfile()) return
      nextChatPromptToken.current += 1
      setPendingChatPrompt({
        token: nextChatPromptToken.current,
        projectRoot,
        prompt
      })
      setMountedTabs((current) => new Set(current).add('chat'))
      useProjectStore.getState().setResearchPanelTab('chat')
    },
    [leaveProfile, projectRoot]
  )

  const openRepairCli = useCallback(
    async (prompt: string) => {
      if (!projectRoot) return
      try {
        const cliStatus =
          repairCli === 'claude'
            ? await window.api.aiCheckCli()
            : await window.api.aiCheckCodexCli()
        if (!cliStatus.available) {
          throw new Error(cliStatus.error || `${repairCliName} was not found.`)
        }
        if (repairCli === 'claude') {
          await window.api.aiOpenClaudeTerminal({ workDir: projectRoot, prompt })
        } else {
          await window.api.aiOpenCodexTerminal({ workDir: projectRoot, prompt })
        }
        useNotificationStore.getState().pushNotification({
          tone: 'success',
          message: `Opened ${repairCliName} with the current compilation problems.`
        })
      } catch (error) {
        useNotificationStore.getState().pushNotification({
          tone: 'error',
          message: errorMessage(error)
        })
      }
    },
    [projectRoot, repairCli, repairCliName]
  )

  const dropReferenceOnChat = useCallback(
    (event: React.DragEvent<HTMLButtonElement>) => {
      event.preventDefault()
      setChatDropActive(false)
      const payload = parseReferenceDragData(event.dataTransfer.getData(TEXTEX_REFERENCE_MIME))
      if (!payload) {
        useNotificationStore.getState().pushNotification({
          tone: 'error',
          message: t('researchPanel.invalidReferenceDrop')
        })
        return
      }
      queueChatReference(payload)
    },
    [queueChatReference, t]
  )

  const closePanel = useCallback(() => {
    if (!leaveProfile()) return
    useProjectStore.getState().closeResearchPanel()
    window.requestAnimationFrame(() => document.getElementById('research-panel-toggle')?.focus())
  }, [leaveProfile])

  const selectTab = useCallback(
    (nextTab: ResearchPanelTab) => {
      if (nextTab === tab || !leaveProfile()) return
      setMountedTabs((current) => new Set(current).add(nextTab))
      useProjectStore.getState().setResearchPanelTab(nextTab)
    },
    [leaveProfile, tab]
  )

  const { handleWheel, slideAnim } = usePanelTabSwipe<ResearchPanelTab>({
    tabs: RESEARCH_TAB_ORDER,
    activeTab: tab,
    onSelect: selectTab
  })

  useEffect(() => {
    if (!open) return
    const onResize = () => setIsCompact(window.innerWidth < 1200)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open])

  useEffect(() => {
    if (!open || !isCompact) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePanel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closePanel, isCompact, open])

  if (!open && presencePhase !== 'exiting') return null

  return (
    <aside
      ref={panelRef}
      id="research-panel"
      className={`research-panel overlay research-panel-${presencePhase}`}
      style={{ width }}
      onWheel={handleWheel}
      aria-label={t('researchPanel.label')}
      aria-hidden={!open}
      inert={!open ? true : undefined}
    >
      <div
        className="research-resize-handle panel-resize-handle"
        onMouseDown={startResize}
        onKeyDown={resizePanelByKeyboard}
        role="separator"
        tabIndex={0}
        aria-label={t('researchPanel.resize')}
        aria-orientation="vertical"
        aria-valuemin={RESEARCH_PANEL_WIDTH_MIN}
        aria-valuemax={RESEARCH_PANEL_WIDTH_MAX}
        aria-valuenow={Math.round(width)}
      />
      <div
        className="research-panel-tabs panel-tabs"
        role="tablist"
        aria-label={t('researchPanel.label')}
      >
        <button
          type="button"
          role="tab"
          id="research-tab-chat"
          aria-controls="research-tabpanel-chat"
          aria-label={t('researchPanel.tabs.chat')}
          aria-selected={tab === 'chat'}
          title={t('researchPanel.tabs.chat')}
          className={`${tab === 'chat' ? 'active' : ''}${chatDropActive ? ' drop-active' : ''}`}
          onClick={() => selectTab('chat')}
          onDragEnter={(event) => {
            if (event.dataTransfer.types.includes(TEXTEX_REFERENCE_MIME)) {
              event.preventDefault()
              setChatDropActive(true)
            }
          }}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes(TEXTEX_REFERENCE_MIME)) {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
            }
          }}
          onDragLeave={(event) => {
            if (
              !(event.relatedTarget instanceof Node) ||
              !event.currentTarget.contains(event.relatedTarget)
            ) {
              setChatDropActive(false)
            }
          }}
          onDrop={dropReferenceOnChat}
        >
          <MessageSquare size={ICON_SIZE.compact} />
          <span className="research-panel-tab-label">{t('researchPanel.tabs.chat')}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="research-tab-references"
          aria-controls="research-tabpanel-references"
          aria-label={t('researchPanel.tabs.references')}
          aria-selected={tab === 'references'}
          title={t('researchPanel.tabs.references')}
          className={tab === 'references' ? 'active' : ''}
          onClick={() => selectTab('references')}
        >
          <BookOpen size={ICON_SIZE.compact} />
          <span className="research-panel-tab-label">{t('researchPanel.tabs.references')}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="research-tab-profile"
          aria-controls="research-tabpanel-profile"
          aria-label={t('researchPanel.tabs.profile')}
          aria-selected={tab === 'profile'}
          title={t('researchPanel.tabs.projectProfile')}
          className={tab === 'profile' ? 'active' : ''}
          onClick={() => selectTab('profile')}
        >
          <Settings2 size={ICON_SIZE.compact} />
          <span className="research-panel-tab-label">{t('researchPanel.tabs.profile')}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="research-tab-problems"
          aria-controls="research-tabpanel-problems"
          aria-label={problemsLabel}
          aria-selected={tab === 'problems'}
          className={`research-panel-problems-tab${tab === 'problems' ? ' active' : ''}`}
          onClick={() => selectTab('problems')}
          title={problemsLabel}
        >
          <ScrollText size={ICON_SIZE.compact} />
          <span className="research-panel-tab-label">{t('logPanel.problems')}</span>
          {problemCount > 0 && (
            <span className="research-panel-tab-badge" aria-hidden="true">
              {problemCount > 99 ? '99+' : problemCount}
            </span>
          )}
        </button>
        <span className="panel-tool-separator" aria-hidden="true" />
        <button
          type="button"
          className="research-panel-close panel-tool-btn"
          onClick={closePanel}
          title={t('researchPanel.close')}
          aria-label={t('researchPanel.close')}
        >
          <PanelRightClose size={ICON_SIZE.compact} />
        </button>
      </div>
      <div className={`research-panel-content${slideAnim ? ` panel-slide-${slideAnim}` : ''}`}>
        {mountedTabs.has('chat') && (
          <div
            id="research-tabpanel-chat"
            className="research-panel-view"
            role="tabpanel"
            aria-labelledby="research-tab-chat"
            hidden={tab !== 'chat'}
          >
            <ResearchChatPanel
              onAiDraft={onAiDraft}
              onCompile={onCompile}
              incomingSelection={
                pendingResearchSelection?.projectRoot === projectRoot
                  ? pendingResearchSelection
                  : null
              }
              onIncomingSelectionConsumed={(token) =>
                useProjectStore.getState().consumeResearchSelection(token)
              }
              incomingReference={
                pendingChatReference?.projectRoot === projectRoot ? pendingChatReference : null
              }
              onIncomingReferenceConsumed={(token) => {
                setPendingChatReference((current) => (current?.token === token ? null : current))
              }}
              incomingPrompt={
                pendingChatPrompt?.projectRoot === projectRoot ? pendingChatPrompt : null
              }
              onIncomingPromptConsumed={(token) => {
                setPendingChatPrompt((current) => (current?.token === token ? null : current))
              }}
            />
          </div>
        )}
        {mountedTabs.has('references') && (
          <div
            id="research-tabpanel-references"
            className="research-panel-view"
            role="tabpanel"
            aria-labelledby="research-tab-references"
            hidden={tab !== 'references'}
          >
            <ReferencesPanel
              onAddToChat={queueChatReference}
              onOpenProblems={() => selectTab('problems')}
            />
          </div>
        )}
        {mountedTabs.has('profile') && (
          <div
            id="research-tabpanel-profile"
            className="research-panel-view"
            role="tabpanel"
            aria-labelledby="research-tab-profile"
            hidden={tab !== 'profile'}
          >
            <ResearchProfilePanel />
          </div>
        )}
        {mountedTabs.has('problems') && (
          <div
            id="research-tabpanel-problems"
            className="research-panel-view"
            role="tabpanel"
            aria-labelledby="research-tab-problems"
            hidden={tab !== 'problems'}
          >
            <LogPanel
              onFixWithChat={queueChatPrompt}
              onFixWithCli={openRepairCli}
              cliName={repairCliName}
            />
          </div>
        )}
      </div>
    </aside>
  )
}
