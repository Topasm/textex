
import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { X } from 'lucide-react';

export const SettingsModal = ({ onClose }: { onClose: () => void }) => {
    const settings = useAppStore((state) => state.settings);
    const updateSetting = useAppStore((state) => state.updateSetting);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
            <div
                className="w-[480px] bg-white dark:bg-[#1e1e1e] rounded-xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Preferences</h2>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                        <X size={18} className="text-gray-500" />
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="px-6 py-2 max-h-[60vh] overflow-y-auto">

                    {/* Section: Appearance */}
                    <section className="py-4 border-b border-gray-100 dark:border-gray-800">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Appearance</h3>

                        {/* Theme: Segmented Control */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Theme</label>
                            <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                                {['System', 'Light', 'Dark'].map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => updateSetting('theme', mode.toLowerCase() as any)}
                                        className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${settings.theme === mode.toLowerCase()
                                            ? 'bg-white dark:bg-gray-600 text-black dark:text-white shadow-sm'
                                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-900'
                                            }`}
                                    >
                                        {mode}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* PDF Night Mode Toggle */}
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Night Mode PDF</div>
                                <div className="text-xs text-gray-500">Invert colors for comfortable dark reading</div>
                            </div>
                            <input
                                type="checkbox"
                                checked={settings.pdfInvertMode}
                                onChange={(e) => updateSetting('pdfInvertMode', e.target.checked)}
                                className="toggle-switch"
                            />
                        </div>
                    </section>

                    {/* Section: Editor */}
                    <section className="py-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Editor</h3>

                        {/* Font Size Slider */}
                        <div className="mb-4">
                            <div className="flex justify-between mb-2">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Font Size</label>
                                <span className="text-sm text-gray-500">{settings.fontSize}px</span>
                            </div>
                            <input
                                type="range"
                                min="10"
                                max="32"
                                step="1"
                                value={settings.fontSize}
                                onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))}
                                className="w-full accent-blue-500"
                            />
                        </div>

                        {/* Word Wrap Toggle */}
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Word Wrap</div>
                                <div className="text-xs text-gray-500">Wrap long lines to fit the visible area</div>
                            </div>
                            <input
                                type="checkbox"
                                checked={settings.wordWrap}
                                onChange={(e) => updateSetting('wordWrap', e.target.checked)}
                                className="toggle-switch"
                            />
                        </div>

                        {/* Format On Save Toggle */}
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Format on Save</div>
                                <div className="text-xs text-gray-500">Automatically clean up code when saving</div>
                            </div>
                            <input
                                type="checkbox"
                                checked={settings.formatOnSave}
                                onChange={(e) => updateSetting('formatOnSave', e.target.checked)}
                                className="toggle-switch"
                            />
                        </div>
                    </section>


                    {/* Section: Integrations */}
                    <section className="py-4 border-t border-gray-100 dark:border-gray-800">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Integrations</h3>

                        {/* Zotero Toggle */}
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Zotero Integration</div>
                                <div className="text-xs text-gray-500">Enable citation search and insertion</div>
                            </div>
                            <input
                                type="checkbox"
                                checked={settings.zoteroEnabled}
                                onChange={(e) => updateSetting('zoteroEnabled', e.target.checked)}
                                className="toggle-switch"
                            />
                        </div>

                        {/* Zotero Port (Conditional) */}
                        {settings.zoteroEnabled && (
                            <div className="ml-4 mb-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-md border border-gray-100 dark:border-gray-800">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Better BibTeX Port</label>
                                    <input
                                        type="number"
                                        value={settings.zoteroPort}
                                        onChange={(e) => updateSetting('zoteroPort', parseInt(e.target.value))}
                                        className="w-20 px-2 py-1 text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-right"
                                    />
                                </div>
                                <div className="text-xs text-gray-500 flex items-center gap-2">
                                    <span>Status:</span>
                                    <ZoteroStatusProbe port={settings.zoteroPort} />
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Section: Automation */}
                    <section className="py-4 border-t border-gray-100 dark:border-gray-800">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Automation</h3>

                        {/* Auto Compile Toggle */}
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto Compile</div>
                                <div className="text-xs text-gray-500">Automatically compile when saving via shortcuts</div>
                            </div>
                            <input
                                type="checkbox"
                                checked={settings.autoCompile}
                                onChange={(e) => updateSetting('autoCompile', e.target.checked)}
                                className="toggle-switch"
                            />
                        </div>

                        {/* Spell Check Toggle */}
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Spell Check</div>
                                <div className="text-xs text-gray-500">Highlight misspelled words</div>
                            </div>
                            <input
                                type="checkbox"
                                checked={settings.spellCheckEnabled}
                                onChange={(e) => updateSetting('spellCheckEnabled', e.target.checked)}
                                className="toggle-switch"
                            />
                        </div>

                        {/* LSP Toggle */}
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Language Server</div>
                                <div className="text-xs text-gray-500">Enable advanced features like autocompletion and diagnostics</div>
                            </div>
                            <input
                                type="checkbox"
                                checked={settings.lspEnabled}
                                onChange={(e) => updateSetting('lspEnabled', e.target.checked)}
                                className="toggle-switch"
                            />
                        </div>
                    </section>
                </div>

                {/* Footer info */}
                <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 text-center">
                    <span className="text-xs text-gray-400">TexTex v1.0.0 • Build 2026</span>
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
        return () => { mounted = false; };
    }, [port]);

    if (status === 'checking') return <span className="text-gray-400">Checking...</span>;
    if (status === 'connected') return <span className="text-green-500 font-medium">Connected</span>;
    return <span className="text-red-500 font-medium">Not Connected</span>;
};
