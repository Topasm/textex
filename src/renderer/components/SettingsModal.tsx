import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore'
import type { UserSettings } from '../types/api';
import { X, Moon, Sun, Monitor, Type, Zap, Link, Check, Palette, Settings as SettingsIcon, User } from 'lucide-react';

export const SettingsModal = ({ onClose }: { onClose: () => void }) => {
    const settings = useAppStore((state) => state.settings);
    const updateSetting = useAppStore((state) => state.updateSetting);
    const [activeTab, setActiveTab] = useState<'general' | 'appearance' | 'editor' | 'integrations' | 'automation'>('general');

    const tabs = [
        { id: 'general', label: 'General', icon: User },
        { id: 'appearance', label: 'Appearance', icon: Palette },
        { id: 'editor', label: 'Editor', icon: Type },
        { id: 'integrations', label: 'Integrations', icon: Link },
        { id: 'automation', label: 'Automation', icon: Zap },
    ] as const;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal-content settings-modal"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <SettingsIcon size={18} />
                        <h2>Settings</h2>
                    </div>
                    <button onClick={onClose} className="close-button">
                        <X size={18} />
                    </button>
                </div>

                <div className="settings-layout">
                    {/* Sidebar */}
                    <div className="settings-sidebar">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`settings-tab${isActive ? ' active' : ''}`}
                                >
                                    <Icon size={18} />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Content */}
                    <div className="settings-content">
                        {activeTab === 'general' && (
                            <div className="settings-tab-content settings-animate-in">
                                <div className="settings-section">
                                    <div className="settings-section-header">
                                        <div className="settings-section-icon">
                                            <User size={24} />
                                        </div>
                                        <div className="settings-section-body">
                                            <h3 className="settings-section-title">User Information</h3>
                                            <p className="settings-section-description">
                                                These details will be used in templates and document metadata.
                                            </p>

                                            <div className="settings-field-group">
                                                <div>
                                                    <label className="settings-label">Full Name</label>
                                                    <input
                                                        type="text"
                                                        value={settings.name}
                                                        onChange={(e) => updateSetting('name', e.target.value)}
                                                        placeholder="e.g. Jane Doe"
                                                        className="settings-input"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="settings-label">Email Address</label>
                                                    <input
                                                        type="email"
                                                        value={settings.email}
                                                        onChange={(e) => updateSetting('email', e.target.value)}
                                                        placeholder="e.g. jane@example.com"
                                                        className="settings-input"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="settings-label">Affiliation</label>
                                                    <input
                                                        type="text"
                                                        value={settings.affiliation}
                                                        onChange={(e) => updateSetting('affiliation', e.target.value)}
                                                        placeholder="e.g. University of Technology"
                                                        className="settings-input"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'appearance' && (
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
                        )}

                        {activeTab === 'editor' && (
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
                        )}

                        {activeTab === 'integrations' && (
                            <div className="settings-tab-content settings-animate-in">
                                <div className="settings-section">
                                    <div className="settings-section-header">
                                        <div className="settings-section-icon">
                                            <Link size={24} />
                                        </div>
                                        <div className="settings-section-body">
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                                <h3 className="settings-section-title" style={{ marginBottom: 0 }}>Zotero Integration</h3>
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
                                                        <label className="settings-label" style={{ marginBottom: 0 }}>Port Number</label>
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

                                <AiDraftSettings />
                            </div>
                        )}

                        {activeTab === 'automation' && (
                            <div className="settings-tab-content settings-animate-in">
                                <div>
                                    <h3 className="settings-heading" style={{ marginBottom: 12 }}>Compiler &amp; Tools</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="modal-footer">
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>TexTex v1.0.0</span>
                    <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-secondary)', opacity: 0.5 }}>Build 2026</span>
                </div>
            </div>
        </div>
    );
};

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) => (
    <button
        onClick={() => onChange(!checked)}
        className="settings-toggle-track"
        role="switch"
        aria-checked={checked}
    >
        <span
            aria-hidden="true"
            className="settings-toggle-knob"
        />
    </button>
);

const AiDraftSettings = () => {
    const settings = useAppStore((state) => state.settings);
    const updateSetting = useAppStore((state) => state.updateSetting);

    const modelPlaceholder = settings.aiProvider === 'openai' ? 'gpt-4o' : settings.aiProvider === 'anthropic' ? 'claude-sonnet-4-5-20250929' : 'Select a provider first';

    return (
        <div className="settings-section">
            <div className="settings-section-header">
                <div className="settings-section-icon">
                    <Zap size={24} />
                </div>
                <div className="settings-section-body">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <h3 className="settings-section-title" style={{ marginBottom: 0 }}>AI Draft</h3>
                        <Toggle
                            checked={!!settings.aiEnabled}
                            onChange={(checked) => updateSetting('aiEnabled', checked)}
                        />
                    </div>
                    <p className="settings-section-description">
                        Enable AI features: generate LaTeX from notes, fix grammar, rewrite academically, paraphrase longer/shorter.
                    </p>

                    {settings.aiEnabled && (
                        <div className="settings-field-group">
                            <div>
                                <label className="settings-label">Provider</label>
                                <select
                                    value={settings.aiProvider}
                                    onChange={(e) => updateSetting('aiProvider', e.target.value as 'openai' | 'anthropic' | '')}
                                    className="settings-select"
                                >
                                    <option value="">Select provider...</option>
                                    <option value="openai">OpenAI</option>
                                    <option value="anthropic">Anthropic</option>
                                </select>
                            </div>

                            <div>
                                <label className="settings-label">Model</label>
                                <input
                                    type="text"
                                    value={settings.aiModel}
                                    onChange={(e) => updateSetting('aiModel', e.target.value)}
                                    placeholder={modelPlaceholder}
                                    disabled={!settings.aiProvider}
                                    className="settings-input"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const ZoteroStatusProbe = ({ port }: { port: number }) => {
    const [status, setStatus] = React.useState<'checking' | 'connected' | 'error'>('checking');

    React.useEffect(() => {
        let mounted = true;
        const check = async () => {
            setStatus('checking');
            try {
                const connected = await window.api.zoteroProbe(port);
                if (mounted) setStatus(connected ? 'connected' : 'error');
            } catch {
                if (mounted) setStatus('error');
            }
        };
        check();
        const interval = setInterval(check, 5000);
        return () => { mounted = false; clearInterval(interval); };
    }, [port]);

    if (status === 'checking') return <span className="settings-status-text">Checking...</span>;
    if (status === 'connected') return (
        <span className="settings-status-text connected" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span className="settings-status-dot connected" />Connected
        </span>
    );
    return (
        <span className="settings-status-text error" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span className="settings-status-dot error" />Disconnected
        </span>
    );
};

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
