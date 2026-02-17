import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore'
import type { UserSettings } from '../types/api';
import { X, Moon, Sun, Monitor, Type, Zap, Link, Check, Palette, Settings as SettingsIcon, User, Bot, Eye, EyeOff, Key, Brain, MessageSquare, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';

export const SettingsModal = ({ onClose }: { onClose: () => void }) => {
    const settings = useAppStore((state) => state.settings);
    const updateSetting = useAppStore((state) => state.updateSetting);
    const [activeTab, setActiveTab] = useState<'general' | 'appearance' | 'editor' | 'ai' | 'integrations' | 'automation'>('general');

    const tabs = [
        { id: 'general', label: 'General', icon: User },
        { id: 'appearance', label: 'Appearance', icon: Palette },
        { id: 'editor', label: 'Editor', icon: Type },
        { id: 'ai', label: 'AI', icon: Bot },
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

                            </div>
                        )}

                        {activeTab === 'ai' && (
                            <AiSettings />
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

const MODEL_OPTIONS: Record<string, { value: string; label: string }[]> = {
    openai: [
        { value: 'gpt-4o', label: 'GPT-4o' },
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
        { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
        { value: 'o1', label: 'o1' },
        { value: 'o1-mini', label: 'o1 Mini' },
    ],
    anthropic: [
        { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
        { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
        { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    ],
    gemini: [
        { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
        { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
        { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    ],
};

const PROVIDER_INFO: Record<string, { label: string; keyHint: string; keyUrl: string }> = {
    openai: { label: 'OpenAI', keyHint: 'sk-...', keyUrl: 'https://platform.openai.com/api-keys' },
    anthropic: { label: 'Anthropic', keyHint: 'sk-ant-...', keyUrl: 'https://console.anthropic.com/settings/keys' },
    gemini: { label: 'Gemini', keyHint: 'AIza...', keyUrl: 'https://aistudio.google.com/apikey' },
};

const AiSettings = () => {
    const settings = useAppStore((state) => state.settings);
    const updateSetting = useAppStore((state) => state.updateSetting);

    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [keySaved, setKeySaved] = useState(false);
    const [hasKey, setHasKey] = useState(false);

    const provider = settings.aiProvider;
    const providerInfo = provider ? PROVIDER_INFO[provider] : null;
    const currentModels = provider ? MODEL_OPTIONS[provider] ?? [] : [];

    // Check if API key exists for current provider
    useEffect(() => {
        if (provider) {
            window.api.aiHasApiKey(provider).then(setHasKey);
        } else {
            setHasKey(false);
        }
        setApiKey('');
        setShowKey(false);
        setKeySaved(false);
    }, [provider]);

    const handleSaveKey = async () => {
        if (!provider || !apiKey.trim()) return;
        await window.api.aiSaveApiKey(provider, apiKey.trim());
        setHasKey(true);
        setKeySaved(true);
        setApiKey('');
        setShowKey(false);
        setTimeout(() => setKeySaved(false), 2000);
    };

    return (
        <div className="settings-tab-content settings-animate-in">
            {/* Master toggle */}
            <div className="settings-section">
                <div className="settings-section-header">
                    <div className="settings-section-icon">
                        <Bot size={24} />
                    </div>
                    <div className="settings-section-body">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <h3 className="settings-section-title" style={{ marginBottom: 0 }}>AI Assistant</h3>
                            <Toggle
                                checked={!!settings.aiEnabled}
                                onChange={(checked) => updateSetting('aiEnabled', checked)}
                            />
                        </div>
                        <p className="settings-section-description">
                            Generate LaTeX from notes, fix grammar, rewrite academically, and paraphrase text.
                            Bring your own API key from any supported provider.
                        </p>
                    </div>
                </div>
            </div>

            {settings.aiEnabled && (
                <>
                    {/* Provider selection */}
                    <hr className="settings-divider" />
                    <div>
                        <h3 className="settings-heading">Provider</h3>
                        <p className="settings-subheading">Choose which AI service to use for text generation.</p>
                        <div className="settings-theme-grid" style={{ marginTop: 12 }}>
                            {(['openai', 'anthropic', 'gemini'] as const).map((p) => (
                                <button
                                    key={p}
                                    onClick={() => {
                                        updateSetting('aiProvider', p);
                                        updateSetting('aiModel', '');
                                    }}
                                    className={`settings-theme-card${provider === p ? ' selected' : ''}`}
                                >
                                    <span className="settings-theme-card-label" style={{ fontWeight: 500 }}>
                                        {PROVIDER_INFO[p].label}
                                    </span>
                                    {provider === p && (
                                        <div className="settings-theme-card-check">
                                            <Check size={16} />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Model + API Key — only shown when provider is selected */}
                    {provider && providerInfo && (
                        <>
                            <hr className="settings-divider" />

                            {/* Model */}
                            <div>
                                <h3 className="settings-heading">Model</h3>
                                <p className="settings-subheading">Select which model to use. Leave on Default for the recommended option.</p>
                                <div className="settings-field-group" style={{ marginTop: 12 }}>
                                    <select
                                        value={settings.aiModel}
                                        onChange={(e) => updateSetting('aiModel', e.target.value)}
                                        className="settings-select"
                                    >
                                        <option value="">Default</option>
                                        {currentModels.map((m) => (
                                            <option key={m.value} value={m.value}>{m.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <hr className="settings-divider" />

                            {/* API Key */}
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                    <Key size={16} style={{ color: 'var(--text-secondary)' }} />
                                    <h3 className="settings-heading" style={{ marginBottom: 0 }}>API Key</h3>
                                    {hasKey && !keySaved && (
                                        <span className="settings-configured-tag">Configured</span>
                                    )}
                                    {keySaved && (
                                        <span className="settings-configured-tag" style={{ background: 'var(--success, #2ea043)', color: '#fff' }}>Saved</span>
                                    )}
                                </div>
                                <p className="settings-subheading">
                                    Enter your {providerInfo.label} API key. Keys are stored locally and never shared.{' '}
                                    <a
                                        href="#"
                                        onClick={(e) => { e.preventDefault(); window.api.openExternal(providerInfo.keyUrl); }}
                                        style={{ color: 'var(--accent)' }}
                                    >
                                        Get a key
                                    </a>
                                </p>
                                <div className="settings-key-row" style={{ marginTop: 12 }}>
                                    <div style={{ position: 'relative', flex: 1 }}>
                                        <input
                                            type={showKey ? 'text' : 'password'}
                                            value={apiKey}
                                            onChange={(e) => setApiKey(e.target.value)}
                                            placeholder={hasKey ? 'Enter new key to replace...' : providerInfo.keyHint}
                                            className="settings-input"
                                            style={{ paddingRight: 36 }}
                                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveKey(); }}
                                        />
                                        <button
                                            onClick={() => setShowKey(!showKey)}
                                            style={{
                                                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                                                background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                                                color: 'var(--text-secondary)', display: 'flex'
                                            }}
                                            title={showKey ? 'Hide key' : 'Show key'}
                                        >
                                            {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                    <button
                                        className="primary-button"
                                        onClick={handleSaveKey}
                                        disabled={!apiKey.trim()}
                                        style={{ whiteSpace: 'nowrap' }}
                                    >
                                        Save Key
                                    </button>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Thinking / Reasoning */}
                    <hr className="settings-divider" />
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <Brain size={16} style={{ color: 'var(--text-secondary)' }} />
                            <h3 className="settings-heading" style={{ marginBottom: 0 }}>Thinking / Reasoning</h3>
                        </div>
                        <p className="settings-subheading">
                            Enable extended thinking for deeper reasoning. Supported on Gemini 2.5, Claude Sonnet/Opus, and OpenAI o-series models.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div className="settings-row">
                                <div>
                                    <div className="settings-row-label">Enable Thinking</div>
                                    <div className="settings-row-description">Let the model reason step-by-step before answering</div>
                                </div>
                                <Toggle
                                    checked={!!settings.aiThinkingEnabled}
                                    onChange={(checked) => updateSetting('aiThinkingEnabled', checked)}
                                />
                            </div>
                            {settings.aiThinkingEnabled && (
                                <div style={{ paddingLeft: 0, marginTop: 8 }}>
                                    <label className="settings-label">Thinking Budget (tokens)</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <select
                                            value={settings.aiThinkingBudget || 0}
                                            onChange={(e) => updateSetting('aiThinkingBudget', parseInt(e.target.value))}
                                            className="settings-select"
                                            style={{ maxWidth: 240 }}
                                        >
                                            <option value={0}>Default (provider decides)</option>
                                            <option value={4096}>Light (4K tokens)</option>
                                            <option value={8192}>Medium (8K tokens)</option>
                                            <option value={16384}>Deep (16K tokens)</option>
                                            <option value={32768}>Maximum (32K tokens)</option>
                                        </select>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Custom Prompts */}
                    <hr className="settings-divider" />
                    <AiPromptsEditor />
                </>
            )}
        </div>
    );
};

const DEFAULT_PROMPTS: Record<string, { label: string; key: keyof UserSettings; placeholder: string }> = {
    generate: {
        label: 'Draft Generation',
        key: 'aiPromptGenerate' as keyof UserSettings,
        placeholder: 'You are a LaTeX document generator. Given markdown, plain text notes, or an outline, produce a complete, compilable LaTeX document. Output ONLY the LaTeX source code...'
    },
    fix: {
        label: 'Fix Grammar',
        key: 'aiPromptFix' as keyof UserSettings,
        placeholder: 'Fix grammar and spelling in the following LaTeX text. Do not remove LaTeX commands. Return ONLY the fixed text.'
    },
    academic: {
        label: 'Academic Rewrite',
        key: 'aiPromptAcademic' as keyof UserSettings,
        placeholder: 'Rewrite the following text to be more formal and academic suitable for a research paper. Preserve LaTeX commands. Return ONLY the rewritten text.'
    },
    summarize: {
        label: 'Summarize',
        key: 'aiPromptSummarize' as keyof UserSettings,
        placeholder: 'Summarize the following text briefly. Return ONLY the summary.'
    },
    longer: {
        label: 'Make Longer',
        key: 'aiPromptLonger' as keyof UserSettings,
        placeholder: 'Paraphrase the following text to be longer and more detailed, expanding on the key points. Preserve all LaTeX commands. Return ONLY the paraphrased text.'
    },
    shorter: {
        label: 'Make Shorter',
        key: 'aiPromptShorter' as keyof UserSettings,
        placeholder: 'Paraphrase the following text to be shorter and more concise, keeping only the essential points. Preserve all LaTeX commands. Return ONLY the paraphrased text.'
    }
};

const AiPromptsEditor = () => {
    const settings = useAppStore((state) => state.settings);
    const updateSetting = useAppStore((state) => state.updateSetting);
    const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);

    const promptEntries = Object.entries(DEFAULT_PROMPTS);

    const handleReset = (key: keyof UserSettings) => {
        updateSetting(key, '' as never);
    };

    const hasCustomValue = (key: keyof UserSettings): boolean => {
        const val = settings[key];
        return typeof val === 'string' && val.trim().length > 0;
    };

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <MessageSquare size={16} style={{ color: 'var(--text-secondary)' }} />
                <h3 className="settings-heading" style={{ marginBottom: 0 }}>Custom Prompts</h3>
            </div>
            <p className="settings-subheading">
                Customize the system prompts used for each AI action. Leave empty to use the built-in defaults.
            </p>
            <div className="ai-prompts-list">
                {promptEntries.map(([id, prompt]) => {
                    const isExpanded = expandedPrompt === id;
                    const isCustom = hasCustomValue(prompt.key);
                    return (
                        <div key={id} className="ai-prompt-item">
                            <button
                                className="ai-prompt-header"
                                onClick={() => setExpandedPrompt(isExpanded ? null : id)}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    <span>{prompt.label}</span>
                                    {isCustom && <span className="settings-configured-tag">Custom</span>}
                                </div>
                            </button>
                            {isExpanded && (
                                <div className="ai-prompt-body">
                                    <textarea
                                        className="ai-prompt-textarea"
                                        value={(settings[prompt.key] as string) || ''}
                                        onChange={(e) => updateSetting(prompt.key, e.target.value as never)}
                                        placeholder={prompt.placeholder}
                                        rows={3}
                                    />
                                    {isCustom && (
                                        <button
                                            className="ai-prompt-reset"
                                            onClick={() => handleReset(prompt.key)}
                                            title="Reset to default"
                                        >
                                            <RotateCcw size={13} />
                                            Reset
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
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
