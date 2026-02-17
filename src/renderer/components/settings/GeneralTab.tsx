import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { User } from 'lucide-react';
import { Toggle } from './Toggle';

export const GeneralTab = () => {
    const settings = useAppStore((state) => state.settings);
    const updateSetting = useAppStore((state) => state.updateSetting);

    return (
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

            <hr className="settings-divider" />

            <div>
                <h3 className="settings-heading" style={{ marginBottom: 12 }}>Application</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div className="settings-row">
                        <div>
                            <div className="settings-row-label">Auto Updates</div>
                            <div className="settings-row-description">Automatically check for updates on launch</div>
                        </div>
                        <Toggle
                            checked={settings.autoUpdateEnabled !== false}
                            onChange={(checked) => updateSetting('autoUpdateEnabled', checked)}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
