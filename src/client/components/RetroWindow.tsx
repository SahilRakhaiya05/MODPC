import React, { useState, useRef, useEffect } from 'react';

type RetroWindowProps = {
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
};

type WindowSize = {
  width: number;
  height: number;
};

const parseCssSize = (value: string, fallback: number) => {
  if (value.endsWith('%') || value.startsWith('calc(')) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const viewportSize = () => ({
  width: typeof window === 'undefined' ? 1280 : window.innerWidth,
  height: typeof window === 'undefined' ? 760 : window.innerHeight,
});

const clampSize = (size: WindowSize, position: { x: number; y: number }): WindowSize => {
  const viewport = viewportSize();
  const maxWidth = Math.max(320, viewport.width - position.x - 12);
  const maxHeight = Math.max(300, viewport.height - position.y - 58);
  return {
    width: Math.max(320, Math.min(size.width, maxWidth, viewport.width - 24)),
    height: Math.max(300, Math.min(size.height, maxHeight, viewport.height - 82)),
  };
};

const clampPosition = (position: { x: number; y: number }, width: number) => {
  const viewport = viewportSize();
  const maxX = Math.max(0, viewport.width - Math.min(180, width));
  const maxY = Math.max(0, viewport.height - 80);
  return {
    x: Math.max(-Math.min(80, width - 160), Math.min(maxX, position.x)),
    y: Math.max(44, Math.min(maxY, position.y)),
  };
};

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
  const [position, setPosition] = useState(() => {
    const initialWidth = parseCssSize(defaultSize.width, 720);
    return clampPosition({
      x: defaultPosition.x + (id.charCodeAt(0) % 5) * 20,
      y: defaultPosition.y + (id.charCodeAt(id.length - 1) % 5) * 20
    }, initialWidth);
  });
  const [size, setSize] = useState<WindowSize>(() => {
    const initialPosition = {
      x: defaultPosition.x + (id.charCodeAt(0) % 5) * 20,
      y: defaultPosition.y + (id.charCodeAt(id.length - 1) % 5) * 20
    };
    return clampSize({
      width: parseCssSize(defaultSize.width, 720),
      height: parseCssSize(defaultSize.height, 520),
    }, initialPosition);
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const windowRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only drag with left click
    if (e.button !== 0) return;
    
    // Avoid dragging if click hits buttons
    if (e.target instanceof HTMLElement && e.target.closest('.window-ctrl-dot')) return;
    if (isMaximized) return; // Disable drag when maximized

    onFocus();
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
    e.preventDefault();
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || isMaximized) return;
    onFocus();
    setIsResizing(true);
    resizeStart.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
    };
    e.preventDefault();
    e.stopPropagation();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      // Calculate bounded coordinates
      const newX = e.clientX - dragStart.current.x;
      const newY = e.clientY - dragStart.current.y;
      
      setPosition(clampPosition({ x: newX, y: newY }, size.width));
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
  }, [isDragging, size.width]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const nextWidth = resizeStart.current.width + e.clientX - resizeStart.current.x;
      const nextHeight = resizeStart.current.height + e.clientY - resizeStart.current.y;
      setSize(clampSize({ width: nextWidth, height: nextHeight }, position));
    };

    const handleMouseUp = () => {
      if (isResizing) setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, position]);

  useEffect(() => {
    const handleViewportResize = () => {
      setPosition((current) => ({
        ...clampPosition(current, size.width),
      }));
      setSize((current) => clampSize(current, position));
    };
    window.addEventListener('resize', handleViewportResize);
    return () => window.removeEventListener('resize', handleViewportResize);
  }, [position, size.width]);

  if (!isOpen) return null;

  return (
    <div
      ref={windowRef}
      onMouseDown={onFocus}
      className={`glass-window glass-panel ${isActive ? 'active' : ''}`}
      style={{
        width: isMaximized ? '100vw' : `${size.width}px`,
        height: isMaximized ? 'calc(100vh - 100px)' : `${size.height}px`,
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
        minWidth: '320px',
        minHeight: '300px',
      }}
    >
      {/* Title bar / Header (translucent) */}
      <div 
        onMouseDown={handleMouseDown}
        className="glass-window-header"
      >
        <div className="glass-window-title">
          <span style={{ fontSize: '14px', marginRight: '-4px' }}>{icon}</span>
          <span
            style={{
              color: isActive ? 'var(--ink)' : 'var(--muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </span>
        </div>

        {/* macOS-style circular controls with always-visible glyphs */}
        <div className="glass-window-controls">
          <button
            type="button"
            className="window-ctrl-dot minimize"
            aria-label={`Minimize ${title}`}
            title="Minimize"
            onClick={(e) => {
              e.stopPropagation();
              if (onMinimize) onMinimize();
              else onClose();
            }}
          >
            <svg viewBox="0 0 10 10" aria-hidden="true" focusable="false">
              <line x1="2" y1="5" x2="8" y2="5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className="window-ctrl-dot maximize"
            aria-label={isMaximized ? `Restore ${title}` : `Maximize ${title}`}
            title={isMaximized ? 'Restore' : 'Maximize'}
            onClick={(e) => {
              e.stopPropagation();
              if (onMaximize) onMaximize();
            }}
          >
            <svg viewBox="0 0 10 10" aria-hidden="true" focusable="false">
              <rect x="2.4" y="2.4" width="5.2" height="5.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            className="window-ctrl-dot close"
            aria-label={`Close ${title}`}
            title="Close"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            <svg viewBox="0 0 10 10" aria-hidden="true" focusable="false">
              <line x1="2.6" y1="2.6" x2="7.4" y2="7.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="7.4" y1="2.6" x2="2.6" y2="7.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
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
      {!isMaximized && <button className="window-resize-handle" onMouseDown={handleResizeMouseDown} aria-label="Resize window" />}
    </div>
  );
};
