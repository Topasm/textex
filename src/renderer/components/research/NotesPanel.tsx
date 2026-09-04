import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { logError } from '../../utils/errorMessage'
import { ICON_SIZE } from '../ui/IconSystem'
import { renderInline } from '../ui/MarkdownText'
import { describeNativeError } from '../../services/nativeErrors'

/**
 * A freeform Markdown notepad, saved to `TODO.md` at the project root.
 *
 * Live-renders line by line, Typora/Obsidian-style: the line the cursor is
 * in shows its raw Markdown source in an editable field; every other line
 * shows its formatted result. Moving to another line (click, Enter, arrow
 * keys) re-renders the line you left — no separate edit/preview mode to
 * toggle. Checkboxes (`- [ ]`) still toggle by clicking them while rendered.
 */

const SAVE_DEBOUNCE_MS = 500

type LineKind = 'checkbox' | 'header' | 'blockquote' | 'text' | 'blank'

interface ParsedLine {
  kind: LineKind
  level?: number
  checked?: boolean
  label?: string
}

function parseLine(raw: string): ParsedLine {
  if (raw.trim() === '') return { kind: 'blank' }

  const headerMatch = /^(#{1,6})\s+(.*)/u.exec(raw)
  if (headerMatch) return { kind: 'header', level: headerMatch[1].length, label: headerMatch[2] }

  if (raw.trimStart().startsWith('>')) {
    return { kind: 'blockquote', label: raw.replace(/^\s*>\s?/u, '') }
  }

  const checkboxMatch = /^(\s*[-*])\s+\[([ xX/])\]\s+(.*)/u.exec(raw)
  if (checkboxMatch) {
    return {
      kind: 'checkbox',
      checked: checkboxMatch[2].toLowerCase() === 'x',
      label: checkboxMatch[3]
    }
  }

  return { kind: 'text', label: raw }
}

const HEADER_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const

export function NotesPanel() {
  const { t } = useTranslation()
  const projectRoot = useProjectStore((s) => s.projectRoot)
  const [lines, setLines] = useState<string[]>([])
  const [exists, setExists] = useState(true)
  const [loading, setLoading] = useState(true)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [loadedProjectRoot, setLoadedProjectRoot] = useState<string | null>(null)
  const [loadError, setLoadError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)

  const linesRef = useRef<string[]>([])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeFieldRef = useRef<HTMLTextAreaElement | null>(null)
  const pendingFocus = useRef<{ index: number; caret: number } | null>(null)
  const activeFilePath = useRef<string | null>(null)
  const loadGeneration = useRef(0)
  const pendingSaves = useRef(new Map<string, string>())
  const saveInFlight = useRef(false)

  useEffect(() => {
    linesRef.current = lines
  }, [lines])

  const drainSaves = useCallback(async () => {
    if (saveInFlight.current) return
    saveInFlight.current = true
    try {
      while (pendingSaves.current.size > 0) {
        const next = pendingSaves.current.entries().next().value as [string, string] | undefined
        if (!next) break
        const [path, content] = next
        pendingSaves.current.delete(path)
        try {
          await window.api.saveFile(content, path)
        } catch (err) {
          logError('NotesPanel:save', err)
        }
      }
    } finally {
      saveInFlight.current = false
    }
  }, [])

  const enqueueSave = useCallback(
    (path: string, content: string) => {
      pendingSaves.current.set(path, content)
      void drainSaves()
    },
    [drainSaves]
  )

  const scheduleSave = useCallback(
    (next: string[]) => {
      const path = activeFilePath.current
      if (!path) return
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null
        enqueueSave(path, next.join('\n'))
      }, SAVE_DEBOUNCE_MS)
    },
    [enqueueSave]
  )

  useEffect(() => {
    const generation = ++loadGeneration.current
    setLoading(true)
    setLoadedProjectRoot(null)
    setLoadError('')
    setActiveIndex(null)
    activeFilePath.current = null
    if (!projectRoot) return
    const root = projectRoot
    const separator = root.includes('\\') ? '\\' : '/'
    const defaultPath = `${root.replace(/[\\/]$/, '')}${separator}TODO.md`

    void window.api
      .readDirectory(root)
      .then(async (entries) => {
        if (generation !== loadGeneration.current) return
        const existing = entries.find(
          (entry) => entry.type === 'file' && entry.name.toLocaleLowerCase('en-US') === 'todo.md'
        )
        if (!existing) {
          activeFilePath.current = defaultPath
          setExists(false)
          setLines([])
          linesRef.current = []
          return
        }
        activeFilePath.current = existing.path
        const result = await window.api.readFile(existing.path)
        if (generation !== loadGeneration.current) return
        const next = result.content.split('\n')
        setLines(next)
        linesRef.current = next
        setExists(true)
      })
      .catch((err) => {
        if (generation !== loadGeneration.current) return
        logError('NotesPanel:load', err)
        // A directory/read failure is not proof that TODO.md is absent. Keep
        // the panel in a safe non-editable state instead of offering overwrite.
        activeFilePath.current = null
        setLoadError(describeNativeError(err))
        setExists(true)
        setLines([])
        linesRef.current = []
      })
      .finally(() => {
        if (generation !== loadGeneration.current) return
        setLoadedProjectRoot(root)
        setLoading(false)
      })

    return () => {
      if (loadGeneration.current === generation) loadGeneration.current += 1
    }
  }, [projectRoot, reloadToken])

  // Flush a pending debounced save immediately when the panel unmounts or
  // the project changes, so the last keystrokes are never silently dropped.
  useEffect(() => {
    const path = activeFilePath.current
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        saveTimer.current = null
        if (path) enqueueSave(path, linesRef.current.join('\n'))
      }
    }
  }, [enqueueSave, loadedProjectRoot])

  useEffect(() => {
    if (!pendingFocus.current || pendingFocus.current.index !== activeIndex) return
    const { caret } = pendingFocus.current
    pendingFocus.current = null
    const field = activeFieldRef.current
    if (!field) return
    field.focus()
    const position = Math.min(caret, field.value.length)
    field.setSelectionRange(position, position)
  }, [activeIndex, lines])

  const activateLine = useCallback((index: number, caret = Number.MAX_SAFE_INTEGER) => {
    pendingFocus.current = { index, caret }
    setActiveIndex(index)
  }, [])

  const handleCreate = useCallback(async () => {
    const filePath = activeFilePath.current
    if (!filePath) return
    const initial = ['# Notes', '', '']
    try {
      await window.api.saveFile(initial.join('\n'), filePath)
      setLines(initial)
      linesRef.current = initial
      setExists(true)
      activateLine(2, 0)
    } catch (err) {
      logError('NotesPanel:create', err)
    }
  }, [activateLine])

  const addLineAtEnd = useCallback(() => {
    setLines((current) => {
      const next = [...current, '']
      scheduleSave(next)
      activateLine(next.length - 1, 0)
      return next
    })
  }, [activateLine, scheduleSave])

  const updateLine = useCallback(
    (index: number, value: string) => {
      setLines((current) => {
        if (current[index] === value) return current
        const next = [...current]
        next[index] = value
        scheduleSave(next)
        return next
      })
    },
    [scheduleSave]
  )

  const toggleCheckbox = useCallback(
    (index: number) => {
      setLines((current) => {
        const line = current[index]
        if (line === undefined) return current
        let nextLine: string
        if (/\[x\]/iu.test(line)) nextLine = line.replace(/\[x\]/iu, '[ ]')
        else if (/\[ \]/u.test(line)) nextLine = line.replace('[ ]', '[x]')
        else if (/\[\/\]/u.test(line)) nextLine = line.replace('[/]', '[x]')
        else return current
        const next = [...current]
        next[index] = nextLine
        scheduleSave(next)
        return next
      })
    },
    [scheduleSave]
  )

  const deleteLine = useCallback(
    (index: number) => {
      setLines((current) => {
        if (current.length <= 1) {
          const next = ['']
          scheduleSave(next)
          return next
        }
        const next = [...current]
        next.splice(index, 1)
        scheduleSave(next)
        return next
      })
    },
    [scheduleSave]
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>, index: number) => {
      const field = event.currentTarget

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        const currentLine = field.value
        // Continue an unfinished checkbox/bullet line automatically, and
        // stop continuing once Enter is pressed on an already-empty one.
        const checkboxMatch = /^(\s*[-*])\s+\[[ xX/]\]\s*$/u.exec(currentLine)
        const checkboxPrefix = /^(\s*[-*])\s+\[[ xX/]\]\s+/u.exec(currentLine)
        const bulletMatch = /^(\s*[-*])\s*$/u.exec(currentLine)
        const bulletPrefix = !checkboxPrefix && /^(\s*[-*])\s+/u.exec(currentLine)

        let insertion = ''
        let clearCurrent = false
        if (checkboxMatch) clearCurrent = true
        else if (checkboxPrefix) insertion = `${checkboxPrefix[1]} [ ] `
        else if (bulletMatch) clearCurrent = true
        else if (bulletPrefix) insertion = `${bulletPrefix[1]} `

        setLines((current) => {
          const next = [...current]
          if (clearCurrent) next[index] = ''
          next.splice(index + 1, 0, insertion)
          scheduleSave(next)
          return next
        })
        activateLine(index + 1, insertion.length)
        return
      }

      if (event.key === 'Backspace' && field.selectionStart === 0 && field.selectionEnd === 0) {
        if (index === 0) return
        event.preventDefault()
        const prevLine = linesRef.current[index - 1] ?? ''
        const mergeCaret = prevLine.length
        setLines((current) => {
          const next = [...current]
          next[index - 1] = prevLine + (current[index] ?? '')
          next.splice(index, 1)
          scheduleSave(next)
          return next
        })
        activateLine(index - 1, mergeCaret)
        return
      }

      if (event.key === 'ArrowUp' && field.selectionStart === 0) {
        if (index === 0) return
        event.preventDefault()
        activateLine(index - 1, 0)
        return
      }

      if (event.key === 'ArrowDown' && field.selectionStart === field.value.length) {
        if (index >= linesRef.current.length - 1) return
        event.preventDefault()
        activateLine(index + 1, field.value.length)
        return
      }

      if (event.key === 'Escape') {
        setActiveIndex(null)
      }
    },
    [activateLine, scheduleSave]
  )

  if (!projectRoot) {
    return (
      <div className="notes-panel notes-panel--empty">
        <p>{t('notesPanel.openProject')}</p>
      </div>
    )
  }

  if (loading || loadedProjectRoot !== projectRoot) {
    return (
      <div className="notes-panel notes-panel--empty">
        <p>{t('notesPanel.loading')}</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="notes-panel notes-panel--empty">
        <p>{loadError}</p>
        <button type="button" onClick={() => setReloadToken((current) => current + 1)}>
          {t('notifications.retry')}
        </button>
      </div>
    )
  }

  if (!exists) {
    return (
      <div className="notes-panel notes-panel--empty">
        <button
          type="button"
          className="panel-create-icon-btn"
          onClick={() => void handleCreate()}
          title={t('notesPanel.create')}
          aria-label={t('notesPanel.create')}
        >
          <Plus size={ICON_SIZE.emptyState} />
        </button>
        <p>{t('notesPanel.create')}</p>
      </div>
    )
  }

  return (
    <div className="notes-panel">
      {lines.map((raw, index) => {
        if (activeIndex === index) {
          return (
            <AutoGrowLine
              key={index}
              ref={index === activeIndex ? activeFieldRef : undefined}
              value={raw}
              onChange={(value) => updateLine(index, value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              onBlur={() => setActiveIndex((current) => (current === index ? null : current))}
            />
          )
        }

        const parsed = parseLine(raw)
        const key = `line-${index}`

        if (parsed.kind === 'blank') {
          return (
            <div
              key={index}
              className="notes-panel__blank"
              onClick={() => activateLine(index)}
              role="presentation"
            />
          )
        }

        if (parsed.kind === 'header') {
          const Tag = HEADER_TAGS[(parsed.level ?? 1) - 1]
          return (
            <Tag key={index} className="notes-panel__header" onClick={() => activateLine(index)}>
              {renderInline(parsed.label ?? '', key)}
            </Tag>
          )
        }

        if (parsed.kind === 'blockquote') {
          return (
            <blockquote
              key={index}
              className="notes-panel__blockquote"
              onClick={() => activateLine(index)}
            >
              {renderInline(parsed.label ?? '', key)}
            </blockquote>
          )
        }

        if (parsed.kind === 'checkbox') {
          return (
            <div
              key={index}
              className={`notes-panel__item${parsed.checked ? ' notes-panel__item--done' : ''}`}
            >
              <input
                type="checkbox"
                checked={parsed.checked}
                onChange={() => toggleCheckbox(index)}
              />
              <span className="notes-panel__item-label" onClick={() => activateLine(index)}>
                {renderInline(parsed.label ?? '', key)}
              </span>
            </div>
          )
        }

        return (
          <p key={index} className="notes-panel__text" onClick={() => activateLine(index)}>
            {renderInline(parsed.label ?? '', key)}
          </p>
        )
      })}

      <button type="button" className="notes-panel__add-line" onClick={addLineAtEnd}>
        <Plus size={ICON_SIZE.micro} aria-hidden="true" />
        {t('notesPanel.addLine')}
      </button>

      <button
        type="button"
        className="notes-panel__delete-active"
        hidden={activeIndex === null || (linesRef.current[activeIndex ?? -1] ?? '').trim() !== ''}
        onClick={() => activeIndex !== null && deleteLine(activeIndex)}
      >
        {t('notesPanel.deleteLine')}
      </button>
    </div>
  )
}

interface AutoGrowLineProps {
  value: string
  onChange: (value: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onBlur: () => void
  ref?: React.Ref<HTMLTextAreaElement>
}

/** A single-line, auto-resizing textarea used for the line under edit. */
function AutoGrowLine({ value, onChange, onKeyDown, onBlur, ref }: AutoGrowLineProps) {
  const localRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const el = localRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={(node) => {
        localRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node
      }}
      className="notes-panel__line-input"
      rows={1}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      autoFocus
    />
  )
}
