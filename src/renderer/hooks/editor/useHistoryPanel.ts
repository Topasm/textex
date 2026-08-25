import { useState, useEffect, useCallback, useRef } from 'react'
import { useEditorStore } from '../../store/useEditorStore'
import { useNotificationStore } from '../../store/useNotificationStore'
import type { HistoryItem } from '../../../shared/types'
import { errorMessage } from '../../utils/errorMessage'

export interface HistoryPanelState {
  showHistory: boolean
  setShowHistory: React.Dispatch<React.SetStateAction<boolean>>
  historyItems: HistoryItem[]
  snapshotContent: string
  historyMode: boolean
  setHistoryMode: React.Dispatch<React.SetStateAction<boolean>>
  handleSelectHistoryItem: (item: HistoryItem) => Promise<void>
  closeHistory: () => void
}

export function useHistoryPanel(): HistoryPanelState {
  const [showHistory, setShowHistory] = useState(false)
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([])
  const [snapshotContent, setSnapshotContent] = useState('')
  const [historyMode, setHistoryMode] = useState(false)
  const activeFilePath = useEditorStore((state) => state.activeFilePath)
  const requestGeneration = useRef(0)

  // Load history items when panel opens
  useEffect(() => {
    const generation = ++requestGeneration.current
    setSnapshotContent('')
    setHistoryMode(false)
    if (!showHistory || !activeFilePath) {
      setHistoryItems([])
      return
    }
    setHistoryItems([])
    window.api
      .getHistoryList(activeFilePath)
      .then((items) => {
        if (
          requestGeneration.current === generation &&
          useEditorStore.getState().activeFilePath === activeFilePath
        ) {
          setHistoryItems(items)
        }
      })
      .catch((error) => {
        if (requestGeneration.current !== generation) return
        setHistoryItems([])
        useNotificationStore.getState().pushNotification({
          tone: 'error',
          message: `Could not load document history: ${errorMessage(error)}`
        })
      })
  }, [activeFilePath, showHistory])

  const handleSelectHistoryItem = useCallback(
    async (item: HistoryItem) => {
      if (!activeFilePath) return
      const generation = ++requestGeneration.current
      try {
        const content = await window.api.loadHistorySnapshot(activeFilePath, item.path)
        if (
          requestGeneration.current !== generation ||
          useEditorStore.getState().activeFilePath !== activeFilePath
        ) {
          return
        }
        setSnapshotContent(content)
        setHistoryMode(true)
      } catch (error) {
        if (requestGeneration.current !== generation) return
        useNotificationStore.getState().pushNotification({
          tone: 'error',
          message: `Could not load history snapshot: ${errorMessage(error)}`
        })
      }
    },
    [activeFilePath]
  )

  const closeHistory = useCallback(() => {
    requestGeneration.current += 1
    setShowHistory(false)
    setHistoryMode(false)
    setSnapshotContent('')
  }, [])

  return {
    showHistory,
    setShowHistory,
    historyItems,
    snapshotContent,
    historyMode,
    setHistoryMode,
    handleSelectHistoryItem,
    closeHistory
  }
}
