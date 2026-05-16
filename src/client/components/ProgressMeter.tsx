import React from 'react';

interface ProgressMeterProps {
  current: number;
  max: number;
  color?: 'green' | 'amber' | 'red' | 'purple';
}

export const ProgressMeter: React.FC<ProgressMeterProps> = ({
  current,
  max,
  color = 'green'
}) => {
  const percent = Math.min(100, Math.max(0, (current / max) * 100));

  const getGradient = () => {
    switch (color) {
      case 'amber': return 'var(--accent-gold)';
      case 'red': return '#ef4444';
      case 'purple': return 'var(--accent-gold)'; // Mapped to gold
      default: return '#10b981';
    }
  };

  const getGlow = () => {
    switch (color) {
      case 'amber': return '0 0 6px rgba(217, 119, 6, 0.3)';
      case 'red': return '0 0 6px rgba(239, 68, 68, 0.3)';
      case 'purple': return '0 0 6px rgba(217, 119, 6, 0.3)';
      default: return '0 0 6px rgba(16, 185, 129, 0.3)';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', fontFamily: 'var(--font-mono)' }}>
      <div style={{
        height: '8px',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        borderRadius: '4px',
        overflow: 'hidden',
        padding: '1px',
        display: 'flex',
        alignItems: 'center'
      }}>
        <div 
          style={{ 
            width: `${percent}%`,
            height: '100%',
            background: getGradient(),
            borderRadius: '2px',
            boxShadow: getGlow(),
            transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        />
      </div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        fontSize: '9px', 
        fontWeight: 500,
        color: 'var(--glass-text-muted)',
        padding: '0 2px',
        marginTop: '1px'
      }}>
        <span style={{ color: '#fff' }}>{Math.round(percent)}%</span>
        <span>{current} / {max} XP</span>
      </div>
    </div>
  );
};
