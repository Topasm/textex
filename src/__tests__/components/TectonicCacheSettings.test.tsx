import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TectonicCacheSettings } from '../../renderer/components/settings/TectonicCacheSettings'
import type { TectonicCacheStatus } from '../../shared/types'

const emptyStatus: TectonicCacheStatus = {
  seed: {
    path: '/app/resources/tectonic-cache',
    fileCount: 0,
    totalBytes: 0,
    ready: false,
    integrity: 'empty',
    seedVersion: 'tectonic-0.17-empty-v1',
    detail: 'This build intentionally ships an empty seed.'
  },
  cache: {
    path: '/user/cache/tectonic',
    fileCount: 0,
    totalBytes: 0,
    ready: false,
    integrity: 'empty',
    installedSeedVersion: null,
    detail: 'The writable cache is empty.'
  },
  cacheUsable: false,
  networkFallback: true
}

describe('TectonicCacheSettings', () => {
  beforeEach(() => {
    vi.mocked(window.api.tectonicCacheStatus).mockReset().mockResolvedValue(emptyStatus)
    vi.mocked(window.api.tectonicCacheReset).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows seed and writable-cache counts, paths, readiness, and the empty-seed warning', async () => {
    render(<TectonicCacheSettings />)

    await waitFor(() => expect(window.api.tectonicCacheStatus).toHaveBeenCalledOnce())
    expect(screen.getByRole('heading', { name: 'Offline compile cache' })).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(
      'This build contains no packaged support files'
    )
    expect(screen.getByText('/app/resources/tectonic-cache')).toBeInTheDocument()
    expect(screen.getByText('/user/cache/tectonic')).toBeInTheDocument()
    expect(screen.getByText(/0 files · 0 B · not ready/)).toBeInTheDocument()
    expect(screen.getByText(/0 files · 0 B · no usable support files/)).toBeInTheDocument()
    expect(screen.getByText(/Network fallback remains enabled/)).toBeInTheDocument()
  })

  it('confirms, resets through the typed API, and renders the rebuilt status', async () => {
    const rebuilt: TectonicCacheStatus = {
      ...emptyStatus,
      cache: {
        ...emptyStatus.cache,
        fileCount: 2,
        totalBytes: 2048,
        ready: true,
        integrity: 'verified',
        installedSeedVersion: 'seed-v1',
        detail: 'Every installed seed file passed SHA-256 verification.'
      },
      cacheUsable: true
    }
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(window.api.tectonicCacheReset).mockResolvedValue(rebuilt)
    render(<TectonicCacheSettings />)
    await screen.findByText('/user/cache/tectonic')

    fireEvent.click(screen.getByRole('button', { name: 'Reset & rebuild' }))

    await waitFor(() => expect(window.api.tectonicCacheReset).toHaveBeenCalledOnce())
    expect(screen.getByText(/2 files · 2 KiB · support files present/)).toBeInTheDocument()
  })
})
