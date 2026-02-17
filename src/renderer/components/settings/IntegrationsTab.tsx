import React from 'react'
import { useAppStore } from '../../store/useAppStore'
import { Link } from 'lucide-react'
import { Toggle } from './Toggle'

const ZoteroStatusProbe = ({ port }: { port: number }) => {
  const [status, setStatus] = React.useState<'checking' | 'connected' | 'error'>('checking')

  React.useEffect(() => {
    let mounted = true
    const check = async () => {
      setStatus('checking')
      try {
        const connected = await window.api.zoteroProbe(port)
        if (mounted) setStatus(connected ? 'connected' : 'error')
      } catch {
        if (mounted) setStatus('error')
      }
    }
    check()
    const interval = setInterval(check, 5000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [port])

  if (status === 'checking') return <span className="settings-status-text">Checking...</span>
  if (status === 'connected')
    return (
      <span className="settings-status-text connected settings-status-inline">
        <span className="settings-status-dot connected" />
        Connected
      </span>
    )
  return (
    <span className="settings-status-text error settings-status-inline">
      <span className="settings-status-dot error" />
      Disconnected
    </span>
  )
}

export const IntegrationsTab = () => {
  const settings = useAppStore((state) => state.settings)
  const updateSetting = useAppStore((state) => state.updateSetting)

  return (
    <div className="settings-tab-content settings-animate-in">
      <div className="settings-section">
        <div className="settings-section-header">
          <div className="settings-section-icon">
            <Link size={24} />
          </div>
          <div className="settings-section-body">
            <div className="settings-flex-row">
              <h3 className="settings-section-title settings-no-mb">Zotero Integration</h3>
              <Toggle
                checked={settings.zoteroEnabled}
                onChange={(checked) => updateSetting('zoteroEnabled', checked)}
              />
            </div>
            <p className="settings-section-description">
              Connect to Zotero to search and insert citations directly into your LaTeX documents.
              Requires Better BibTeX for Zotero installed.
            </p>

            {settings.zoteroEnabled && (
              <div className="settings-inline-row">
                <div className="settings-inline-label">
                  <label className="settings-label settings-no-mb">Port Number</label>
                  <input
                    type="number"
                    value={settings.zoteroPort}
                    onChange={(e) => updateSetting('zoteroPort', parseInt(e.target.value))}
                    className="settings-input-small"
                  />
                </div>
                <div className="settings-status-badge">
                  <span className="settings-status-label">Status</span>
                  <ZoteroStatusProbe port={settings.zoteroPort} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <hr className="settings-divider" />

      <div className="settings-section">
        <div className="settings-section-header">
          <div className="settings-section-icon">
            <Link size={24} />
          </div>
          <div className="settings-section-body">
            <div className="settings-flex-row">
              <h3 className="settings-section-title settings-no-mb">Git Integration</h3>
              <Toggle
                checked={settings.gitEnabled !== false}
                onChange={(checked) => updateSetting('gitEnabled', checked)}
              />
            </div>
            <p className="settings-section-description">
              Show git panel, branch info, and file status.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
