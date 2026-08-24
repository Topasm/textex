import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  FormatterWorkerRequest,
  FormatterWorkerResponse
} from '../../renderer/utils/formatterWorkerProtocol'

const { prettierFormatMock } = vi.hoisted(() => ({
  prettierFormatMock: vi.fn()
}))

vi.mock('prettier/standalone', () => ({
  format: (...args: unknown[]) => prettierFormatMock(...args)
}))

vi.mock('prettier-plugin-latex', () => ({
  parsers: {},
  printers: {}
}))

class FakeFormatterWorker {
  static instances: FakeFormatterWorker[] = []

  readonly messages: FormatterWorkerRequest[] = []
  readonly terminate = vi.fn()
  onmessage: ((event: MessageEvent<FormatterWorkerResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: ((event: MessageEvent) => void) | null = null

  constructor() {
    FakeFormatterWorker.instances.push(this)
  }

  postMessage(message: FormatterWorkerRequest): void {
    this.messages.push(message)
  }

  respond(response: FormatterWorkerResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<FormatterWorkerResponse>)
  }

  fail(): void {
    this.onerror?.(new ErrorEvent('error'))
  }
}

describe('formatLatex', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    FakeFormatterWorker.instances = []
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lazy-loads the direct formatter when workers are unavailable', async () => {
    vi.stubGlobal('Worker', undefined)
    prettierFormatMock.mockResolvedValue('formatted')
    const { formatLatex } = await import('../../renderer/utils/formatter')

    await expect(formatLatex('source', { printWidth: 100 })).resolves.toBe('formatted')
    expect(prettierFormatMock).toHaveBeenCalledWith(
      'source',
      expect.objectContaining({
        parser: 'latex-parser',
        printWidth: 100,
        tabWidth: 2,
        useTabs: false
      })
    )
  })

  it('reuses one worker and resolves matching requests without loading the fallback', async () => {
    vi.stubGlobal('Worker', FakeFormatterWorker)
    const { formatLatex } = await import('../../renderer/utils/formatter')

    const firstResult = formatLatex('first')
    const worker = FakeFormatterWorker.instances[0]
    expect(worker.messages).toEqual([
      expect.objectContaining({ type: 'format', requestId: 1, code: 'first' })
    ])
    worker.respond({ type: 'format-result', requestId: 1, formatted: 'FIRST' })
    await expect(firstResult).resolves.toBe('FIRST')

    const secondResult = formatLatex('second')
    expect(FakeFormatterWorker.instances).toHaveLength(1)
    worker.respond({ type: 'format-result', requestId: 2, formatted: 'SECOND' })
    await expect(secondResult).resolves.toBe('SECOND')
    expect(prettierFormatMock).not.toHaveBeenCalled()
  })

  it('cleans up a failed request, falls back directly, and keeps a healthy worker reusable', async () => {
    vi.stubGlobal('Worker', FakeFormatterWorker)
    prettierFormatMock.mockResolvedValue('direct fallback')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { formatLatex } = await import('../../renderer/utils/formatter')

    const failedResult = formatLatex('invalid')
    const worker = FakeFormatterWorker.instances[0]
    worker.respond({ type: 'format-error', requestId: 1, message: 'parse error' })
    await expect(failedResult).resolves.toBe('direct fallback')

    const nextResult = formatLatex('valid')
    worker.respond({ type: 'format-result', requestId: 2, formatted: 'VALID' })
    await expect(nextResult).resolves.toBe('VALID')
    expect(FakeFormatterWorker.instances).toHaveLength(1)
  })

  it('rejects every pending request on a fatal worker error and disables the worker', async () => {
    vi.stubGlobal('Worker', FakeFormatterWorker)
    prettierFormatMock.mockImplementation(async (code: string) => `direct:${code}`)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { formatLatex } = await import('../../renderer/utils/formatter')

    const firstResult = formatLatex('first')
    const secondResult = formatLatex('second')
    const worker = FakeFormatterWorker.instances[0]
    worker.fail()

    await expect(firstResult).resolves.toBe('direct:first')
    await expect(secondResult).resolves.toBe('direct:second')
    expect(worker.terminate).toHaveBeenCalledOnce()

    await expect(formatLatex('third')).resolves.toBe('direct:third')
    expect(FakeFormatterWorker.instances).toHaveLength(1)
  })

  it('returns the original source when both worker and direct formatting fail', async () => {
    vi.stubGlobal('Worker', undefined)
    prettierFormatMock.mockRejectedValue(new Error('parse error'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { formatLatex } = await import('../../renderer/utils/formatter')

    await expect(formatLatex('unchanged source')).resolves.toBe('unchanged source')
  })
})
