import React, { useState, useEffect } from 'react';

interface BootScreenProps {
  onComplete: () => void;
  subredditName: string;
}

export const BootScreen: React.FC<BootScreenProps> = ({ onComplete, subredditName }) => {
  const [lines, setLines] = useState<string[]>([]);
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const linesToPrint = [
      "⚡ KERNEL INITIALIZATION: SUCCESSFUL",
      "🛰️ NODE ADDRESS: secure-moddesk-bridge://devvit-gateway",
      `📡 COMMUNITY BOUND: ${subredditName || 'r/RetroMod'}`,
      "🔒 SECURITY LEVEL: CLASS-A HYBRID ENCRYPTION SECURED",
      "🔋 SUBSYSTEM CHANNELS: ACTIVE [redditAPI, useRedis]",
      "🧪 ALIGNING AUDIT EVENTS INDEXER... OK",
      "🧬 PRE-LOADING SCENARIO MATRIX SIMULATORS... OK",
      "🖥️ GRAPHICS GRAPH: WEBOS GLASS-INTEGRATION STABLE",
      "💎 BOOTING SWISS TECHNICAL CONSOLE ENVIRONMENT..."
    ];

    let lineIdx = 0;
    const lineInterval = setInterval(() => {
      if (lineIdx < linesToPrint.length) {
        const nextLine = linesToPrint[lineIdx];
        if (nextLine !== undefined && nextLine !== null) {
          setLines(prev => [...prev, nextLine]);
        }
        lineIdx++;
      } else {
        clearInterval(lineInterval);
      }
    }, 180);

    const progressInterval = setInterval(() => {
      setPercent(prev => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          setTimeout(onComplete, 400); // Smooth final trigger
          return 100;
        }
        return prev + 10;
      });
    }, 200);

    return () => {
      clearInterval(lineInterval);
      clearInterval(progressInterval);
    };
  }, [subredditName, onComplete]);

  return (
    <div style={{
      backgroundColor: 'var(--desktop-bg)',
      backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(217, 119, 6, 0.03) 0%, rgba(7, 7, 10, 0) 100%)',
      color: 'var(--glass-text)',
      fontFamily: 'var(--font-body)',
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
      zIndex: 999999,
      position: 'relative'
    }}>
      {/* Blueprint Grid Canvas */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        opacity: 0.04,
        backgroundSize: '30px 30px',
        backgroundImage: 'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
        pointerEvents: 'none'
      }} />

      {/* Main Container */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        width: '100%',
        maxWidth: '640px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '32px'
      }}>
        {/* Core Animated Brand Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: '16px',
            background: 'var(--glass-bg)',
            border: '1px solid rgba(217, 119, 6, 0.4)',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5), 0 0 16px rgba(217, 119, 6, 0.1) inset',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            animation: 'pulse 3s infinite ease-in-out',
            marginBottom: '12px',
            color: 'var(--accent-gold)'
          }}>
            ⚙️
          </div>
          <h1 style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '20px',
            fontWeight: 700,
            letterSpacing: '0.3em',
            color: '#ffffff',
            textAlign: 'center',
            textTransform: 'uppercase',
            marginRight: '-0.3em' // Counteract letter-spacing on center alignment
          }}>
            ModDesk OS
          </h1>
          <p style={{ 
            fontFamily: 'var(--font-mono)',
            fontSize: '9px', 
            color: 'var(--glass-text-muted)', 
            fontWeight: 500, 
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            marginTop: '2px' 
          }}>
            Technical Subreddit Operations Console
          </p>
        </div>

        {/* Telemetry Console */}
        <div style={{
          width: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(30px)',
          WebkitBackdropFilter: 'blur(30px)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: '10px',
          padding: '20px 24px',
          height: '240px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.02) inset',
          scrollBehavior: 'smooth'
        }}>
          {lines.map((line, idx, arr) => {
            const isHighlight = line.includes('SUCCESSFUL') || line.includes('OK') || line.includes('ACTIVE');
            const isGold = line.startsWith('⚡') || line.startsWith('🔒') || line.includes('BOOTING');
            return (
              <div
                key={idx}
                style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  lineHeight: '1.7',
                  color: isHighlight ? '#10b981' : isGold ? 'var(--accent-gold)' : 'var(--glass-text)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  opacity: idx === arr.length - 1 ? 1 : 0.7,
                  animation: 'fadeIn 0.2s ease-out'
                }}
              >
                <span style={{ color: isHighlight ? '#10b981' : 'var(--accent-gold)', opacity: 0.6 }}>▶</span>
                {line}
              </div>
            );
          })}
          {lines.length > 0 && lines.length < 9 && (
            <div style={{
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--accent-gold)',
              animation: 'pulse 1.5s infinite',
              paddingLeft: '16px',
              opacity: 0.6
            }}>
              ▒▒ SYSTEM LOADERS ACTIVE...
            </div>
          )}
        </div>

        {/* Progress Bar & Bypass button */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            fontFamily: 'var(--font-mono)',
            fontSize: '10px', 
            color: 'var(--glass-text-muted)', 
            fontWeight: 500,
            letterSpacing: '0.05em'
          }}>
            <span>SYSTEM BOOT SEQUENCER</span>
            <span style={{ color: 'var(--accent-gold)', fontWeight: 600 }}>{percent}%</span>
          </div>

          <div style={{
            width: '100%',
            height: '6px',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '4px',
            overflow: 'hidden',
            padding: '1px'
          }}>
            <div style={{
              width: `${percent}%`,
              height: '100%',
              backgroundColor: 'var(--accent-gold)',
              borderRadius: '2px',
              transition: 'width 0.2s ease-out'
            }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button
              onClick={onComplete}
              className="glass-btn"
              style={{
                fontSize: '8px',
                padding: '6px 12px',
                gap: '6px'
              }}
            >
              <span>⏩</span> BYPASS KERNEL INITIALIZATION
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.02); opacity: 0.9; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(2px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};
