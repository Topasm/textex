import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  compileLatex: vi.fn(),
  cancelCompilation: vi.fn(),
  readFile: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle },
  BrowserWindow: class {}
}))

vi.mock('fs/promises', () => ({
  default: { readFile: mocks.readFile }
}))

vi.mock('../../main/compiler', () => ({
  compileLatex: mocks.compileLatex,
  cancelCompilation: mocks.cancelCompilation
}))

import { registerCompilerHandlers } from '../../main/ipc/compiler'

describe('compiler IPC', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.readFile.mockResolvedValue('\\documentclass{article}')
    mocks.compileLatex.mockResolvedValue({ pdfPath: '/project/main.pdf' })
  })

  it('validates and echoes the document revision identity', async () => {
    const window = { id: 1 }
    registerCompilerHandlers(() => window as never)
    const handler = mocks.handle.mock.calls.find(([channel]) => channel === 'latex:compile')?.[1]
    const request = {
      filePath: '/project/main.tex',
      requestId: 7,
      documentId: '/project/main.tex',
      documentRevision: 42,
      priority: 'normal' as const
    }

    await expect(handler({}, request)).resolves.toEqual({
      requestId: 7,
      documentId: '/project/main.tex',
      documentRevision: 42,
      compiledFilePath: '/project/main.tex',
      pdfPath: '/project/main.pdf'
    })
    expect(mocks.compileLatex).toHaveBeenCalledWith('/project/main.tex', window, 'normal', request)
  })

  it('rejects malformed revision identities before compiling', async () => {
    registerCompilerHandlers(() => ({}) as never)
    const handler = mocks.handle.mock.calls.find(([channel]) => channel === 'latex:compile')?.[1]

    await expect(
      handler(
        {},
        {
          filePath: '/project/main.tex',
          requestId: 0,
          documentId: '/project/main.tex',
          documentRevision: -1,
          priority: 'normal'
        }
      )
    ).rejects.toThrow('Invalid compile request id')
    expect(mocks.compileLatex).not.toHaveBeenCalled()
  })
})
