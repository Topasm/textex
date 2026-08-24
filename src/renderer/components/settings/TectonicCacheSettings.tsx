import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TectonicCacheStatus } from '../../../shared/types'

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KiB', 'MiB', 'GiB']
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** unit
  return `${value.toLocaleString(undefined, { maximumFractionDigits: unit === 0 ? 0 : 1 })} ${units[unit]}`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function TectonicCacheSettings() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<TectonicCacheStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)

  const refresh = useCallback(async () => {
    const request = ++generation.current
    setLoading(true)
    setError('')
    try {
      const next = await window.api.tectonicCacheStatus()
      if (generation.current === request) setStatus(next)
    } catch (cause) {
      if (generation.current === request) setError(errorMessage(cause))
    } finally {
      if (generation.current === request) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    return () => {
      generation.current += 1
    }
  }, [refresh])

  const resetCache = async (): Promise<void> => {
    if (!window.confirm(t('settings.automation.cacheResetConfirm'))) return
    const request = ++generation.current
    setResetting(true)
    setError('')
    try {
      const next = await window.api.tectonicCacheReset()
      if (generation.current === request) setStatus(next)
    } catch (cause) {
      if (generation.current === request) setError(errorMessage(cause))
    } finally {
      if (generation.current === request) setResetting(false)
    }
  }

  const seedIsEmpty = status?.seed.integrity === 'empty' || status?.seed.integrity === 'missing'

  return (
    <section aria-labelledby="tectonic-cache-heading" aria-busy={loading || resetting}>
      <h3 id="tectonic-cache-heading" className="settings-heading settings-heading-mb">
        {t('settings.automation.offlineCache')}
      </h3>
      <p className="settings-row-description" style={{ marginBottom: 12 }}>
        {t('settings.automation.offlineCacheDesc')}
      </p>

      {(loading || resetting) && (
        <div role="status" aria-live="polite" className="settings-row-description">
          {resetting
            ? t('settings.automation.cacheResetting')
            : t('settings.automation.cacheLoading')}
        </div>
      )}
      {error && (
        <div role="alert" className="settings-row-description" style={{ color: 'var(--error)' }}>
          {t('settings.automation.cacheError', { error })}
        </div>
      )}

      {status && (
        <div className="settings-column-group">
          {seedIsEmpty && (
            <div role="note" className="settings-row-description">
              {t('settings.automation.emptySeedWarning')}
            </div>
          )}
          <div className="settings-row" style={{ alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <div className="settings-row-label">
                {t('settings.automation.packagedSeed')}
                {status.seed.seedVersion ? ` · ${status.seed.seedVersion}` : ''}
              </div>
              <div className="settings-row-description">
                {t('settings.automation.cacheStats', {
                  files: status.seed.fileCount,
                  bytes: formatBytes(status.seed.totalBytes)
                })}{' '}
                ·{' '}
                {status.seed.ready
                  ? t('settings.automation.cacheReady')
                  : t('settings.automation.cacheNotReady')}
              </div>
              <div className="settings-row-description">{status.seed.detail}</div>
              <code className="settings-row-description" style={{ wordBreak: 'break-all' }}>
                {status.seed.path}
              </code>
            </div>
          </div>
          <div className="settings-row" style={{ alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <div className="settings-row-label">
                {t('settings.automation.writableCache')}
                {status.cache.installedSeedVersion ? ` · ${status.cache.installedSeedVersion}` : ''}
              </div>
              <div className="settings-row-description">
                {t('settings.automation.cacheStats', {
                  files: status.cache.fileCount,
                  bytes: formatBytes(status.cache.totalBytes)
                })}{' '}
                ·{' '}
                {status.cache.ready
                  ? t('settings.automation.cacheFilesAvailable')
                  : t('settings.automation.cacheFilesUnavailable')}
              </div>
              <div className="settings-row-description">{status.cache.detail}</div>
              <code className="settings-row-description" style={{ wordBreak: 'break-all' }}>
                {status.cache.path}
              </code>
            </div>
          </div>
          {status.networkFallback && (
            <div className="settings-row-description">
              {t('settings.automation.networkFallback')}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => void refresh()} disabled={loading || resetting}>
              {t('settings.automation.cacheRecheck')}
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => void resetCache()}
              disabled={loading || resetting}
            >
              {t('settings.automation.cacheReset')}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
