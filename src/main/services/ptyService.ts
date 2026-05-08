import { BrowserWindow } from 'electron'
import * as pty from 'node-pty'
import { getCliEnv } from '../utils/cliEnv'

export interface PtyCreateOptions {
  cwd: string
  cols?: number
  rows?: number
  shell?: string
  env?: Record<string, string>
}

interface Session {
  id: string
  proc: pty.IPty
  window: BrowserWindow
}

const sessions = new Map<string, Session>()
let nextId = 1

function defaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe'
  }
  return process.env.SHELL || '/bin/bash'
}

export function createPty(window: BrowserWindow, options: PtyCreateOptions): string {
  const id = `pty-${nextId++}`
  const shell = options.shell || defaultShell()
  const cols = options.cols && options.cols > 0 ? options.cols : 80
  const rows = options.rows && options.rows > 0 ? options.rows : 24

  const proc = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: options.cwd,
    env: getCliEnv({
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      ...(options.env || {})
    }) as { [key: string]: string }
  })

  const session: Session = { id, proc, window }
  sessions.set(id, session)

  proc.onData((data: string) => {
    if (!window.isDestroyed()) {
      window.webContents.send('pty:data', id, data)
    }
  })

  proc.onExit(({ exitCode, signal }) => {
    sessions.delete(id)
    if (!window.isDestroyed()) {
      window.webContents.send('pty:exit', id, exitCode, signal ?? null)
    }
  })

  return id
}

export function writePty(id: string, data: string): void {
  const session = sessions.get(id)
  if (!session) return
  session.proc.write(data)
}

export function resizePty(id: string, cols: number, rows: number): void {
  const session = sessions.get(id)
  if (!session) return
  if (cols > 0 && rows > 0) {
    session.proc.resize(cols, rows)
  }
}

export function disposePty(id: string): void {
  const session = sessions.get(id)
  if (!session) return
  sessions.delete(id)
  try {
    session.proc.kill()
  } catch {
    // ignore
  }
}

export function disposeAllPtys(window?: BrowserWindow): void {
  for (const session of Array.from(sessions.values())) {
    if (!window || session.window === window) {
      try {
        session.proc.kill()
      } catch {
        // ignore
      }
      sessions.delete(session.id)
    }
  }
}
