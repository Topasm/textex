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
import { useProjectStore } from '../store/useProjectStore'
import { useNotificationStore } from '../store/useNotificationStore'
import { useUiStore } from '../store/useUiStore'
import { getDesktopCapabilities } from '../platform/capabilities'
import {
  clearResearchProfileDraft,
  confirmResearchProfileDraftDiscard
} from '../services/researchProfileDraft'
import { ResearchChatPanel } from './research/ResearchChatPanel'
import { ReferencesPanel } from './research/ReferencesPanel'
import { ResearchProfilePanel } from './research/ResearchProfilePanel'
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
  const diagnostics = useCompileStore((state) => state.diagnostics)
  const isLogPanelOpen = useCompileStore((state) => state.isLogPanelOpen)
  const isTerminalPaneOpen = useUiStore((state) => state.isTerminalPaneOpen)
  const terminalAvailable = getDesktopCapabilities().pty
  const problemCount = diagnostics.length
  const panelRef = useRef<HTMLDivElement>(null)
  const [isOverlay, setIsOverlay] = useState(() => window.innerWidth < 1200)
  const [chatDropActive, setChatDropActive] = useState(false)
  const [pendingChatReference, setPendingChatReference] = useState<PendingChatReference | null>(
    null
  )
  const nextChatReferenceToken = useRef(0)

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
    (nextTab: 'chat' | 'references' | 'profile') => {
      if (nextTab === tab || !leaveProfile()) return
      useProjectStore.getState().setResearchPanelTab(nextTab)
    },
    [leaveProfile, tab]
  )

  useEffect(() => {
    if (!open) return
    const onResize = () => setIsOverlay(window.innerWidth < 1200)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open])

  useEffect(() => {
    if (!open || !isOverlay) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePanel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closePanel, isOverlay, open])

  if (!open) return null

  const startResize = (event: React.MouseEvent) => {
    event.preventDefault()
    const right = panelRef.current?.getBoundingClientRect().right ?? window.innerWidth
    const move = (moveEvent: MouseEvent) => {
      useProjectStore.getState().setResearchPanelWidth(right - moveEvent.clientX)
    }
    const up = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <>
      {isOverlay && (
        <button
          className="research-panel-backdrop"
          aria-label="Close research panel"
          onClick={closePanel}
        />
      )}
      <aside
        ref={panelRef}
        className={`research-panel${isOverlay ? ' overlay' : ''}`}
        style={{ width }}
        aria-label="Research panel"
      >
        <div className="research-resize-handle" onMouseDown={startResize} />
        <div className="research-panel-tabs" role="tablist">
          <button
            role="tab"
            id="research-tab-chat"
            aria-controls="research-tabpanel"
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
            <MessageSquare size={14} /> Chat
          </button>
          <button
            role="tab"
            id="research-tab-references"
            aria-controls="research-tabpanel"
            aria-selected={tab === 'references'}
            className={tab === 'references' ? 'active' : ''}
            onClick={() => selectTab('references')}
          >
            <BookOpen size={14} /> References
          </button>
          <button
            role="tab"
            id="research-tab-profile"
            aria-controls="research-tabpanel"
            aria-selected={tab === 'profile'}
            className={tab === 'profile' ? 'active' : ''}
            onClick={() => selectTab('profile')}
          >
            <Settings2 size={14} /> Profile
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
            type="button"
            className={`research-panel-tool-btn${isLogPanelOpen ? ' active' : ''}`}
            onClick={() => useCompileStore.getState().toggleLogPanel()}
            title={t('toolbar.toggleLog')}
            aria-label={t('toolbar.toggleLog')}
            aria-pressed={isLogPanelOpen}
          >
            <ScrollText size={14} />
            {problemCount > 0 && (
              <span className="research-panel-tool-badge" aria-hidden="true">
                {problemCount > 99 ? '99+' : problemCount}
              </span>
            )}
          </button>
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
              incomingReference={
                pendingChatReference?.projectRoot === projectRoot ? pendingChatReference : null
              }
              onIncomingReferenceConsumed={(token) => {
                setPendingChatReference((current) => (current?.token === token ? null : current))
              }}
            />
          ) : tab === 'references' ? (
            <ReferencesPanel onAddToChat={queueChatReference} />
          ) : (
            <ResearchProfilePanel />
          )}
        </div>
      </aside>
    </>
  )
}
