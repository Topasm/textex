import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BookOpen,
  MessageSquare,
  PanelRightClose,
  ScrollText,
  Settings2,
  SquareTerminal
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCompileStore } from '../store/useCompileStore'
import { useProjectStore, type ResearchPanelTab } from '../store/useProjectStore'
import { useNotificationStore } from '../store/useNotificationStore'
import { useUiStore } from '../store/useUiStore'
import { useResearchPanelResize } from '../hooks/useResearchPanelResize'
import { getDesktopCapabilities } from '../platform/capabilities'
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

interface ResearchPanelProps {
  onAiDraft: () => void
}

export interface PendingChatReference {
  token: number
  projectRoot: string
  payload: ReferenceDragPayload
}

export function ResearchPanel({ onAiDraft }: ResearchPanelProps) {
  const { t } = useTranslation()
  const open = useProjectStore((state) => state.isResearchPanelOpen)
  const tab = useProjectStore((state) => state.researchPanelTab)
  const width = useProjectStore((state) => state.researchPanelWidth)
  const projectRoot = useProjectStore((state) => state.projectRoot)
  const pendingResearchSelection = useProjectStore((state) => state.pendingResearchSelection)
  const diagnostics = useCompileStore((state) => state.diagnostics)
  const isTerminalPaneOpen = useUiStore((state) => state.isTerminalPaneOpen)
  const terminalAvailable = getDesktopCapabilities().pty
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
  const nextChatReferenceToken = useRef(0)
  const startResize = useResearchPanelResize(panelRef, open)

  useEffect(() => {
    setChatDropActive(false)
    setPendingChatReference(null)
  }, [projectRoot])

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
    if (leaveProfile()) useProjectStore.getState().closeResearchPanel()
  }, [leaveProfile])

  const selectTab = useCallback(
    (nextTab: ResearchPanelTab) => {
      if (nextTab === tab || !leaveProfile()) return
      useProjectStore.getState().setResearchPanelTab(nextTab)
    },
    [leaveProfile, tab]
  )

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

  if (!open) return null

  return (
    <aside
      ref={panelRef}
      className="research-panel overlay"
      style={{ width }}
      aria-label="Research panel"
    >
      <div className="research-resize-handle" onMouseDown={startResize} />
      <div className="research-panel-tabs" role="tablist">
        <button
          role="tab"
          id="research-tab-chat"
          aria-controls="research-tabpanel"
          aria-label="Chat"
          aria-selected={tab === 'chat'}
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
          <MessageSquare size={14} />
          <span className="research-panel-tab-label">Chat</span>
        </button>
        <button
          role="tab"
          id="research-tab-references"
          aria-controls="research-tabpanel"
          aria-label="References"
          aria-selected={tab === 'references'}
          className={tab === 'references' ? 'active' : ''}
          onClick={() => selectTab('references')}
        >
          <BookOpen size={14} />
          <span className="research-panel-tab-label">References</span>
        </button>
        <button
          role="tab"
          id="research-tab-profile"
          aria-controls="research-tabpanel"
          aria-label="Profile"
          aria-selected={tab === 'profile'}
          className={tab === 'profile' ? 'active' : ''}
          onClick={() => selectTab('profile')}
        >
          <Settings2 size={14} />
          <span className="research-panel-tab-label">Profile</span>
        </button>
        <button
          role="tab"
          id="research-tab-problems"
          aria-controls="research-tabpanel"
          aria-label={problemsLabel}
          aria-selected={tab === 'problems'}
          className={`research-panel-problems-tab${tab === 'problems' ? ' active' : ''}`}
          onClick={() => selectTab('problems')}
          title={problemsLabel}
        >
          <ScrollText size={14} />
          <span className="research-panel-tab-label">{t('logPanel.problems')}</span>
          {problemCount > 0 && (
            <span className="research-panel-tab-badge" aria-hidden="true">
              {problemCount > 99 ? '99+' : problemCount}
            </span>
          )}
        </button>
        <span className="research-panel-tool-separator" aria-hidden="true" />
        {terminalAvailable && (
          <button
            type="button"
            className={`research-panel-tool-btn${isTerminalPaneOpen ? ' active' : ''}`}
            onClick={() => useUiStore.getState().toggleTerminalPane()}
            title={t('toolbar.terminalPane')}
            aria-label={t('toolbar.terminalPane')}
            aria-pressed={isTerminalPaneOpen}
          >
            <SquareTerminal size={14} />
          </button>
        )}
        <button
          className="research-panel-close"
          onClick={closePanel}
          title="Close research panel"
          aria-label="Close research panel"
        >
          <PanelRightClose size={15} />
        </button>
      </div>
      <div
        id="research-tabpanel"
        className="research-panel-content"
        role="tabpanel"
        aria-labelledby={`research-tab-${tab}`}
      >
        {tab === 'chat' ? (
          <ResearchChatPanel
            onAiDraft={onAiDraft}
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
          />
        ) : tab === 'references' ? (
          <ReferencesPanel onAddToChat={queueChatReference} />
        ) : tab === 'profile' ? (
          <ResearchProfilePanel />
        ) : (
          <LogPanel />
        )}
      </div>
    </aside>
  )
}
