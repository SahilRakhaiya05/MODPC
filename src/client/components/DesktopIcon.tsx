import React from 'react';

interface DesktopIconProps {
  id: string;
  label: string;
  icon: string;
  isSelected: boolean;
  onSelect: () => void;
  onDoubleClick: () => void;
}

export const DesktopIcon: React.FC<DesktopIconProps> = ({
  label,
  icon,
  isSelected,
  onSelect,
  onDoubleClick
}) => {
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        if (isSelected) {
          onDoubleClick();
        } else {
          onSelect();
        }
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick();
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '85px',
        height: '85px',
        padding: '10px 6px',
        borderRadius: '16px',
        cursor: 'pointer',
        background: isSelected 
          ? 'var(--accent-bg-pill)' 
          : 'rgba(255, 255, 255, 0.02)',
        border: isSelected 
          ? '1px solid var(--accent-border-pill)' 
          : '1px solid rgba(255, 255, 255, 0.04)',
        boxShadow: isSelected 
          ? '0 8px 24px rgba(0, 0, 0, 0.5), 0 0 12px var(--accent-border-pill)' 
          : 'none',
        transform: isSelected ? 'scale(1.05)' : 'none',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        gap: '8px'
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
          e.currentTarget.style.transform = 'scale(1.03)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.04)';
          e.currentTarget.style.transform = 'none';
        }
      }}
    >
      <div style={{
        fontSize: '28px',
        lineHeight: 1,
        filter: isSelected ? 'drop-shadow(0 0 8px var(--accent-gold))' : 'none',
        transition: 'all 0.2s ease'
      }}>
        {icon}
      </div>
      <span style={{
        color: '#f3f4f6',
        fontSize: '10px',
        fontWeight: 600,
        fontFamily: 'var(--font-body)',
        textAlign: 'center',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        width: '100%',
        textShadow: '0 2px 4px rgba(0,0,0,0.5)'
      }}>
        {label}
      </span>
    </div>
  );
};
