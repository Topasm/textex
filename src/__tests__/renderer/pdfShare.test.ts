import { afterEach, describe, expect, it, vi } from 'vitest'
import { sharePdf } from '../../renderer/platform/pdfShare'

afterEach(() => vi.unstubAllGlobals())

describe('PDF file sharing', () => {
  it('passes a PDF file to system sharing', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { canShare: () => true, share })
    expect(await sharePdf(new Uint8Array([37, 80, 68, 70]), 'paper.pdf')).toBe('shared')
    const file = share.mock.calls[0][0].files[0] as File
    expect(file.name).toBe('paper.pdf')
    expect(file.type).toBe('application/pdf')
    expect(file.size).toBe(4)
  })

  it('falls back when file sharing is unavailable', async () => {
    vi.stubGlobal('navigator', {})
    expect(await sharePdf(new Uint8Array(), 'paper.pdf')).toBe('unsupported')
    const share = vi.fn()
    vi.stubGlobal('navigator', { canShare: () => false, share })
    expect(await sharePdf(new Uint8Array(), 'paper.pdf')).toBe('unsupported')
    expect(share).not.toHaveBeenCalled()
  })

  it.each([
    ['AbortError', 'cancelled'],
    ['NotAllowedError', 'unsupported'],
    ['NotSupportedError', 'unsupported']
  ])('handles %s as %s', async (name, result) => {
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: vi.fn().mockRejectedValue(new DOMException('share failed', name))
    })
    expect(await sharePdf(new Uint8Array(), 'paper.pdf')).toBe(result)
  })

  it('surfaces transfer errors', async () => {
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: vi.fn().mockRejectedValue(new DOMException('transfer failed', 'DataError'))
    })
    await expect(sharePdf(new Uint8Array(), 'paper.pdf')).rejects.toThrow('transfer failed')
  })
})
