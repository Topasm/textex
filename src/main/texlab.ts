import { app } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'

export type TexLabStatus = 'stopped' | 'starting' | 'running' | 'error'

interface TexLabCallbacks {
  onMessage: (message: object) => void
  onStatusChange: (status: TexLabStatus, error?: string) => void
}

const isDev = !app.isPackaged

const MAX_RETRIES = 3
const RETRY_DELAYS = [1000, 2000, 4000]

function getDefaultTexLabPath(): string {
  const platform = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'
  const binary = process.platform === 'win32' ? 'texlab.exe' : 'texlab'

  if (isDev) {
    return path.join(process.cwd(), 'resources', 'bin', platform, binary)
  }
  return path.join(process.resourcesPath, 'bin', binary)
}

function findTexLabBinary(customPath: string): string {
  // 1. Custom user path
  if (customPath && fs.existsSync(customPath)) {
    return customPath
  }

  // 2. Bundled binary
  const bundled = getDefaultTexLabPath()
  if (fs.existsSync(bundled)) {
    return bundled
  }

  // 3. Fallback to system PATH
  return 'texlab'
}

class TexLabManager {
  private process: ChildProcess | null = null
  private status: TexLabStatus = 'stopped'
  private callbacks: TexLabCallbacks | null = null
  private workspaceRoot: string | null = null
  private customPath = ''
  private retryCount = 0
  private stdoutBuffer = ''

  getStatus(): TexLabStatus {
    return this.status
  }

  setCustomPath(customPath: string): void {
    this.customPath = customPath
  }

  start(workspaceRoot: string, callbacks: TexLabCallbacks): void {
    if (this.process) {
      this.stop()
    }

    this.callbacks = callbacks
    this.workspaceRoot = workspaceRoot
    this.retryCount = 0
    this.spawn()
  }

  private spawn(): void {
    if (!this.callbacks || !this.workspaceRoot) return

    const binaryPath = findTexLabBinary(this.customPath)
    this.setStatus('starting')
    this.stdoutBuffer = ''

    try {
      this.process = spawn(binaryPath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: this.workspaceRoot
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.setStatus('error', `Failed to spawn TexLab: ${message}`)
      return
    }

    this.process.on('error', (err) => {
      this.setStatus('error', `TexLab error: ${err.message}`)
      this.process = null
      this.maybeRestart()
    })

    this.process.on('exit', (code, signal) => {
      if (this.status === 'stopped') return // intentional stop
      this.process = null
      if (code !== 0) {
        this.setStatus('error', `TexLab exited with code ${code}, signal ${signal}`)
        this.maybeRestart()
      }
    })

    this.process.stdout!.on('data', (chunk: Buffer) => {
      this.stdoutBuffer += chunk.toString('utf-8')
      this.parseMessages()
    })

    this.process.stderr!.on('data', (chunk: Buffer) => {
      // TexLab logs to stderr — ignore but don't crash
      const text = chunk.toString('utf-8').trim()
      if (text) {
        // Could be useful for debugging, but we don't surface it
      }
    })

    // If process started successfully, mark as running after a tick
    // The actual "running" status is confirmed when we receive the initialize response
    this.setStatus('running')
  }

  send(message: object): void {
    if (!this.process || !this.process.stdin || this.process.stdin.destroyed) {
      return
    }

    const json = JSON.stringify(message)
    const header = `Content-Length: ${Buffer.byteLength(json, 'utf-8')}\r\n\r\n`
    try {
      this.process.stdin.write(header + json)
    } catch {
      // stdin closed
    }
  }

  stop(): void {
    this.setStatus('stopped')
    this.callbacks = null
    this.workspaceRoot = null
    this.retryCount = 0
    this.stdoutBuffer = ''

    if (this.process) {
      try {
        this.process.kill()
      } catch {
        // already dead
      }
      this.process = null
    }
  }

  private parseMessages(): void {
    while (true) {
      const headerEnd = this.stdoutBuffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) break

      const headerPart = this.stdoutBuffer.substring(0, headerEnd)
      const match = headerPart.match(/Content-Length:\s*(\d+)/i)
      if (!match) {
        // Malformed header — skip past it
        this.stdoutBuffer = this.stdoutBuffer.substring(headerEnd + 4)
        continue
      }

      const contentLength = parseInt(match[1], 10)
      const bodyStart = headerEnd + 4
      const available = Buffer.byteLength(this.stdoutBuffer.substring(bodyStart), 'utf-8')

      if (available < contentLength) break // wait for more data

      // Extract exactly contentLength bytes
      const bodyBytes = Buffer.from(this.stdoutBuffer.substring(bodyStart), 'utf-8')
      const body = bodyBytes.subarray(0, contentLength).toString('utf-8')
      const consumed = bodyStart + Buffer.from(body, 'utf-8').toString().length
      this.stdoutBuffer = this.stdoutBuffer.substring(consumed)

      try {
        const parsed = JSON.parse(body)
        this.callbacks?.onMessage(parsed)
      } catch {
        // malformed JSON — skip
      }
    }
  }

  private setStatus(status: TexLabStatus, error?: string): void {
    this.status = status
    this.callbacks?.onStatusChange(status, error)
  }

  private maybeRestart(): void {
    if (this.status === 'stopped' || !this.callbacks || !this.workspaceRoot) return
    if (this.retryCount >= MAX_RETRIES) {
      this.setStatus('error', `TexLab failed after ${MAX_RETRIES} retries`)
      return
    }

    const delay = RETRY_DELAYS[this.retryCount] || 4000
    this.retryCount++
    setTimeout(() => {
      if (this.status !== 'stopped' && this.callbacks && this.workspaceRoot) {
        this.spawn()
      }
    }, delay)
  }
}

export const texLabManager = new TexLabManager()
