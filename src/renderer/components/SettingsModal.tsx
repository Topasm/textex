import React, { useState, useEffect } from 'react';
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose}>
            <div
                className="w-[800px] h-[500px] bg-white dark:bg-[#1e1e1e] rounded-xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800 flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
                    <div className="flex items-center gap-2">
                        <SettingsIcon size={18} className="text-blue-500" />
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Settings</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar */}
                    <div className="w-64 bg-gray-50 dark:bg-[#252526] border-r border-gray-100 dark:border-gray-800 py-4">
                        <nav className="space-y-1 px-3">
                            {tabs.map((tab) => {
                                const Icon = tab.icon;
                                const isActive = activeTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${isActive
                                            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
                                            }`}
                                    >
                                        <Icon size={18} className={isActive ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'} />
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </nav>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-8 bg-white dark:bg-[#1e1e1e]">
                        {activeTab === 'general' && (
                            <div className="space-y-6 animate-fadeIn">
                                <div className="p-4 bg-gray-50 dark:bg-blue-900/10 rounded-xl border border-gray-100 dark:border-blue-900/30">
                                    <div className="flex items-start gap-4">
                                        <div className="p-2 bg-white dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400 shadow-sm">
                                            <User size={24} />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">User Information</h3>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-6">
                                                These details will be used in templates and document metadata.
                                            </p>

                                            <div className="space-y-4 max-w-lg">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Full Name</label>
                                                    <div className="relative">
                                                        <input
                                                            type="text"
                                                            value={settings.name}
                                                            onChange={(e) => updateSetting('name', e.target.value)}
                                                            placeholder="e.g. Jane Doe"
                                                            className="w-full pl-3 pr-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-all"
                                                        />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email Address</label>
                                                    <input
                                                        type="email"
                                                        value={settings.email}
                                                        onChange={(e) => updateSetting('email', e.target.value)}
                                                        placeholder="e.g. jane@example.com"
                                                        className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-all"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Affiliation</label>
                                                    <input
                                                        type="text"
                                                        value={settings.affiliation}
                                                        onChange={(e) => updateSetting('affiliation', e.target.value)}
                                                        placeholder="e.g. University of Technology"
                                                        className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-all"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'appearance' && (
                            <div className="space-y-8 animate-fadeIn">
                                <div>
                                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">Theme</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Choose how TexTex looks to you.</p>

                                    <div className="grid grid-cols-3 gap-4">
                                        {[
                                            { id: 'light', label: 'Light', icon: Sun },
                                            { id: 'dark', label: 'Dark', icon: Moon },
                                            { id: 'system', label: 'System', icon: Monitor },
                                        ].map((mode) => (
                                            <button
                                                key={mode.id}
                                                onClick={() => updateSetting('theme', mode.id as UserSettings['theme'])}
                                                className={`group relative flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${settings.theme === mode.id
                                                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/10'
                                                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
                                                    }`}
                                            >
                                                <div className={`p-3 rounded-full ${settings.theme === mode.id
                                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 group-hover:bg-gray-200 dark:group-hover:bg-gray-600'
                                                    }`}>
                                                    <mode.icon size={20} />
                                                </div>
                                                <span className={`text-sm font-medium ${settings.theme === mode.id
                                                    ? 'text-blue-700 dark:text-blue-300'
                                                    : 'text-gray-700 dark:text-gray-300'
                                                    }`}>
                                                    {mode.label}
                                                </span>
                                                {settings.theme === mode.id && (
                                                    <div className="absolute top-3 right-3 text-blue-500">
                                                        <Check size={16} />
                                                    </div>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-gray-100 dark:border-gray-800">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-base font-medium text-gray-900 dark:text-gray-100">PDF Night Mode</h3>
                                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Invert text and background colors for comfortable reading in dark environments.</p>
                                        </div>
                                        <Toggle
                                            checked={settings.pdfInvertMode}
                                            onChange={(checked) => updateSetting('pdfInvertMode', checked)}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'editor' && (
                            <div className="space-y-6 animate-fadeIn">
                                <div>
                                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-6">Typography</h3>

                                    <div className="space-y-6">
                                        <div>
                                            <div className="flex justify-between mb-2">
                                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Font Size</label>
                                                <span className="text-sm font-mono bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-gray-600 dark:text-gray-400">{settings.fontSize}px</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="10"
                                                max="32"
                                                step="1"
                                                value={settings.fontSize}
                                                onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))}
                                                className="w-full accent-blue-500 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                            />
                                            <div className="flex justify-between mt-1 text-xs text-gray-400">
                                                <span>10px</span>
                                                <span>32px</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-gray-100 dark:border-gray-800">
                                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Behavior</h3>
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                            <div>
                                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Word Wrap</div>
                                                <div className="text-xs text-gray-500 mt-0.5">Wrap long lines to fit the visible area</div>
                                            </div>
                                            <Toggle
                                                checked={settings.wordWrap}
                                                onChange={(checked) => updateSetting('wordWrap', checked)}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                            <div>
                                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Format on Save</div>
                                                <div className="text-xs text-gray-500 mt-0.5">Automatically format functionality code when saving</div>
                                            </div>
                                            <Toggle
                                                checked={settings.formatOnSave}
                                                onChange={(checked) => updateSetting('formatOnSave', checked)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'integrations' && (
                            <div className="space-y-6 animate-fadeIn">
                                <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/30">
                                    <div className="flex items-start gap-4">
                                        <div className="p-2 bg-white dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400 shadow-sm">
                                            <Link size={24} />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between mb-1">
                                                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Zotero Integration</h3>
                                                <Toggle
                                                    checked={settings.zoteroEnabled}
                                                    onChange={(checked) => updateSetting('zoteroEnabled', checked)}
                                                />
                                            </div>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
                                                Connect to Zotero to search and insert citations directly into your LaTeX documents.
                                                Requires Better BibTeX for Zotero installed.
                                            </p>

                                            {settings.zoteroEnabled && (
                                                <div className="mt-4 pt-4 border-t border-blue-200/50 dark:border-blue-800/30 flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Port Number</label>
                                                        <input
                                                            type="number"
                                                            value={settings.zoteroPort}
                                                            onChange={(e) => updateSetting('zoteroPort', parseInt(e.target.value))}
                                                            className="w-24 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                        />
                                                    </div>
                                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white/50 dark:bg-black/20 rounded-md">
                                                        <span className="text-xs text-gray-500 uppercase font-semibold">Status</span>
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
                            <div className="space-y-6 animate-fadeIn">
                                <div>
                                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Compiler & Tools</h3>
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                            <div>
                                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Auto Compile</div>
                                                <div className="text-xs text-gray-500 mt-0.5">Automatically compile when saving via shortcuts</div>
                                            </div>
                                            <Toggle
                                                checked={settings.autoCompile}
                                                onChange={(checked) => updateSetting('autoCompile', checked)}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                            <div>
                                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Spell Check</div>
                                                <div className="text-xs text-gray-500 mt-0.5">Highlight misspelled words while typing</div>
                                            </div>
                                            <Toggle
                                                checked={settings.spellCheckEnabled}
                                                onChange={(checked) => updateSetting('spellCheckEnabled', checked)}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                            <div>
                                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Language Server</div>
                                                <div className="text-xs text-gray-500 mt-0.5">Enable advanced features like autocompletion and diagnostics</div>
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

                {/* Footer info */}
                <div className="px-6 py-3 bg-gray-50 dark:bg-[#252526] border-t border-gray-200 dark:border-gray-800 text-center flex justify-between items-center text-xs text-gray-400">
                    <span>TexTex v1.0.0</span>
                    <span className="font-mono opacity-50">Build 2026</span>
                </div>
            </div>
        </div>
    );
};

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) => (
    <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${checked ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'
            }`}
        role="switch"
        aria-checked={checked}
    >
        <span
            aria-hidden="true"
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-5' : 'translate-x-0'
                }`}
        />
    </button>
);

const AiDraftSettings = () => {
    const settings = useAppStore((state) => state.settings);
    const updateSetting = useAppStore((state) => state.updateSetting);
    const [apiKey, setApiKey] = useState('');
    const [hasKey, setHasKey] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (settings.aiProvider) {
            window.api.aiHasApiKey(settings.aiProvider).then(setHasKey).catch(() => setHasKey(false));
        } else {
            setHasKey(false);
        }
    }, [settings.aiProvider]);

    const handleSaveKey = async () => {
        if (!apiKey.trim() || !settings.aiProvider) return;
        setSaving(true);
        try {
            await window.api.aiSaveApiKey(settings.aiProvider, apiKey.trim());
            setHasKey(true);
            setApiKey('');
        } catch {
            // ignore
        } finally {
            setSaving(false);
        }
    };

    const modelPlaceholder = settings.aiProvider === 'openai' ? 'gpt-4o' : settings.aiProvider === 'anthropic' ? 'claude-sonnet-4-5-20250929' : 'Select a provider first';

    return (
        <div className="p-4 bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-100 dark:border-purple-900/30">
            <div className="flex items-start gap-4">
                <div className="p-2 bg-white dark:bg-purple-900/30 rounded-lg text-purple-600 dark:text-purple-400 shadow-sm">
                    <Zap size={24} />
                </div>
                <div className="flex-1">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">AI Draft</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
                        Generate LaTeX documents from markdown or notes using OpenAI or Anthropic.
                    </p>

                    <div className="space-y-4 max-w-lg">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Provider</label>
                            <select
                                value={settings.aiProvider}
                                onChange={(e) => updateSetting('aiProvider', e.target.value as 'openai' | 'anthropic' | '')}
                                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            >
                                <option value="">Select provider...</option>
                                <option value="openai">OpenAI</option>
                                <option value="anthropic">Anthropic</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Model</label>
                            <input
                                type="text"
                                value={settings.aiModel}
                                onChange={(e) => updateSetting('aiModel', e.target.value)}
                                placeholder={modelPlaceholder}
                                disabled={!settings.aiProvider}
                                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:opacity-50"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                API Key {hasKey && <span className="text-green-500 text-xs font-normal ml-1">(configured)</span>}
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder={hasKey ? 'Key saved — enter new key to replace' : 'Enter API key'}
                                    disabled={!settings.aiProvider}
                                    className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:opacity-50"
                                />
                                <button
                                    onClick={handleSaveKey}
                                    disabled={!apiKey.trim() || !settings.aiProvider || saving}
                                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                                >
                                    {saving ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                        </div>
                    </div>
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
        const interval = setInterval(check, 5000); // Recheck every 5s
        return () => { mounted = false; clearInterval(interval); };
    }, [port]);

    if (status === 'checking') return <span className="text-gray-400 text-xs">Checking...</span>;
    if (status === 'connected') return <span className="text-green-500 font-medium text-xs flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>Connected</span>;
    return <span className="text-red-500 font-medium text-xs flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>Disconnected</span>;
};
