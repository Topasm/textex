import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../../store/useAppStore'
import type { HistoryItem } from '../../../shared/types'

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

  // Load history items when panel opens
  useEffect(() => {
    if (showHistory) {
      const activeFilePath = useAppStore.getState().activeFilePath
      if (activeFilePath) {
        window.api.getHistoryList(activeFilePath).then(setHistoryItems)
      }
    }
  }, [showHistory])

  const handleSelectHistoryItem = useCallback(async (item: HistoryItem) => {
    try {
      const content = await window.api.loadHistorySnapshot(item.path)
      setSnapshotContent(content)
      setHistoryMode(true)
    } catch (err) {
      console.error(err)
      alert('Failed to load snapshot')
    }
  }, [])

  const closeHistory = useCallback(() => {
    setShowHistory(false)
    setHistoryMode(false)
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
