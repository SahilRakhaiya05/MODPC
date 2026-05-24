import React from 'react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  consequences: string;
  targetDisplay: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  consequences,
  targetDisplay,
  onConfirm,
  onCancel
}) => {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999999,
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)'
    }}>
      <div 
        className="glass-panel"
        style={{
          width: 'min(460px, calc(100vw - 24px))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: '12px',
          border: '1px solid rgba(239, 68, 68, 0.3)', // Subtle red hazard border
          boxShadow: '0 32px 64px -16px rgba(0, 0, 0, 0.9), 0 0 24px rgba(239, 68, 68, 0.05)'
        }}
      >
        {/* Header bar */}
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 18px',
            background: 'rgba(239, 68, 68, 0.08)',
            borderBottom: '1px solid rgba(239, 68, 68, 0.15)'
          }}
        >
          <span style={{ 
            fontFamily: 'var(--font-heading)',
            fontWeight: 700,
            fontSize: '9px',
            color: '#ef4444',
            letterSpacing: '0.15em',
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px' 
          }}>
            <span>⚠️</span>
            <span>{title.toUpperCase()}</span>
          </span>
          <button 
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--glass-text-muted)',
              fontSize: '18px',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '2px',
              transition: 'color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--glass-text-muted)'}
          >
            ×
          </button>
        </div>

        {/* Content bed */}
        <div 
          style={{
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            background: 'var(--glass-bg)'
          }}
        >
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '32px', lineHeight: 1 }}>🚨</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <h4 style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                color: '#ef4444',
                fontWeight: 600,
                letterSpacing: '0.05em'
              }}>
                [HIGH_RISK_SYSTEM_DIRECTIVE]
              </h4>
              <p style={{ 
                fontSize: '13px', 
                fontFamily: 'var(--font-body)',
                lineHeight: '1.5',
                color: '#e5e7eb' 
              }}>
                {message}
              </p>
            </div>
          </div>

          {/* Details bed */}
          <div style={{
            padding: '10px 14px',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '6px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '8px',
              fontWeight: 500,
              color: 'var(--glass-text-muted)',
              letterSpacing: '0.05em'
            }}>
              TARGET COMPONENT ID
            </span>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--accent-gold)',
              wordBreak: 'break-all'
            }}>
              {targetDisplay}
            </div>
          </div>

          {/* Consequences Warning Callout */}
          <div style={{
            padding: '12px 14px',
            backgroundColor: 'rgba(239, 68, 68, 0.03)',
            borderLeft: '3px solid #ef4444',
            borderRadius: '4px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}>
            <span style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '8px',
              fontWeight: 700,
              color: '#f87171',
              letterSpacing: '0.1em'
            }}>
              CONSEQUENCES SUMMARY
            </span>
            <p style={{
              fontSize: '12px',
              color: '#fca5a5',
              lineHeight: '1.45',
              fontFamily: 'var(--font-body)'
            }}>
              {consequences}
            </p>
          </div>
        </div>

        {/* Footer controls */}
        <div 
          style={{
            padding: '14px 24px',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px'
          }}
        >
          <button 
            className="glass-btn"
            onClick={onCancel}
            style={{ minWidth: '100px' }}
          >
            Cancel
          </button>
          <button 
            className="glass-btn danger"
            onClick={onConfirm}
            style={{ minWidth: '140px' }}
          >
            Confirm Exec
          </button>
        </div>
      </div>
    </div>
  );
};
