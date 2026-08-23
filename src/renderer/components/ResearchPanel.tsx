import { useCallback, useEffect, useRef, useState } from 'react'
import { BookOpen, MessageSquare, PanelRightClose, Settings2 } from 'lucide-react'
import { useProjectStore } from '../store/useProjectStore'
import {
  clearResearchProfileDraft,
  confirmResearchProfileDraftDiscard
} from '../services/researchProfileDraft'
import { ResearchChatPanel } from './research/ResearchChatPanel'
import { ReferencesPanel } from './research/ReferencesPanel'
import { ResearchProfilePanel } from './research/ResearchProfilePanel'

interface ResearchPanelProps {
  onAiDraft: () => void
}

export function ResearchPanel({ onAiDraft }: ResearchPanelProps) {
  const open = useProjectStore((state) => state.isResearchPanelOpen)
  const tab = useProjectStore((state) => state.researchPanelTab)
  const width = useProjectStore((state) => state.researchPanelWidth)
  const panelRef = useRef<HTMLDivElement>(null)
  const [isOverlay, setIsOverlay] = useState(() => window.innerWidth < 1200)

  const leaveProfile = useCallback(() => {
    if (tab !== 'profile') return true
    if (!confirmResearchProfileDraftDiscard()) return false
    clearResearchProfileDraft()
    return true
  }, [tab])

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
    const onResize = () => setIsOverlay(window.innerWidth < 1200)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

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
            className={tab === 'chat' ? 'active' : ''}
            onClick={() => selectTab('chat')}
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
            <ResearchChatPanel onAiDraft={onAiDraft} />
          ) : tab === 'references' ? (
            <ReferencesPanel />
          ) : (
            <ResearchProfilePanel />
          )}
        </div>
      </aside>
    </>
  )
}
