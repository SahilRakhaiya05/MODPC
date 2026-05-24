import React, { useState, useRef, useEffect, useCallback } from 'react';

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

type WindowSize = { width: number; height: number };
type WindowPos = { x: number; y: number };
type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const MIN_WIDTH = 360;
const MIN_HEIGHT = 300;
const MENUBAR_HEIGHT = 44;
const EDGE_THICKNESS = 6;
const CORNER_SIZE = 14;

const parseCssSize = (value: string, fallback: number): number => {
  if (value.endsWith('%') || value.startsWith('calc(')) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const viewportSize = () => ({
  width: typeof window === 'undefined' ? 1280 : window.innerWidth,
  height: typeof window === 'undefined' ? 760 : window.innerHeight,
});

const clampSize = (size: WindowSize, position: WindowPos): WindowSize => {
  const viewport = viewportSize();
  const maxWidth = Math.max(MIN_WIDTH, viewport.width - position.x - 8);
  const maxHeight = Math.max(MIN_HEIGHT, viewport.height - position.y - 12);
  return {
    width: Math.max(MIN_WIDTH, Math.min(size.width, maxWidth, viewport.width - 16)),
    height: Math.max(MIN_HEIGHT, Math.min(size.height, maxHeight, viewport.height - 56)),
  };
};

const clampPosition = (position: WindowPos, size: WindowSize): WindowPos => {
  const viewport = viewportSize();
  const maxX = Math.max(0, viewport.width - Math.min(180, size.width));
  const maxY = Math.max(MENUBAR_HEIGHT, viewport.height - 80);
  return {
    x: Math.max(-Math.min(80, size.width - 160), Math.min(maxX, position.x)),
    y: Math.max(MENUBAR_HEIGHT, Math.min(maxY, position.y)),
  };
};

const RESIZE_CURSOR: Record<ResizeDir, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
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
  defaultSize = { width: '720px', height: '520px' },
  children,
  isMinimized = false,
  isMaximized = false,
  onMinimize,
  onMaximize,
}) => {
  const initialOffset = {
    x: defaultPosition.x + (id.charCodeAt(0) % 5) * 20,
    y: defaultPosition.y + (id.charCodeAt(id.length - 1) % 5) * 20,
  };
  const [position, setPosition] = useState<WindowPos>(() => clampPosition(initialOffset, {
    width: parseCssSize(defaultSize.width, 720),
    height: parseCssSize(defaultSize.height, 520),
  }));
  const [size, setSize] = useState<WindowSize>(() => clampSize({
    width: parseCssSize(defaultSize.width, 720),
    height: parseCssSize(defaultSize.height, 520),
  }, initialOffset));

  const [isDragging, setIsDragging] = useState(false);
  const [resizeDir, setResizeDir] = useState<ResizeDir | null>(null);
  const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const resizeStart = useRef<{ mouseX: number; mouseY: number; pos: WindowPos; size: WindowSize }>({
    mouseX: 0,
    mouseY: 0,
    pos: { x: 0, y: 0 },
    size: { width: 0, height: 0 },
  });

  const handleTitleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (e.target instanceof HTMLElement && e.target.closest('.window-ctrl-dot')) return;
    if (isMaximized) return;
    onFocus();
    setIsDragging(true);
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    e.preventDefault();
  };

  const handleResizeStart = useCallback(
    (dir: ResizeDir) => (e: React.MouseEvent) => {
      if (e.button !== 0 || isMaximized) return;
      onFocus();
      setResizeDir(dir);
      resizeStart.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        pos: { ...position },
        size: { ...size },
      };
      e.preventDefault();
      e.stopPropagation();
    },
    [isMaximized, onFocus, position, size]
  );

  // Drag listener
  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => {
      const next = { x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y };
      setPosition(clampPosition(next, size));
    };
    const handleUp = () => setIsDragging(false);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, size]);

  // Resize listener — handles all 8 directions
  useEffect(() => {
    if (!resizeDir) return;
    const dir = resizeDir;
    const handleMove = (e: MouseEvent) => {
      const dx = e.clientX - resizeStart.current.mouseX;
      const dy = e.clientY - resizeStart.current.mouseY;
      const start = resizeStart.current;
      let newX = start.pos.x;
      let newY = start.pos.y;
      let newWidth = start.size.width;
      let newHeight = start.size.height;

      if (dir.includes('e')) {
        newWidth = start.size.width + dx;
      }
      if (dir.includes('w')) {
        newWidth = start.size.width - dx;
        newX = start.pos.x + dx;
        // Don't let the window slide past minimum width
        if (newWidth < MIN_WIDTH) {
          newX = start.pos.x + (start.size.width - MIN_WIDTH);
          newWidth = MIN_WIDTH;
        }
      }
      if (dir.includes('s')) {
        newHeight = start.size.height + dy;
      }
      if (dir.includes('n')) {
        newHeight = start.size.height - dy;
        newY = start.pos.y + dy;
        if (newHeight < MIN_HEIGHT) {
          newY = start.pos.y + (start.size.height - MIN_HEIGHT);
          newHeight = MIN_HEIGHT;
        }
        // Don't allow dragging the top above the menubar
        if (newY < MENUBAR_HEIGHT) {
          newHeight = newHeight - (MENUBAR_HEIGHT - newY);
          newY = MENUBAR_HEIGHT;
        }
      }

      const clampedSize = clampSize({ width: newWidth, height: newHeight }, { x: newX, y: newY });
      setPosition({ x: newX, y: newY });
      setSize(clampedSize);
    };
    const handleUp = () => setResizeDir(null);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    document.body.style.cursor = RESIZE_CURSOR[dir];
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
    };
  }, [resizeDir]);

  const stateRef = useRef({ position, size });
  useEffect(() => {
    stateRef.current = { position, size };
  }, [position, size]);

  // Keep window in viewport on resize
  useEffect(() => {
    const handleViewportResize = () => {
      const currentPos = stateRef.current.position;
      const currentSize = stateRef.current.size;
      setSize((current) => clampSize(current, currentPos));
      setPosition(clampPosition(currentPos, currentSize));
    };
    window.addEventListener('resize', handleViewportResize);
    return () => window.removeEventListener('resize', handleViewportResize);
  }, []);

  if (!isOpen) return null;

  const renderHandle = (dir: ResizeDir) => {
    const style: React.CSSProperties = {
      position: 'absolute',
      cursor: RESIZE_CURSOR[dir],
      zIndex: 6,
    };
    switch (dir) {
      case 'n':
        Object.assign(style, { top: 0, left: CORNER_SIZE, right: CORNER_SIZE, height: EDGE_THICKNESS });
        break;
      case 's':
        Object.assign(style, { bottom: 0, left: CORNER_SIZE, right: CORNER_SIZE, height: EDGE_THICKNESS });
        break;
      case 'e':
        Object.assign(style, { right: 0, top: CORNER_SIZE, bottom: CORNER_SIZE, width: EDGE_THICKNESS });
        break;
      case 'w':
        Object.assign(style, { left: 0, top: CORNER_SIZE, bottom: CORNER_SIZE, width: EDGE_THICKNESS });
        break;
      case 'nw':
        Object.assign(style, { top: 0, left: 0, width: CORNER_SIZE, height: CORNER_SIZE });
        break;
      case 'ne':
        Object.assign(style, { top: 0, right: 0, width: CORNER_SIZE, height: CORNER_SIZE });
        break;
      case 'sw':
        Object.assign(style, { bottom: 0, left: 0, width: CORNER_SIZE, height: CORNER_SIZE });
        break;
      case 'se':
        Object.assign(style, { bottom: 0, right: 0, width: CORNER_SIZE, height: CORNER_SIZE });
        break;
    }
    return (
      <div
        key={dir}
        role="presentation"
        aria-hidden="true"
        className={`window-resize-edge edge-${dir}`}
        style={style}
        onMouseDown={handleResizeStart(dir)}
      />
    );
  };

  return (
    <div
      onMouseDown={onFocus}
      className={`glass-window glass-panel ${isActive ? 'active' : ''}${resizeDir ? ' is-resizing' : ''}${isDragging ? ' is-dragging' : ''}`}
      style={{
        width: isMaximized ? '100vw' : `${size.width}px`,
        height: isMaximized ? 'calc(100vh - 88px)' : `${size.height}px`,
        left: isMaximized ? '0px' : `${position.x}px`,
        top: isMaximized ? '44px' : `${position.y}px`,
        zIndex: isActive ? 100 : 20,
        position: 'absolute',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: resizeDir || isDragging ? 'none' : 'opacity 0.2s ease, transform 0.25s ease',
        opacity: isMinimized ? 0 : 1,
        transform: isMinimized ? 'scale(0.85) translateY(80px)' : 'scale(1) translateY(0)',
        pointerEvents: isMinimized ? 'none' : 'auto',
        minWidth: `${MIN_WIDTH}px`,
        minHeight: `${MIN_HEIGHT}px`,
      }}
    >
      {/* Title bar */}
      <div onMouseDown={handleTitleMouseDown} className="glass-window-header">
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

      {/* Content */}
      <div
        className="glass-window-content"
        style={{
          padding: '16px',
          flexGrow: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'transparent',
        }}
      >
        {children}
      </div>

      {/* 8 resize handles — invisible overlay strips around edges + corners */}
      {!isMaximized && (
        <>
          {renderHandle('n')}
          {renderHandle('s')}
          {renderHandle('e')}
          {renderHandle('w')}
          {renderHandle('nw')}
          {renderHandle('ne')}
          {renderHandle('sw')}
          {renderHandle('se')}
        </>
      )}
    </div>
  );
};
