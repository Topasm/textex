import React from 'react'
import { formatDistanceToNow } from 'date-fns'
import { HistoryItem } from '../../shared/types'
import './HistoryPanel.css' // We'll create this

interface Props {
  historyItems: HistoryItem[]
  onSelect: (item: HistoryItem) => void
  onClose: () => void
}

export const HistoryPanel: React.FC<Props> = ({ historyItems, onSelect, onClose }) => {
  return (
    <div className="history-panel">
      <div className="history-header">
        <h3>Local History</h3>
        <button onClick={onClose} className="close-btn">
          ×
        </button>
      </div>
      <div className="history-list">
        {historyItems.length === 0 ? (
          <div className="history-empty">No history available</div>
        ) : (
          historyItems.map((item) => (
            <div key={item.timestamp} className="history-item" onClick={() => onSelect(item)}>
              <div className="history-time">
                {formatDistanceToNow(item.timestamp, { addSuffix: true })}
              </div>
              <div className="history-details">
                <span className="history-size">{(item.size / 1024).toFixed(1)} KB</span>
                <span className="history-date">{new Date(item.timestamp).toLocaleString()}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
