import React, { useEffect } from 'react';

interface SystemToastProps {
  message: string;
  type?: 'info' | 'warning' | 'error' | 'success';
  onClose: () => void;
}

export const SystemToast: React.FC<SystemToastProps> = ({ message, type = 'info', onClose }) => {
  // Automatically close after 5 seconds to prevent visual clutter
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const getIcon = () => {
    switch (type) {
      case 'success': return '✓';
      case 'warning': return '⚠';
      case 'error': return '✕';
      default: return 'ℹ';
    }
  };

  const getAccentColor = () => {
    switch (type) {
      case 'success': return '#10b981'; // Green
      case 'warning': return 'var(--accent-gold)'; // Muted Ochre
      case 'error': return '#ef4444'; // Red
      default: return '#3b82f6'; // Blue
    }
  };

  const getLabel = () => {
    switch (type) {
      case 'success': return 'SYSTEM_STABLE // SECURE';
      case 'warning': return 'SYSTEM_WARN // ATTN';
      case 'error': return 'SYSTEM_ERR // FAIL';
      default: return 'SYSTEM_MSG // INFO';
    }
  };

  return (
    <>
      <style>{`
        @keyframes toastSlideIn {
          from {
            transform: translateY(20px) scale(0.95);
            opacity: 0;
          }
          to {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }
        .premium-toast {
          animation: toastSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
      <div 
        className="premium-toast glass-panel"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '360px',
          zIndex: 999999,
          display: 'flex',
          flexDirection: 'column',
          borderLeft: `4px solid ${getAccentColor()}`,
          overflow: 'hidden',
          padding: '14px 18px',
          gap: '8px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ 
            fontFamily: 'var(--font-mono)', 
            fontSize: '9px', 
            fontWeight: 600, 
            letterSpacing: '0.1em',
            color: getAccentColor() 
          }}>
            {getLabel()}
          </span>
          <button 
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--glass-text-muted)',
              fontSize: '16px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2px',
              transition: 'color 0.2s ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--glass-text-muted)'}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            border: `1px solid ${getAccentColor()}33`,
            color: getAccentColor(),
            fontSize: '12px',
            fontWeight: 'bold',
            flexShrink: 0,
            marginTop: '2px'
          }}>
            {getIcon()}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <p style={{
              fontSize: '13px',
              fontFamily: 'var(--font-body)',
              lineHeight: '1.45',
              color: '#ffffff',
              wordBreak: 'break-word',
              fontWeight: 400
            }}>
              {message}
            </p>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '8px',
              color: 'var(--glass-text-muted)',
              marginTop: '4px'
            }}>
              SYS_TELEMETRY.LOC // LOCAL_DESK
            </span>
          </div>
        </div>
      </div>
    </>
  );
};
