import { describe, it, expect, vi } from 'vitest'
import { BrowserWindow } from 'electron'
import { compileLatex } from '../../main/compiler'
import * as sharedCompiler from '../../shared/compiler'

// Mock shared compiler
vi.mock('../../shared/compiler', async () => {
    const actual = await vi.importActual('../../shared/compiler')
    return {
        ...actual,
        compileLatex: vi.fn(),
        getTectonicPath: vi.fn().mockReturnValue('/mock/path/to/tectonic')
    }
})

// Mock logparser
vi.mock('../../main/logparser', () => ({
    parseLatexLog: vi.fn()
}))

// Mock synctex
vi.mock('../../main/synctex', () => ({
    clearSyncTexCache: vi.fn()
}))

// Mock Electron
vi.mock('electron', () => ({
    app: {
        isPackaged: false,
        getPath: vi.fn()
    },
    BrowserWindow: vi.fn()
}))

describe('compileLatex Loop Safeguard', () => {
    it('should not send logs if window is destroyed', async () => {
        const mockWebContents = {
            send: vi.fn()
        }
        const mockWin = {
            isDestroyed: vi.fn().mockReturnValue(true),
            webContents: mockWebContents
        } as unknown as BrowserWindow

        // simulate sharedCompileLatex calling onLog
        const compileSpy = vi.spyOn(sharedCompiler, 'compileLatex').mockImplementation(async (path, opts) => {
            if (opts && opts.onLog) {
                opts.onLog('test log')
            }
            return {
                pdfPath: 'test.pdf',
                logPath: 'test.log',
                status: 'success',
                pdfBase64: 'mockbase64'
            }
        })

        await compileLatex('/test/file.tex', mockWin)

        expect(mockWin.isDestroyed).toHaveBeenCalled()
        expect(mockWebContents.send).not.toHaveBeenCalled()
    })

    it('should send logs if window is NOT destroyed', async () => {
        const mockWebContents = {
            send: vi.fn()
        }
        const mockWin = {
            isDestroyed: vi.fn().mockReturnValue(false),
            webContents: mockWebContents
        } as unknown as BrowserWindow

        // simulate sharedCompileLatex calling onLog
        const compileSpy = vi.spyOn(sharedCompiler, 'compileLatex').mockImplementation(async (path, opts) => {
            if (opts && opts.onLog) {
                opts.onLog('test log')
            }
            return {
                pdfPath: 'test.pdf',
                logPath: 'test.log',
                status: 'success',
                pdfBase64: 'mockbase64'
            }
        })

        await compileLatex('/test/file.tex', mockWin)

        expect(mockWin.isDestroyed).toHaveBeenCalled()
        expect(mockWebContents.send).toHaveBeenCalledWith('latex:log', 'test log')
    })
})
