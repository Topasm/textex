import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/useAppStore'
import { logError } from '../utils/errorMessage'

interface TodoLine {
  raw: string
  type: 'checkbox' | 'header' | 'blockquote' | 'text' | 'blank'
  level?: number // header level or indent
  checked?: boolean
  label?: string
}

function parseLine(raw: string): TodoLine {
  // Blank
  if (raw.trim() === '') return { raw, type: 'blank' }

  // Headers
  const headerMatch = raw.match(/^(#{1,6})\s+(.*)/)
  if (headerMatch) {
    return { raw, type: 'header', level: headerMatch[1].length, label: headerMatch[2] }
  }

  // Blockquote
  if (raw.trimStart().startsWith('>')) {
    return { raw, type: 'blockquote', label: raw.replace(/^\s*>\s?/, '') }
  }

  // Checkbox items:  - [ ] , - [x] , - [/]
  const cbMatch = raw.match(/^(\s*[-*])\s+\[([ xX/])\]\s+(.*)/)
  if (cbMatch) {
    const checked = cbMatch[2].toLowerCase() === 'x'
    return { raw, type: 'checkbox', checked, label: cbMatch[3] }
  }

  return { raw, type: 'text', label: raw }
}

function parseMarkdown(content: string): TodoLine[] {
  return content.split('\n').map(parseLine)
}

export function TodoPanel() {
  const { t } = useTranslation()
  const projectRoot = useAppStore((s) => s.projectRoot)
  const [lines, setLines] = useState<TodoLine[]>([])
  const [rawContent, setRawContent] = useState('')
  const [newItem, setNewItem] = useState('')
  const [exists, setExists] = useState(true)
  const [loading, setLoading] = useState(true)

  const filePath = projectRoot ? `${projectRoot}/TODO.md` : null

  const loadFile = useCallback(async () => {
    if (!filePath) return
    setLoading(true)
    try {
      const result = await window.api.readFile(filePath)
      setRawContent(result.content)
      setLines(parseMarkdown(result.content))
      setExists(true)
    } catch (err) {
      logError('TodoPanel:load', err)
      setExists(false)
      setRawContent('')
      setLines([])
    }
    setLoading(false)
  }, [filePath])

  useEffect(() => {
    loadFile()
  }, [loadFile])

  const toggleCheckbox = useCallback(
    async (lineIdx: number) => {
      if (!filePath) return
      const rawLines = rawContent.split('\n')
      const line = rawLines[lineIdx]
      if (!line) return

      let newLine: string
      if (/\[x\]/i.test(line)) {
        newLine = line.replace(/\[x\]/i, '[ ]')
      } else if (/\[ \]/.test(line)) {
        newLine = line.replace('[ ]', '[x]')
      } else if (/\[\/\]/.test(line)) {
        newLine = line.replace('[/]', '[x]')
      } else {
        return
      }

      rawLines[lineIdx] = newLine
      const updated = rawLines.join('\n')
      setRawContent(updated)
      setLines(parseMarkdown(updated))

      try {
        await window.api.saveFile(updated, filePath)
      } catch (err) {
        // rollback on error
        logError('TodoPanel:toggle', err)
        setRawContent(rawContent)
        setLines(parseMarkdown(rawContent))
      }
    },
    [filePath, rawContent]
  )

  const handleCreate = useCallback(async () => {
    if (!filePath) return
    const initial = '# TODO\n\n- [ ] First task\n'
    try {
      await window.api.saveFile(initial, filePath)
      setRawContent(initial)
      setLines(parseMarkdown(initial))
      setExists(true)
    } catch (err) {
      logError('TodoPanel:create', err)
    }
  }, [filePath])

  const handleAddItem = useCallback(async () => {
    if (!newItem.trim() || !filePath) return

    const lineToAdd = `- [ ] ${newItem.trim()}`
    const prefix = rawContent && !rawContent.endsWith('\n') ? '\n' : ''
    const updated = rawContent + prefix + lineToAdd + '\n'

    setRawContent(updated)
    setLines(parseMarkdown(updated))
    setNewItem('')

    try {
      await window.api.saveFile(updated, filePath)
    } catch (err) {
      logError('TodoPanel:addItem', err)
      // rollback or silent fail
    }
  }, [newItem, filePath, rawContent])

  const handleAddMemo = useCallback(async () => {
    if (!newItem.trim() || !filePath) return

    const lineToAdd = newItem.trim()
    const prefix = rawContent && !rawContent.endsWith('\n') ? '\n' : ''
    const updated = rawContent + prefix + lineToAdd + '\n'

    setRawContent(updated)
    setLines(parseMarkdown(updated))
    setNewItem('')

    try {
      await window.api.saveFile(updated, filePath)
    } catch (err) {
      logError('TodoPanel:addMemo', err)
      // rollback or silent fail
    }
  }, [newItem, filePath, rawContent])

  const handleDelete = useCallback(
    async (lineIdx: number) => {
      if (!filePath) return
      const rawLines = rawContent.split('\n')
      if (lineIdx < 0 || lineIdx >= rawLines.length) return

      rawLines.splice(lineIdx, 1)
      const updated = rawLines.join('\n')

      setRawContent(updated)
      setLines(parseMarkdown(updated))

      try {
        await window.api.saveFile(updated, filePath)
      } catch (err) {
        // rollback
        logError('TodoPanel:delete', err)
        setRawContent(rawContent)
        setLines(parseMarkdown(rawContent))
      }
    },
    [filePath, rawContent]
  )

  if (!projectRoot) {
    return (
      <div className="todo-panel todo-panel--empty">
        <p>{t('todoPanel.openProject')}</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="todo-panel todo-panel--empty">
        <p>{t('todoPanel.loading')}</p>
      </div>
    )
  }

  if (!exists) {
    return (
      <div className="todo-panel todo-panel--empty">
        <button className="panel-create-icon-btn" onClick={handleCreate} title={t('todoPanel.createTodo')}>
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <p>{t('todoPanel.createTodo')}</p>
      </div>
    )
  }

  return (
    <div className="todo-panel">
      {lines.map((line, idx) => {
        if (line.type === 'blank') return <div key={idx} className="todo-panel__blank" />

        if (line.type === 'header') {
          const lvl = line.level || 1
          const cls = 'todo-panel__header'
          if (lvl === 1)
            return (
              <h1 key={idx} className={cls}>
                {line.label}
              </h1>
            )
          if (lvl === 2)
            return (
              <h2 key={idx} className={cls}>
                {line.label}
              </h2>
            )
          if (lvl === 3)
            return (
              <h3 key={idx} className={cls}>
                {line.label}
              </h3>
            )
          if (lvl === 4)
            return (
              <h4 key={idx} className={cls}>
                {line.label}
              </h4>
            )
          if (lvl === 5)
            return (
              <h5 key={idx} className={cls}>
                {line.label}
              </h5>
            )
          return (
            <h6 key={idx} className={cls}>
              {line.label}
            </h6>
          )
        }
        if (line.type === 'blockquote') {
          return (
            <blockquote key={idx} className="todo-panel__blockquote">
              {line.label}
            </blockquote>
          )
        }

        if (line.type === 'checkbox') {
          return (
            <div
              key={idx}
              className={`todo-panel__item${line.checked ? ' todo-panel__item--done' : ''}`}
            >
              <input type="checkbox" checked={line.checked} onChange={() => toggleCheckbox(idx)} />
              <span onClick={() => toggleCheckbox(idx)} style={{ flex: 1 }}>
                {line.label}
              </span>
              <button
                className="todo-panel__item-delete"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(idx)
                }}
                title={t('todoPanel.deleteItem')}
                aria-label={t('todoPanel.deleteItem')}
              >
                ×
              </button>
            </div>
          )
        }

        return (
          <div key={idx} className="todo-panel__item">
            <p className="todo-panel__text" style={{ flex: 1 }}>
              {line.label}
            </p>
            <button
              className="todo-panel__item-delete"
              onClick={(e) => {
                e.stopPropagation()
                handleDelete(idx)
              }}
              title={t('todoPanel.deleteLine')}
              aria-label={t('todoPanel.deleteLine')}
            >
              ×
            </button>
          </div>
        )
      })}

      <div className="todo-panel__input-row">
        <input
          type="text"
          className="todo-panel__input"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.shiftKey) {
              e.preventDefault()
              handleAddItem()
            } else if (e.key === 'Enter') {
              handleAddMemo()
            }
          }}
          placeholder={t('todoPanel.inputPlaceholder')}
        />
        <button className="todo-panel__add-btn" onClick={handleAddItem}>
          {t('todoPanel.add')}
        </button>
      </div>
    </div>
  )
}
