import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Toggle } from './Toggle';

const DEFAULT_RAINBOW: string[] = [
    '#e06c75', '#e5c07b', '#98c379', '#61afef', '#c678dd', '#56b6c2', '#d19a66'
];

const SectionColorPalette = () => {
    const colors = useAppStore((s) => s.settings.sectionHighlightColors) ?? DEFAULT_RAINBOW;
    const updateSetting = useAppStore((s) => s.updateSetting);

    const setColor = (index: number, value: string) => {
        const next = [...colors];
        next[index] = value;
        updateSetting('sectionHighlightColors', next);
    };

    const removeColor = (index: number) => {
        if (colors.length <= 1) return;
        const next = colors.filter((_, i) => i !== index);
        updateSetting('sectionHighlightColors', next);
    };

    const addColor = () => {
        updateSetting('sectionHighlightColors', [...colors, '#888888']);
    };

    const resetToDefault = () => {
        updateSetting('sectionHighlightColors', [...DEFAULT_RAINBOW]);
    };

    return (
        <div className="sh-palette-editor">
            <div className="sh-palette-label">
                <span>Section Colors</span>
                <button className="sh-palette-reset" onClick={resetToDefault} title="Reset to default rainbow">
                    Reset
                </button>
            </div>
            <div className="sh-palette-swatches">
                {colors.map((color, i) => (
                    <div key={i} className="sh-swatch-wrap">
                        <label className="sh-swatch" style={{ backgroundColor: color }} title={`Color ${i + 1}: ${color}`}>
                            <input
                                type="color"
                                value={color}
                                onChange={(e) => setColor(i, e.target.value)}
                                className="sh-swatch-input"
                            />
                        </label>
                        {colors.length > 1 && (
                            <button className="sh-swatch-remove" onClick={() => removeColor(i)} title="Remove color">
                                {'\u00d7'}
                            </button>
                        )}
                    </div>
                ))}
                <button className="sh-swatch-add" onClick={addColor} title="Add color">+</button>
            </div>
        </div>
    );
};

export const EditorTab = () => {
    const settings = useAppStore((state) => state.settings);
    const updateSetting = useAppStore((state) => state.updateSetting);

    return (
        <div className="settings-tab-content settings-animate-in">
            <div>
                <h3 className="settings-heading">Typography</h3>

                <div style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <label className="settings-label" style={{ marginBottom: 0 }}>Font Size</label>
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

                <div style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <label className="settings-label" style={{ marginBottom: 0 }}>Tab Size</label>
                        <span className="settings-badge">{settings.tabSize ?? 4} spaces</span>
                    </div>
                    <select
                        value={settings.tabSize ?? 4}
                        onChange={(e) => updateSetting('tabSize', parseInt(e.target.value))}
                        className="settings-select"
                        style={{ maxWidth: 120 }}
                    >
                        <option value={2}>2</option>
                        <option value={4}>4</option>
                        <option value={8}>8</option>
                    </select>
                </div>
            </div>

            <hr className="settings-divider" />

            <div>
                <h3 className="settings-heading" style={{ marginBottom: 12 }}>Behavior</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div className="settings-row">
                        <div>
                            <div className="settings-row-label">Word Wrap</div>
                            <div className="settings-row-description">Wrap long lines to fit the visible area</div>
                        </div>
                        <Toggle
                            checked={settings.wordWrap}
                            onChange={(checked) => updateSetting('wordWrap', checked)}
                        />
                    </div>
                    <div className="settings-row">
                        <div>
                            <div className="settings-row-label">Format on Save</div>
                            <div className="settings-row-description">Automatically format functionality code when saving</div>
                        </div>
                        <Toggle
                            checked={settings.formatOnSave}
                            onChange={(checked) => updateSetting('formatOnSave', checked)}
                        />
                    </div>
                    <div className="settings-row">
                        <div>
                            <div className="settings-row-label">Line Numbers</div>
                            <div className="settings-row-description">Show line numbers in the gutter</div>
                        </div>
                        <Toggle
                            checked={settings.lineNumbers !== false}
                            onChange={(checked) => updateSetting('lineNumbers', checked)}
                        />
                    </div>
                    <div className="settings-row">
                        <div>
                            <div className="settings-row-label">Minimap</div>
                            <div className="settings-row-description">Show code minimap on the right side</div>
                        </div>
                        <Toggle
                            checked={!!settings.minimap}
                            onChange={(checked) => updateSetting('minimap', checked)}
                        />
                    </div>
                    <div className="settings-row">
                        <div>
                            <div className="settings-row-label">Vim Mode</div>
                            <div className="settings-row-description">Vim-style keybindings (coming soon)</div>
                        </div>
                        <Toggle
                            checked={false}
                            onChange={() => {}}
                        />
                    </div>
                    <div className="settings-row">
                        <div>
                            <div className="settings-row-label">Auto-hide Sidebar</div>
                            <div className="settings-row-description">Sidebar slides away and reappears on hover</div>
                        </div>
                        <Toggle
                            checked={settings.autoHideSidebar}
                            onChange={(checked) => updateSetting('autoHideSidebar', checked)}
                        />
                    </div>
                    <div className="settings-row">
                        <div>
                            <div className="settings-row-label">Math Preview</div>
                            <div className="settings-row-description">Show interactive MathLive editor when cursor is inside a math expression</div>
                        </div>
                        <Toggle
                            checked={settings.mathPreviewEnabled !== false}
                            onChange={(checked) => updateSetting('mathPreviewEnabled', checked)}
                        />
                    </div>
                    <div className="settings-row">
                        <div>
                            <div className="settings-row-label">Section Highlight</div>
                            <div className="settings-row-description">Show colored bands for each \section in the editor</div>
                        </div>
                        <Toggle
                            checked={settings.sectionHighlightEnabled}
                            onChange={(checked) => updateSetting('sectionHighlightEnabled', checked)}
                        />
                    </div>
                    {settings.sectionHighlightEnabled && (
                        <SectionColorPalette />
                    )}
                </div>
            </div>

            <hr className="settings-divider" />

            <div>
                <h3 className="settings-heading" style={{ marginBottom: 12 }}>Status Bar</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div className="settings-row">
                        <div>
                            <div className="settings-row-label">Show Status Bar</div>
                            <div className="settings-row-description">Show or hide the bottom status bar</div>
                        </div>
                        <Toggle
                            checked={settings.showStatusBar}
                            onChange={(checked) => updateSetting('showStatusBar', checked)}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
