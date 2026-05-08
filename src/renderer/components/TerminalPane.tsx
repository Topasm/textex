import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw, Terminal, X } from 'lucide-react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import { useEditorStore } from '../store/useEditorStore'
import { useProjectStore } from '../store/useProjectStore'
import { useUiStore } from '../store/useUiStore'
import { errorMessage } from '../utils/errorMessage'
import { dirname } from '../utils/path'

function readCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return val || fallback
}

function buildTheme() {
  return {
    background: readCssVar('--bg-primary', '#1e1e1e'),
    foreground: readCssVar('--text-primary', '#d4d4d4'),
    cursor: readCssVar('--accent', '#569cd6'),
    cursorAccent: readCssVar('--bg-primary', '#1e1e1e'),
    selectionBackground: readCssVar('--bg-hover', '#264f78')
  }
}

export function TerminalPane() {
  const projectRoot = useProjectStore((s) => s.projectRoot)
  const filePath = useEditorStore((s) => s.filePath)
  const setTerminalPaneOpen = useUiStore((s) => s.setTerminalPaneOpen)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const dataDisposeRef = useRef<(() => void) | null>(null)
  const exitDisposeRef = useRef<(() => void) | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  const [exited, setExited] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const workDir = useMemo(
    () => projectRoot || (filePath ? dirname(filePath) : ''),
    [filePath, projectRoot]
  )

  const teardown = useCallback(async () => {
    dataDisposeRef.current?.()
    dataDisposeRef.current = null
    exitDisposeRef.current?.()
    exitDisposeRef.current = null
    resizeObserverRef.current?.disconnect()
    resizeObserverRef.current = null
    const id = sessionIdRef.current
    sessionIdRef.current = null
    if (id) {
      try {
        await window.api.ptyDispose(id)
      } catch {
        // PTY may already be gone
      }
    }
    termRef.current?.dispose()
    termRef.current = null
    fitRef.current = null
  }, [])

  const startSession = useCallback(async () => {
    if (!workDir) {
      setErrorMsg('Open a project or file first.')
      return
    }
    if (!containerRef.current) return

    await teardown()
    setExited(false)
    setErrorMsg(null)

    const term = new XTerm({
      cursorBlink: true,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: 13,
      theme: buildTheme(),
      allowProposedApi: true,
      scrollback: 5000,
      convertEol: false
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)

    try {
      const webgl = new WebglAddon()
      // Fall back to DOM renderer if the WebGL context is lost.
      webgl.onContextLoss(() => webgl.dispose())
      term.loadAddon(webgl)
    } catch {
      // WebGL unavailable — DOM renderer is used by default.
    }
    // Let global shortcuts (e.g. Ctrl+`) bubble out of xterm.
    term.attachCustomKeyEventHandler((ev) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key === '`') return false
      return true
    })
    try {
      fit.fit()
    } catch {
      // container not yet sized
    }
    termRef.current = term
    fitRef.current = fit

    try {
      const { id } = await window.api.ptyCreate({
        cwd: workDir,
        cols: term.cols,
        rows: term.rows
      })
      sessionIdRef.current = id

      dataDisposeRef.current = window.api.onPtyData(id, (data) => term.write(data))
      exitDisposeRef.current = window.api.onPtyExit(id, () => setExited(true))

      term.onData((data) => {
        window.api.ptyWrite(id, data).catch(() => {})
      })
      term.onResize(({ cols, rows }) => {
        window.api.ptyResize(id, cols, rows).catch(() => {})
      })

      if (containerRef.current) {
        const ro = new ResizeObserver(() => {
          try {
            fit.fit()
          } catch {
            // ignore
          }
        })
        ro.observe(containerRef.current)
        resizeObserverRef.current = ro
      }

      term.focus()
    } catch (err) {
      setErrorMsg(errorMessage(err))
      await teardown()
    }
  }, [teardown, workDir])

  useEffect(() => {
    if (!workDir || sessionIdRef.current) return
    void startSession()
    return () => {
      void teardown()
    }
  }, [startSession, teardown, workDir])

  useEffect(() => {
    const handler = () => {
      try {
        fitRef.current?.fit()
      } catch {
        // ignore
      }
    }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const restart = useCallback(() => {
    void startSession()
  }, [startSession])

  return (
    <div className="terminal-pane-surface">
      <div className="terminal-pane-header">
        <div className="terminal-pane-title">
          <Terminal size={15} />
          <span>Terminal</span>
          {workDir && <code className="terminal-pane-cwd">{workDir}</code>}
        </div>
        <div className="terminal-pane-header-actions">
          <button
            className="terminal-pane-icon-btn"
            onClick={restart}
            disabled={!workDir}
            title="Restart shell"
            aria-label="Restart shell"
          >
            <RotateCcw size={14} />
          </button>
          <button
            className="terminal-pane-icon-btn"
            onClick={() => setTerminalPaneOpen(false)}
            title="Close terminal pane"
            aria-label="Close terminal pane"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="terminal-pane-warning" role="alert">
          {errorMsg}
        </div>
      )}

      <div className="terminal-pane-xterm" ref={containerRef} />

      {exited && (
        <div className="terminal-pane-exit-bar">
          <span>Shell exited.</span>
          <button onClick={restart}>Restart</button>
        </div>
      )}
    </div>
  )
}
