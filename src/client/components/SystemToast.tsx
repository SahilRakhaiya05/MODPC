import React, { useEffect } from 'react';

interface SystemToastProps {
  message: string;
  type?: 'info' | 'warning' | 'error' | 'success';
  onClose: () => void;
}

const TONE: Record<NonNullable<SystemToastProps['type']>, { accent: string; label: string; glyph: string }> = {
  success: { accent: 'var(--green)', label: 'Success', glyph: '✓' },
  warning: { accent: 'var(--yellow)', label: 'Warning', glyph: '⚠' },
  error: { accent: 'var(--red)', label: 'Error', glyph: '✕' },
  info: { accent: 'var(--blue)', label: 'Info', glyph: 'ℹ' },
};

export const SystemToast: React.FC<SystemToastProps> = ({ message, type = 'info', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const tone = TONE[type];

  return (
    <div
      className="system-toast"
      role="status"
      style={{ borderLeftColor: tone.accent }}
    >
      <div
        className="system-toast-icon"
        style={{ background: tone.accent }}
        aria-hidden="true"
      >
        {tone.glyph}
      </div>
      <div className="system-toast-body">
        <span className="system-toast-label">{tone.label}</span>
        <p className="system-toast-message">{message}</p>
      </div>
      <button
        type="button"
        className="system-toast-close"
        aria-label="Dismiss"
        onClick={onClose}
      >
        ×
      </button>
    </div>
  );
};
