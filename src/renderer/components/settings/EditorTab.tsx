import React from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../store/useSettingsStore'
import { Toggle } from './Toggle'

const DEFAULT_RAINBOW: string[] = [
  '#e06c75',
  '#e5c07b',
  '#98c379',
  '#61afef',
  '#c678dd',
  '#56b6c2',
  '#d19a66'
]

const SectionColorPalette = () => {
  const { t } = useTranslation()
  const colors = useSettingsStore((s) => s.settings.sectionHighlightColors) ?? DEFAULT_RAINBOW
  const updateSetting = useSettingsStore((s) => s.updateSetting)

  const setColor = (index: number, value: string) => {
    const next = [...colors]
    next[index] = value
    updateSetting('sectionHighlightColors', next)
  }

  const removeColor = (index: number) => {
    if (colors.length <= 1) return
    const next = colors.filter((_, i) => i !== index)
    updateSetting('sectionHighlightColors', next)
  }

  const addColor = () => {
    updateSetting('sectionHighlightColors', [...colors, '#888888'])
  }

  const resetToDefault = () => {
    updateSetting('sectionHighlightColors', [...DEFAULT_RAINBOW])
  }

  return (
    <div className="sh-palette-editor">
      <div className="sh-palette-label">
        <span>{t('settings.editor.sectionColors')}</span>
        <button
          className="sh-palette-reset"
          onClick={resetToDefault}
          title={t('settings.editor.resetColorsTitle')}
        >
          {t('settings.editor.resetColors')}
        </button>
      </div>
      <div className="sh-palette-swatches">
        {colors.map((color, i) => (
          <div key={i} className="sh-swatch-wrap">
            <label
              className="sh-swatch"
              style={{ backgroundColor: color }}
              title={`Color ${i + 1}: ${color}`}
            >
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(i, e.target.value)}
                className="sh-swatch-input"
              />
            </label>
            {colors.length > 1 && (
              <button
                className="sh-swatch-remove"
                onClick={() => removeColor(i)}
                title={t('settings.editor.removeColor')}
              >
                {'\u00d7'}
              </button>
            )}
          </div>
        ))}
        <button className="sh-swatch-add" onClick={addColor} title={t('settings.editor.addColor')}>
          +
        </button>
      </div>
    </div>
  )
}

export const EditorTab = () => {
  const { t } = useTranslation()
  const settings = useSettingsStore((state) => state.settings)
  const updateSetting = useSettingsStore((state) => state.updateSetting)

  return (
    <div className="settings-tab-content settings-animate-in">
      <div>
        <h3 className="settings-heading">{t('settings.editor.typography')}</h3>

        <div className="settings-field-mt">
          <div className="settings-flex-row-between">
            <label className="settings-label settings-no-mb">{t('settings.editor.fontSize')}</label>
            <span className="settings-badge">{settings.fontSize}px</span>
          </div>
          <input
            type="range"
            min="10"
            max="32"
            step="1"
            value={settings.fontSize}
            onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))}
            className="settings-range"
          />
          <div className="settings-range-labels">
            <span>10px</span>
            <span>32px</span>
          </div>
        </div>

        <div className="settings-field-mt">
          <div className="settings-flex-row-between">
            <label className="settings-label settings-no-mb">{t('settings.editor.tabSize')}</label>
            <span className="settings-badge">{settings.tabSize ?? 4} {t('settings.editor.spaces')}</span>
          </div>
          <select
            value={settings.tabSize ?? 4}
            onChange={(e) => updateSetting('tabSize', parseInt(e.target.value))}
            className="settings-select settings-select-narrow"
          >
            <option value={2}>2</option>
            <option value={4}>4</option>
            <option value={8}>8</option>
          </select>
        </div>
      </div>

      <hr className="settings-divider" />

      <div>
        <h3 className="settings-heading settings-heading-mb">{t('settings.editor.behavior')}</h3>
        <div className="settings-column-group">
          <div className="settings-row">
            <div>
              <div className="settings-row-label">{t('settings.editor.wordWrap')}</div>
              <div className="settings-row-description">
                {t('settings.editor.wordWrapDesc')}
              </div>
            </div>
            <Toggle
              checked={!!settings.wordWrap}
              onChange={(checked) => updateSetting('wordWrap', checked)}
            />
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-row-label">{t('settings.editor.formatOnSave')}</div>
              <div className="settings-row-description">
                {t('settings.editor.formatOnSaveDesc')}
              </div>
            </div>
            <Toggle
              checked={!!settings.formatOnSave}
              onChange={(checked) => updateSetting('formatOnSave', checked)}
            />
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-row-label">{t('settings.editor.lineNumbers')}</div>
              <div className="settings-row-description">{t('settings.editor.lineNumbersDesc')}</div>
            </div>
            <Toggle
              checked={settings.lineNumbers !== false}
              onChange={(checked) => updateSetting('lineNumbers', checked)}
            />
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-row-label">{t('settings.editor.minimap')}</div>
              <div className="settings-row-description">{t('settings.editor.minimapDesc')}</div>
            </div>
            <Toggle
              checked={!!settings.minimap}
              onChange={(checked) => updateSetting('minimap', checked)}
            />
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-row-label">{t('settings.editor.vimMode')}</div>
              <div className="settings-row-description">{t('settings.editor.vimModeDesc')}</div>
            </div>
            <Toggle
              checked={!!settings.vimMode}
              onChange={(checked) => updateSetting('vimMode', checked)}
            />
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-row-label">{t('settings.editor.autoHideSidebar')}</div>
              <div className="settings-row-description">
                {t('settings.editor.autoHideSidebarDesc')}
              </div>
            </div>
            <Toggle
              checked={!!settings.autoHideSidebar}
              onChange={(checked) => updateSetting('autoHideSidebar', checked)}
            />
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-row-label">{t('settings.editor.mathPreview')}</div>
              <div className="settings-row-description">
                {t('settings.editor.mathPreviewDesc')}
              </div>
            </div>
            <Toggle
              checked={settings.mathPreviewEnabled !== false}
              onChange={(checked) => updateSetting('mathPreviewEnabled', checked)}
            />
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-row-label">{t('settings.editor.sectionHighlight')}</div>
              <div className="settings-row-description">
                {t('settings.editor.sectionHighlightDesc')}
              </div>
            </div>
            <Toggle
              checked={!!settings.sectionHighlightEnabled}
              onChange={(checked) => updateSetting('sectionHighlightEnabled', checked)}
            />
          </div>
          {settings.sectionHighlightEnabled && <SectionColorPalette />}
        </div>
      </div>

      <hr className="settings-divider" />

      <div>
        <h3 className="settings-heading settings-heading-mb">{t('settings.editor.statusBarSection')}</h3>
        <div className="settings-column-group">
          <div className="settings-row">
            <div>
              <div className="settings-row-label">{t('settings.editor.showStatusBar')}</div>
              <div className="settings-row-description">{t('settings.editor.showStatusBarDesc')}</div>
            </div>
            <Toggle
              checked={!!settings.showStatusBar}
              onChange={(checked) => updateSetting('showStatusBar', checked)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
