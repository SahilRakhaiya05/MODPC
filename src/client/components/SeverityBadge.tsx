import React from 'react';
import type { Severity } from '../../shared/api';

interface SeverityBadgeProps {
  score?: number; // 0 to 100
  severity?: Severity;
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({ score, severity }) => {
  // Translate string enum to numeric score if score is not provided
  let finalScore = score ?? 50;
  if (score === undefined && severity !== undefined) {
    switch (severity) {
      case 'low': finalScore = 20; break;
      case 'medium': finalScore = 50; break;
      case 'high': finalScore = 75; break;
      case 'critical': finalScore = 95; break;
    }
  }

  const getBadgeConfig = () => {
    if (finalScore < 30) {
      return { 
        label: 'Low Risk', 
        color: '#10b981', 
        bg: 'rgba(16, 185, 129, 0.08)', 
        border: 'rgba(16, 185, 129, 0.2)',
        glow: '0 0 4px rgba(16, 185, 129, 0.1)',
        emoji: '🟢' 
      };
    }
    if (finalScore < 60) {
      return { 
        label: 'Medium Escalation', 
        color: 'var(--accent-gold)', 
        bg: 'rgba(217, 119, 6, 0.08)', 
        border: 'rgba(217, 119, 6, 0.2)',
        glow: '0 0 4px rgba(217, 119, 6, 0.1)',
        emoji: '🟡' 
      };
    }
    if (finalScore < 85) {
      return { 
        label: 'High Security', 
        color: '#f97316', 
        bg: 'rgba(249, 115, 22, 0.08)', 
        border: 'rgba(249, 115, 22, 0.2)',
        glow: '0 0 4px rgba(249, 115, 22, 0.1)',
        emoji: '🟠' 
      };
    }
    return { 
      label: 'Critical Threat', 
      color: '#ef4444', 
      bg: 'rgba(239, 68, 68, 0.08)', 
      border: 'rgba(239, 68, 68, 0.25)',
      glow: '0 0 4px rgba(239, 68, 68, 0.1)',
      emoji: '🔴' 
    };
  };

  const config = getBadgeConfig();

  return (
    <div 
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 12px',
        backgroundColor: config.bg,
        border: `1px solid ${config.border}`,
        borderRadius: '20px',
        boxShadow: config.glow,
        userSelect: 'none'
      }}
    >
      <span style={{ fontSize: '11px' }}>{config.emoji}</span>
      <span style={{
        fontFamily: 'var(--font-heading)',
        fontSize: '10px',
        fontWeight: 700,
        color: config.color,
        letterSpacing: '0.02em',
        textTransform: 'uppercase'
      }}>
        {config.label}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        fontWeight: 600,
        color: 'var(--glass-text-muted)',
        marginLeft: '2px'
      }}>
        [{Math.round(finalScore)}]
      </span>
    </div>
  );
};
