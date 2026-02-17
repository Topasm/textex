import React from 'react';

export const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) => (
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
