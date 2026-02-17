import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Toggle } from './Toggle';

export const AutomationTab = () => {
    const settings = useAppStore((state) => state.settings);
    const updateSetting = useAppStore((state) => state.updateSetting);

    return (
        <div className="settings-tab-content settings-animate-in">
            <div>
                <h3 className="settings-heading settings-heading-mb">Compiler &amp; Tools</h3>
                <div className="settings-column-group">
                    <div className="settings-row">
                        <div>
                            <div className="settings-row-label">Auto Compile</div>
                            <div className="settings-row-description">Automatically compile when saving via shortcuts</div>
                        </div>
                        <Toggle
                            checked={settings.autoCompile}
                            onChange={(checked) => updateSetting('autoCompile', checked)}
                        />
                    </div>
                    <div className="settings-row">
                        <div>
                            <div className="settings-row-label">Spell Check</div>
                            <div className="settings-row-description">Highlight misspelled words while typing</div>
                        </div>
                        <Toggle
                            checked={settings.spellCheckEnabled}
                            onChange={(checked) => updateSetting('spellCheckEnabled', checked)}
                        />
                    </div>
                    {settings.spellCheckEnabled && (
                        <div className="settings-spellcheck-sub">
                            <label className="settings-label">Language</label>
                            <select
                                value={settings.spellCheckLanguage ?? 'en-US'}
                                onChange={(e) => {
                                    updateSetting('spellCheckLanguage', e.target.value);
                                    window.api.spellSetLanguage(e.target.value);
                                }}
                                className="settings-select settings-select-medium"
                            >
                                <option value="en-US">English (US)</option>
                            </select>
                        </div>
                    )}
                    <div className="settings-row">
                        <div>
                            <div className="settings-row-label">Language Server</div>
                            <div className="settings-row-description">Enable advanced features like autocompletion and diagnostics</div>
                        </div>
                        <Toggle
                            checked={settings.lspEnabled}
                            onChange={(checked) => updateSetting('lspEnabled', checked)}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
