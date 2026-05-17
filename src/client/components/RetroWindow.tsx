import React, { useState, useRef, useEffect } from 'react';

interface RetroWindowProps {
  id: string;
  title: string;
  icon: string;
  isOpen: boolean;
  onClose: () => void;
  isActive: boolean;
  onFocus: () => void;
  defaultPosition?: { x: number; y: number };
  defaultSize?: { width: string; height: string };
  children: React.ReactNode;
  isMinimized?: boolean;
  isMaximized?: boolean;
  onMinimize?: () => void;
  onMaximize?: () => void;
}

export const RetroWindow: React.FC<RetroWindowProps> = ({
  id,
  title,
  icon,
  isOpen,
  onClose,
  isActive,
  onFocus,
  defaultPosition = { x: 50, y: 50 },
  defaultSize = { width: '450px', height: '400px' },
  children,
  isMinimized = false,
  isMaximized = false,
  onMinimize,
  onMaximize
}) => {
  const [position, setPosition] = useState(() => ({
    x: defaultPosition.x + (id.charCodeAt(0) % 5) * 20,
    y: defaultPosition.y + (id.charCodeAt(id.length - 1) % 5) * 20
  }));
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const windowRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only drag with left click
    if (e.button !== 0) return;
    
    // Avoid dragging if click hits buttons
    if ((e.target as HTMLElement).closest('.window-ctrl-dot')) return;
    if (isMaximized) return; // Disable drag when maximized

    onFocus();
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      // Calculate bounded coordinates
      let newX = e.clientX - dragStart.current.x;
      let newY = e.clientY - dragStart.current.y;
      
      // Ensure window stays mostly on screen
      newX = Math.max(-100, Math.min(window.innerWidth - 100, newX));
      newY = Math.max(0, Math.min(window.innerHeight - 50, newY));

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!isOpen) return null;

  return (
    <div
      ref={windowRef}
      onMouseDown={onFocus}
      className={`glass-window glass-panel ${isActive ? 'active' : ''}`}
      style={{
        width: isMaximized ? '100vw' : defaultSize.width,
        height: isMaximized ? 'calc(100vh - 40px - 90px)' : defaultSize.height,
        left: isMaximized ? '0px' : `${position.x}px`,
        top: isMaximized ? '40px' : `${position.y}px`,
        zIndex: isActive ? 100 : 20,
        position: 'absolute',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'all 0.35s cubic-bezier(0.25, 0.8, 0.25, 1)',
        opacity: isMinimized ? 0 : 1,
        transform: isMinimized ? 'scale(0.8) translateY(100px)' : 'scale(1) translateY(0)',
        pointerEvents: isMinimized ? 'none' : 'auto',
      }}
    >
      {/* Title bar / Header (translucent) */}
      <div 
        onMouseDown={handleMouseDown}
        className="glass-window-header"
      >
        <div className="glass-window-title">
          <span style={{ fontSize: '14px', marginRight: '-4px' }}>{icon}</span>
          <span style={{ 
            color: isActive ? '#ffffff' : '#94a3b8',
            whiteSpace: 'nowrap', 
            overflow: 'hidden', 
            textOverflow: 'ellipsis'
          }}>
            {title}
          </span>
        </div>

        {/* Custom macOS-style circular capsule controls (outlined, color on hover only) */}
        <div className="glass-window-controls">
          <button 
            className="window-ctrl-dot close" 
            title="Close" 
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          />
          <button 
            className="window-ctrl-dot minimize" 
            title="Minimize"
            onClick={(e) => {
              e.stopPropagation();
              if (onMinimize) onMinimize();
              else onClose();
            }}
          />
          <button 
            className="window-ctrl-dot maximize" 
            title="Maximize"
            onClick={(e) => {
              e.stopPropagation();
              if (onMaximize) onMaximize();
            }}
          />
        </div>
      </div>

      {/* Embedded Window Content */}
      <div 
        className="glass-window-content" 
        style={{ 
          padding: '16px',
          flexGrow: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'transparent'
        }}
      >
        {children}
      </div>

      {/* Footer Status Bar (premium translucent) */}
      <div 
        style={{
          padding: '8px 16px',
          fontSize: '9px',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.05em',
          backgroundColor: 'rgba(0, 0, 0, 0.25)',
          color: 'var(--glass-text-muted)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 'auto',
          borderTop: '1px solid rgba(255, 255, 255, 0.05)'
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: 'var(--accent-gold)' }}></span>
          SECURE TECHNICAL SUBPROCESS
        </span>
        <span style={{ opacity: 0.8 }}>SYS_CORE.ACTIVE // TRU</span>
      </div>
    </div>
  );
};
