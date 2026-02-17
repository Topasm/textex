import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import path from 'path'

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
    const projectRoot = useAppStore((s) => s.projectRoot)
    const [lines, setLines] = useState<TodoLine[]>([])
    const [rawContent, setRawContent] = useState('')
    const [exists, setExists] = useState(true)
    const [loading, setLoading] = useState(true)

    const filePath = projectRoot ? path.join(projectRoot, 'TODO.md') : null

    const loadFile = useCallback(async () => {
        if (!filePath) return
        setLoading(true)
        try {
            const result = await window.api.readFile(filePath)
            setRawContent(result.content)
            setLines(parseMarkdown(result.content))
            setExists(true)
        } catch {
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
            } catch {
                // rollback on error
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
        } catch {
            // ignore
        }
    }, [filePath])

    if (!projectRoot) {
        return (
            <div className="todo-panel todo-panel--empty">
                <p>Open a project to use TODO</p>
            </div>
        )
    }

    if (loading) {
        return <div className="todo-panel todo-panel--empty"><p>Loading…</p></div>
    }

    if (!exists) {
        return (
            <div className="todo-panel todo-panel--empty">
                <button className="panel-create-icon-btn" onClick={handleCreate} title="Create TODO.md">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                </button>
                <p>Create TODO.md</p>
            </div>
        )
    }

    return (
        <div className="todo-panel">
            {lines.map((line, idx) => {
                if (line.type === 'blank') return <div key={idx} className="todo-panel__blank" />

                if (line.type === 'header') {
                    const lvl = line.level || 1
                    const cls = "todo-panel__header"
                    if (lvl === 1) return <h1 key={idx} className={cls}>{line.label}</h1>
                    if (lvl === 2) return <h2 key={idx} className={cls}>{line.label}</h2>
                    if (lvl === 3) return <h3 key={idx} className={cls}>{line.label}</h3>
                    if (lvl === 4) return <h4 key={idx} className={cls}>{line.label}</h4>
                    if (lvl === 5) return <h5 key={idx} className={cls}>{line.label}</h5>
                    return <h6 key={idx} className={cls}>{line.label}</h6>
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
                        <label key={idx} className={`todo-panel__item${line.checked ? ' todo-panel__item--done' : ''}`}>
                            <input
                                type="checkbox"
                                checked={line.checked}
                                onChange={() => toggleCheckbox(idx)}
                            />
                            <span>{line.label}</span>
                        </label>
                    )
                }

                // Plain text
                return (
                    <p key={idx} className="todo-panel__text">
                        {line.label}
                    </p>
                )
            })}
        </div>
    )
}
