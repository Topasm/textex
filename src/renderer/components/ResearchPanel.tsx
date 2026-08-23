import { useEffect, useRef, useState } from 'react'
import { BookOpen, MessageSquare, PanelRightClose } from 'lucide-react'
import { useProjectStore } from '../store/useProjectStore'
import { ResearchChatPanel } from './research/ResearchChatPanel'
import { ReferencesPanel } from './research/ReferencesPanel'

interface ResearchPanelProps {
  onAiDraft: () => void
}

export function ResearchPanel({ onAiDraft }: ResearchPanelProps) {
  const open = useProjectStore((state) => state.isResearchPanelOpen)
  const tab = useProjectStore((state) => state.researchPanelTab)
  const width = useProjectStore((state) => state.researchPanelWidth)
  const panelRef = useRef<HTMLDivElement>(null)
  const [isOverlay, setIsOverlay] = useState(() => window.innerWidth < 1200)

  useEffect(() => {
    const onResize = () => setIsOverlay(window.innerWidth < 1200)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!open || !isOverlay) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useProjectStore.getState().closeResearchPanel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOverlay, open])

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
          onClick={() => useProjectStore.getState().closeResearchPanel()}
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
            aria-selected={tab === 'chat'}
            className={tab === 'chat' ? 'active' : ''}
            onClick={() => useProjectStore.getState().setResearchPanelTab('chat')}
          >
            <MessageSquare size={14} /> Chat
          </button>
          <button
            role="tab"
            aria-selected={tab === 'references'}
            className={tab === 'references' ? 'active' : ''}
            onClick={() => useProjectStore.getState().setResearchPanelTab('references')}
          >
            <BookOpen size={14} /> References
          </button>
          <button
            className="research-panel-close"
            onClick={() => useProjectStore.getState().closeResearchPanel()}
            title="Close research panel"
            aria-label="Close research panel"
          >
            <PanelRightClose size={15} />
          </button>
        </div>
        <div className="research-panel-content">
          {tab === 'chat' ? <ResearchChatPanel onAiDraft={onAiDraft} /> : <ReferencesPanel />}
        </div>
      </aside>
    </>
  )
}
