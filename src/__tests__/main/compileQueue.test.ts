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
})
