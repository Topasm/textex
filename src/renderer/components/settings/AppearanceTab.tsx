import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { UserSettings } from '../../store/useAppStore';
import { Moon, Sun, Monitor, Check } from 'lucide-react';
import { Toggle } from './Toggle';

export const AppearanceTab = () => {
    const settings = useAppStore((state) => state.settings);
    const updateSetting = useAppStore((state) => state.updateSetting);

    return (
        <div className="settings-tab-content settings-animate-in">
            <div>
                <h3 className="settings-heading">Theme</h3>
                <p className="settings-subheading">Choose how TexTex looks to you.</p>

                <div className="settings-theme-grid">
                    {[
                        { id: 'light', label: 'Light', icon: Sun },
                        { id: 'dark', label: 'Dark', icon: Moon },
                        { id: 'system', label: 'System', icon: Monitor },
                    ].map((mode) => (
                        <button
                            key={mode.id}
                            onClick={() => {
                                const newTheme = mode.id as UserSettings['theme'];
                                updateSetting('theme', newTheme);
                                if (newTheme === 'dark') {
                                    updateSetting('pdfInvertMode', true);
                                } else if (newTheme === 'light') {
                                    updateSetting('pdfInvertMode', false);
                                } else if (newTheme === 'system') {
                                    const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                                    updateSetting('pdfInvertMode', isSystemDark);
                                }
                            }}
                            className={`settings-theme-card${settings.theme === mode.id ? ' selected' : ''}`}
                        >
                            <div className="settings-theme-card-icon">
                                <mode.icon size={20} />
                            </div>
                            <span className="settings-theme-card-label">
                                {mode.label}
                            </span>
                            {settings.theme === mode.id && (
                                <div className="settings-theme-card-check">
                                    <Check size={16} />
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <hr className="settings-divider" />

            <div className="settings-row">
                <div>
                    <div className="settings-row-label">PDF Night Mode</div>
                    <div className="settings-row-description">Invert text and background colors for comfortable reading in dark environments.</div>
                </div>
                <Toggle
                    checked={settings.pdfInvertMode}
                    onChange={(checked) => updateSetting('pdfInvertMode', checked)}
                />
            </div>
        </div>
    );
};
