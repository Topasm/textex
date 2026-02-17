import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'

export function MemoPanel() {
    const projectRoot = useAppStore((s) => s.projectRoot)
    const [content, setContent] = useState('')
    const [exists, setExists] = useState(true)
    const [loading, setLoading] = useState(true)
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    const filePath = projectRoot ? `${projectRoot}/memo.md` : null

    const loadFile = useCallback(async () => {
        if (!filePath) return
        setLoading(true)
        try {
            const result = await window.api.readFile(filePath)
            setContent(result.content)
            setExists(true)
        } catch {
            setExists(false)
            setContent('')
        }
        setLoading(false)
    }, [filePath])

    useEffect(() => {
        loadFile()
    }, [loadFile])

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        }
    }, [])

    const saveContent = useCallback(
        async (text: string) => {
            if (!filePath) return
            try {
                await window.api.saveFile(text, filePath)
            } catch {
                // ignore
            }
        },
        [filePath]
    )

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            const val = e.target.value
            setContent(val)
            setExists(true)

            // Debounce auto-save (1s)
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
            saveTimerRef.current = setTimeout(() => {
                saveContent(val)
            }, 1000)
        },
        [saveContent]
    )

    const handleBlur = useCallback(() => {
        // Save immediately on blur
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        if (filePath && exists) {
            saveContent(content)
        }
    }, [content, exists, filePath, saveContent])

    const handleCreate = useCallback(async () => {
        if (!filePath) return
        const initial = '# Memo\n\n'
        try {
            await window.api.saveFile(initial, filePath)
            setContent(initial)
            setExists(true)
        } catch {
            // ignore
        }
    }, [filePath])

    if (!projectRoot) {
        return (
            <div className="memo-panel memo-panel--empty">
                <p>Open a project to use Memo</p>
            </div>
        )
    }

    if (loading) {
        return <div className="memo-panel memo-panel--empty"><p>Loading…</p></div>
    }

    if (!exists) {
        return (
            <div className="memo-panel memo-panel--empty">
                <button className="panel-create-icon-btn" onClick={handleCreate} title="Create memo.md">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                </button>
                <p>Create memo.md</p>
            </div>
        )
    }

    return (
        <div className="memo-panel">
            <textarea
                className="memo-panel__textarea"
                value={content}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="Write your notes here…"
                spellCheck={false}
            />
        </div>
    )
}
