import { useTranslation } from 'react-i18next'
import { Plus, X } from 'lucide-react'
import { useSettingsStore } from '../../store/useSettingsStore'
import { ICON_SIZE } from '../ui/IconSystem'
import { SettingsSection, SettingsSelect, SettingsToggleRow } from './SettingsControls'

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
                type="button"
                className="sh-swatch-remove"
                onClick={() => removeColor(i)}
                title={t('settings.editor.removeColor')}
                aria-label={t('settings.editor.removeColor')}
              >
                <X size={ICON_SIZE.micro} />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className="sh-swatch-add"
          onClick={addColor}
          title={t('settings.editor.addColor')}
          aria-label={t('settings.editor.addColor')}
        >
          <Plus size={ICON_SIZE.control} />
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
      <SettingsSection title={t('settings.editor.typography')}>
        <div className="settings-field-mt">
          <div className="settings-flex-row-between">
            <label className="settings-label settings-no-mb" htmlFor="editor-font-size">
              {t('settings.editor.fontSize')}
            </label>
            <span className="settings-badge">{settings.fontSize}px</span>
          </div>
          <input
            id="editor-font-size"
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
            <label className="settings-label settings-no-mb" htmlFor="editor-tab-size">
              {t('settings.editor.tabSize')}
            </label>
            <span className="settings-badge">
              {settings.tabSize ?? 4} {t('settings.editor.spaces')}
            </span>
          </div>
          <SettingsSelect
            id="editor-tab-size"
            width="narrow"
            value={settings.tabSize ?? 4}
            onChange={(event) => updateSetting('tabSize', parseInt(event.target.value))}
          >
            <option value={2}>2</option>
            <option value={4}>4</option>
            <option value={8}>8</option>
          </SettingsSelect>
        </div>
      </SettingsSection>

      <SettingsSection title={t('settings.editor.behavior')}>
        <SettingsToggleRow
          label={t('settings.editor.wordWrap')}
          description={t('settings.editor.wordWrapDesc')}
          checked={!!settings.wordWrap}
          onChange={(checked) => updateSetting('wordWrap', checked)}
        />
        <SettingsToggleRow
          label={t('settings.editor.formatOnSave')}
          description={t('settings.editor.formatOnSaveDesc')}
          checked={!!settings.formatOnSave}
          onChange={(checked) => updateSetting('formatOnSave', checked)}
        />
        <SettingsToggleRow
          label={t('settings.editor.lineNumbers')}
          description={t('settings.editor.lineNumbersDesc')}
          checked={settings.lineNumbers !== false}
          onChange={(checked) => updateSetting('lineNumbers', checked)}
        />
        <SettingsToggleRow
          label={t('settings.editor.vimMode')}
          description={t('settings.editor.vimModeDesc')}
          checked={!!settings.vimMode}
          onChange={(checked) => updateSetting('vimMode', checked)}
        />
        <SettingsToggleRow
          label={t('settings.editor.autoHideSidebar')}
          description={t('settings.editor.autoHideSidebarDesc')}
          checked={!!settings.autoHideSidebar}
          onChange={(checked) => updateSetting('autoHideSidebar', checked)}
        />
        <SettingsToggleRow
          label={t('settings.editor.mathPreview')}
          description={t('settings.editor.mathPreviewDesc')}
          checked={settings.mathPreviewEnabled !== false}
          onChange={(checked) => updateSetting('mathPreviewEnabled', checked)}
        />
        <SettingsToggleRow
          label={t('settings.editor.sectionHighlight')}
          description={t('settings.editor.sectionHighlightDesc')}
          checked={!!settings.sectionHighlightEnabled}
          onChange={(checked) => updateSetting('sectionHighlightEnabled', checked)}
        />
        {settings.sectionHighlightEnabled && <SectionColorPalette />}
      </SettingsSection>

      <SettingsSection title={t('settings.editor.advanced')}>
        <SettingsToggleRow
          label={t('settings.editor.bracketPairColorization')}
          description={t('settings.editor.bracketPairColorizationDesc')}
          checked={settings.bracketPairColorization !== false}
          onChange={(checked) => updateSetting('bracketPairColorization', checked)}
        />
        <SettingsToggleRow
          label={t('settings.editor.stickyScroll')}
          description={t('settings.editor.stickyScrollDesc')}
          checked={settings.stickyScrollEnabled !== false}
          onChange={(checked) => updateSetting('stickyScrollEnabled', checked)}
        />
        <SettingsToggleRow
          label={t('settings.editor.smoothScrolling')}
          description={t('settings.editor.smoothScrollingDesc')}
          checked={settings.smoothScrolling !== false}
          onChange={(checked) => updateSetting('smoothScrolling', checked)}
        />
        <SettingsToggleRow
          label={t('settings.editor.fontLigatures')}
          description={t('settings.editor.fontLigaturesDesc')}
          checked={!!settings.fontLigatures}
          onChange={(checked) => updateSetting('fontLigatures', checked)}
        />
        <SettingsToggleRow
          label={t('settings.editor.minimap')}
          description={t('settings.editor.minimapDesc')}
          checked={!!settings.minimapEnabled}
          onChange={(checked) => updateSetting('minimapEnabled', checked)}
        />
      </SettingsSection>

      <SettingsSection title={t('settings.editor.statusBarSection')}>
        <SettingsToggleRow
          label={t('settings.editor.showStatusBar')}
          description={t('settings.editor.showStatusBarDesc')}
          checked={!!settings.showStatusBar}
          onChange={(checked) => updateSetting('showStatusBar', checked)}
        />
      </SettingsSection>
    </div>
  )
}
