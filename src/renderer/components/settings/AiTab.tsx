import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { UserSettings } from '../../store/useAppStore';
import { Bot, Check, Eye, EyeOff, Key, Brain, MessageSquare, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { Toggle } from './Toggle';

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

export const AiTab = () => {
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

                    {/* Model + API Key -- only shown when provider is selected */}
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
