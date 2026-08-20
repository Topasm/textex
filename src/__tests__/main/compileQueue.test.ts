import { describe, it, expect, vi, beforeEach } from 'vitest'
import { enqueueCompile, getActiveCompilePriority } from '../../main/services/compileQueue'

describe('compileQueue background preemption', () => {
  beforeEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  it('preempts an active background compile when a normal compile arrives', async () => {
    let rejectBackground: ((error: Error) => void) | null = null
    const backgroundStarted = vi.fn()
    const normalStarted = vi.fn()
    const cancelActive = vi.fn(() => {
      rejectBackground?.(new Error('Compilation was cancelled'))
    })

    const backgroundPromise = enqueueCompile(
      '/tmp/background.tex',
      async () =>
        await new Promise((_, reject) => {
          backgroundStarted()
          rejectBackground = reject as (error: Error) => void
        }),
      'background'
    )

    expect(getActiveCompilePriority()).toBe('background')

    const normalPromise = enqueueCompile(
      '/tmp/user.tex',
      async () => {
        normalStarted()
        return { pdfPath: '/tmp/user.pdf' }
      },
      'normal',
      cancelActive
    )

    await expect(backgroundPromise).rejects.toThrow('Compilation was cancelled')
    await expect(normalPromise).resolves.toEqual({ pdfPath: '/tmp/user.pdf' })
    expect(cancelActive).toHaveBeenCalledTimes(1)
    expect(normalStarted).toHaveBeenCalledTimes(1)
    expect(backgroundStarted).toHaveBeenCalledTimes(1)
  })

  it('preempts an older active revision and supersedes intermediate queued work', async () => {
    let rejectFirst: ((error: Error) => void) | null = null
    const cancelFirst = vi.fn(() => rejectFirst?.(new Error('Compilation was cancelled')))
    const firstIdentity = { requestId: 1, documentId: '/tmp/main.tex', documentRevision: 1 }
    const secondIdentity = { requestId: 2, documentId: '/tmp/main.tex', documentRevision: 2 }
    const latestIdentity = { requestId: 3, documentId: '/tmp/main.tex', documentRevision: 3 }

    const first = enqueueCompile(
      '/tmp/main.tex',
      () =>
        new Promise((_, reject) => {
          rejectFirst = reject
        }),
      'normal',
      cancelFirst,
      firstIdentity
    )
    const second = enqueueCompile(
      '/tmp/main.tex',
      async () => ({ pdfPath: '/tmp/intermediate.pdf' }),
      'normal',
      undefined,
      secondIdentity
    )
    const secondResult = expect(second).rejects.toThrow('superseded by a newer document revision')
    const latest = enqueueCompile(
      '/tmp/main.tex',
      async () => ({ pdfPath: '/tmp/latest.pdf' }),
      'normal',
      undefined,
      latestIdentity
    )

    await expect(first).rejects.toThrow('Compilation was cancelled')
    await secondResult
    await expect(latest).resolves.toEqual({ pdfPath: '/tmp/latest.pdf' })
    expect(cancelFirst).toHaveBeenCalledTimes(1)
  })
})
