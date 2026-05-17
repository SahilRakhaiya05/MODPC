/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect } from 'react';
import { 
  AppSettings, ModeratorProfile, AuditEvent, SystemStatus 
} from '../types';
import { api } from '../utils/api';
import { DesktopIcon } from './DesktopIcon';
import { RetroWindow } from './RetroWindow';
import { ModAcademy } from '../modules/ModAcademy';
import { ConsensusDesk } from '../modules/ConsensusDesk';
import { Typewriter } from '../modules/Typewriter';
import { QueueConsole } from '../modules/QueueConsole';
import { SettingsPanel } from '../modules/SettingsPanel';
import { AutomodPanel } from '../modules/AutomodPanel';
import { ModLogConsole } from '../modules/ModLogConsole';
import { UserControlRegistry } from '../modules/UserControlRegistry';

interface WindowInfo {
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  title: string;
  icon: string;
  width: string;
  height: string;
  position: { x: number; y: number };
}

interface WindowState {
  academy: WindowInfo;
  consensus: WindowInfo;
  typewriter: WindowInfo;
  queue: WindowInfo;
  settings: WindowInfo;
  automod: WindowInfo;
  modlog: WindowInfo;
  usergrid: WindowInfo;
}

interface DesktopShellProps {
  statusData: SystemStatus;
  triggerToast: (msg: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
  onReset: () => void;
}

export const DesktopShell: React.FC<DesktopShellProps> = ({ statusData, triggerToast, onReset }) => {
  // Sync core persistent configurations
  const [settings, setSettings] = useState<AppSettings>(statusData.settings);
  const [profile, setProfile] = useState<ModeratorProfile>(statusData.moderatorProfile);
  const [auditTicker, setAuditTicker] = useState<AuditEvent[]>([]);
  
  // OS Mode Switcher State: 'demo' (Playground Training) vs 'live' (Production Feed)
  const [mode, setMode] = useState<'demo' | 'live'>('demo');

  // Custom Premium Theme State
  const [theme, setTheme] = useState<string>(() => {
    return localStorage.getItem('moddesk-theme') || 'carbon';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('moddesk-theme', theme);
  }, [theme]);

  // Handle dynamic styling changes for Live Feed (accent shifting)
  useEffect(() => {
    if (mode === 'live') {
      document.documentElement.style.setProperty('--accent-gold', '#10b981');
      document.documentElement.style.setProperty('--accent-bg-pill', 'rgba(16, 185, 129, 0.08)');
      document.documentElement.style.setProperty('--accent-border-pill', 'rgba(16, 185, 129, 0.25)');
    } else {
      document.documentElement.style.removeProperty('--accent-gold');
      document.documentElement.style.removeProperty('--accent-bg-pill');
      document.documentElement.style.removeProperty('--accent-border-pill');
    }
  }, [mode, theme]);
  
  // Real dynamic clock telemetry
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');

  // Active Audit Feed Log dialog window
  const [auditsOpen, setAuditsOpen] = useState(false);

  // AI Copilot State
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotMessages, setCopilotMessages] = useState<Array<{ sender: 'ai' | 'user'; text: string }>>([
    { sender: 'ai', text: "Hello! I am your ModDesk Subreddit Copilot. I can analyze user queues, suggest relevant moderation rules, or draft civility templates. Select a prompt below or type your question!" }
  ]);
  const [copilotInput, setCopilotInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Oscillating mock telemetry states
  const [cpuLoad, setCpuLoad] = useState(24);
  const [activeUsers, setActiveUsers] = useState(142);
  const [apiLatency, setApiLatency] = useState(48);

  // Window Management States (fully supporting open, minimized, and maximized transitions)
  const [windows, setWindows] = useState<WindowState>({
    academy: { isOpen: false, isMinimized: false, isMaximized: false, title: 'ModAcademy Shift Training', icon: '🎓', width: '750px', height: '540px', position: { x: 80, y: 50 } },
    consensus: { isOpen: false, isMinimized: false, isMaximized: false, title: 'Consensus Decision Desk', icon: '⚖️', width: '750px', height: '540px', position: { x: 130, y: 80 } },
    typewriter: { isOpen: false, isMinimized: false, isMaximized: false, title: 'Typewriter Template Editor', icon: '⌨️', width: '750px', height: '540px', position: { x: 170, y: 110 } },
    queue: { isOpen: false, isMinimized: false, isMaximized: false, title: 'Live Priority Queue Console', icon: '🗃️', width: '750px', height: '540px', position: { x: 210, y: 140 } },
    settings: { isOpen: false, isMinimized: false, isMaximized: false, title: 'ModDesk Settings & Control Panel', icon: '⚙️', width: '600px', height: '480px', position: { x: 250, y: 170 } },
    automod: { isOpen: false, isMinimized: false, isMaximized: false, title: 'AutoModerator Rules Syntax Controller', icon: '🛡️', width: '800px', height: '580px', position: { x: 90, y: 70 } },
    modlog: { isOpen: false, isMinimized: false, isMaximized: false, title: 'Live Moderation Audit Stream', icon: '🖥️', width: '800px', height: '540px', position: { x: 110, y: 90 } },
    usergrid: { isOpen: false, isMinimized: false, isMaximized: false, title: 'Subreddit User Management Desk', icon: '👥', width: '850px', height: '580px', position: { x: 140, y: 100 } }
  });

  const [activeWindow, setActiveWindow] = useState<string>('');
  const [selectedIcon, setSelectedIcon] = useState<string>('');

  // Synchronize clock timer & dynamic stats
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      let hrs = d.getHours();
      const mins = String(d.getMinutes()).padStart(2, '0');
      const ampm = hrs >= 12 ? 'PM' : 'AM';
      hrs = hrs % 12 || 12;
      setTimeStr(`${hrs}:${mins} ${ampm}`);
      
      const options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };
      setDateStr(d.toLocaleDateString('en-US', options));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Simulate server diagnostic load fluctuations
  useEffect(() => {
    const statInterval = setInterval(() => {
      setCpuLoad(prev => {
        const change = Math.floor(Math.random() * 9) - 4; // -4 to 4
        return Math.max(12, Math.min(84, prev + change));
      });
      setActiveUsers(prev => {
        const change = Math.floor(Math.random() * 5) - 2; // -2 to 2
        return Math.max(120, Math.min(220, prev + change));
      });
      setApiLatency(prev => {
        const change = Math.floor(Math.random() * 11) - 5; // -5 to 5
        return Math.max(25, Math.min(110, prev + change));
      });
    }, 4000);

    return () => clearInterval(statInterval);
  }, []);

  // Poll rolling audit events
  const fetchAudits = async () => {
    try {
      const data = await api.getAudits();
      setAuditTicker(data.audits);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    void fetchAudits();
    const interval = setInterval(() => {
      void fetchAudits();
    }, 8000); // Roll logs every 8s
    return () => clearInterval(interval);
  }, []);

  const openWindow = (id: keyof WindowState) => {
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], isOpen: true, isMinimized: false }
    }));
    setActiveWindow(id);
  };

  const closeWindow = (id: keyof WindowState) => {
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], isOpen: false, isMaximized: false, isMinimized: false }
    }));
    if (activeWindow === id) {
      setActiveWindow('');
    }
  };

  const minimizeWindow = (id: keyof WindowState) => {
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], isMinimized: true }
    }));
    if (activeWindow === id) {
      setActiveWindow('');
    }
  };

  const toggleMinimize = (id: keyof WindowState) => {
    setWindows(prev => {
      const win = prev[id];
      if (!win.isOpen) {
        return {
          ...prev,
          [id]: { ...prev[id], isOpen: true, isMinimized: false }
        };
      }
      if (win.isMinimized) {
        return {
          ...prev,
          [id]: { ...prev[id], isMinimized: false }
        };
      }
      return {
        ...prev,
        [id]: { ...prev[id], isMinimized: true }
      };
    });
    
    // Focus restored window
    setWindows(current => {
      if (!current[id].isMinimized) {
        setActiveWindow(id);
      }
      return current;
    });
  };

  const maximizeWindow = (id: keyof WindowState) => {
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], isMaximized: !prev[id].isMaximized }
    }));
  };

  const focusWindow = (id: string) => {
    setActiveWindow(id);
  };

  // Profile update handler passed to modules
  const handleProfileUpdate = (updatedProfile: ModeratorProfile) => {
    setProfile(updatedProfile);
    void fetchAudits();
  };

  // AI Copilot Actions
  const handleAskCopilot = (text: string) => {
    if (!text.trim()) return;
    setCopilotMessages(prev => [...prev, { sender: 'user', text }]);
    setCopilotInput('');
    setIsTyping(true);

    // AI Simulated Typing Response
    setTimeout(() => {
      let reply = "I've scanned the subreddit telemetry. All mod channels are green, and queues are aligned. How else can I assist you?";
      
      const query = text.toLowerCase();
      if (query.includes('rule') || query.includes('harassment')) {
        reply = "🔍 Harassment Rule Recommendation:\nIf an item contains severe verbal abuse, flag it immediately. I suggest linking Rule 1 (Civility & Harassment Warning) using the Typewriter panel and warning the user.";
      } else if (query.includes('crypto') || query.includes('spam')) {
        reply = "🚫 Spam Bot Analysis:\nIdentified a crypto shill bot pattern in r/RetroMod (100% confidence). I highly recommend escalating to a permanent ban ticket in the Consensus desk to purge it immediately.";
      } else if (query.includes('queue')) {
        reply = "🗃️ Priority Queue Summary:\nThere is 1 high-priority comment currently pending moderation. It matches Rule 1 violations (Civility) with a high severity score of 92.5. Highly suggest applying standard warning macros.";
      }

      setCopilotMessages(prev => [...prev, { sender: 'ai', text: reply }]);
      setIsTyping(false);
    }, 1200);
  };

  return (
    <div 
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        position: 'relative',
        backgroundColor: 'var(--desktop-bg)',
        overflow: 'hidden',
        fontFamily: "var(--font-body)"
      }}
      onClick={() => {
        setSelectedIcon('');
      }}
    >
      {/* 1. Animated mesh gradient wall art backdrop with dynamic safety grid override in Live Mode */}
      <div className={`mesh-gradient-bg ${mode === 'live' ? 'live-security-grid' : ''}`}>
        <div className="mesh-circle mesh-circle-1" />
        <div className="mesh-circle mesh-circle-2" />
        <div className="mesh-circle mesh-circle-3" />
        {mode === 'live' && (
          <div 
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              backgroundImage: 'radial-gradient(rgba(16, 185, 129, 0.08) 1px, transparent 1px)',
              backgroundSize: '20px 20px',
              pointerEvents: 'none',
              zIndex: 1,
              animation: 'pulse 4s infinite ease-in-out'
            }}
          />
        )}
      </div>

      {/* 2. Top Glass Bar Menu (Sleek macOS-inspired navigation bar) */}
      <div 
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 24px',
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(30px)',
          WebkitBackdropFilter: 'blur(30px)',
          zIndex: 9999,
          borderBottom: '1px solid var(--glass-border)',
          boxShadow: '0 4px 30px rgba(0, 0, 0, 0.25)'
        }}
      >
        {/* Left Section: OS Badge & Subreddit pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span className="shine-text" style={{ fontWeight: 700, fontSize: '10px', fontFamily: "var(--font-heading)", letterSpacing: '0.15em', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ⚙️ MODDESK OS
          </span>
          <span style={{
            background: mode === 'live' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(217, 119, 6, 0.08)',
            border: mode === 'live' ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(217, 119, 6, 0.25)',
            borderRadius: '20px',
            padding: '3px 12px',
            fontSize: '9px',
            fontWeight: 600,
            color: 'var(--accent-gold)',
            fontFamily: "var(--font-mono)",
            letterSpacing: '0.05em'
          }}>
            NODE // {settings.subredditName.replace(' (Standalone)', '').toUpperCase()}
          </span>
        </div>

        {/* Center Section: Gorgeous Pill Mode Switcher */}
        <div 
          style={{
            display: 'flex',
            background: 'rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '24px',
            padding: '3px',
            gap: '4px',
            zIndex: 1000
          }}
        >
          <button
            onClick={() => {
              setMode('demo');
              triggerToast(' Switched to [DEMO PLAYGROUND] mode.', 'info');
            }}
            style={{
              background: mode === 'demo' ? 'linear-gradient(135deg, #d97706 0%, #b45309 100%)' : 'transparent',
              border: 'none',
              borderRadius: '20px',
              padding: '4px 14px',
              fontSize: '9px',
              fontWeight: 700,
              fontFamily: 'var(--font-heading)',
              color: mode === 'demo' ? '#ffffff' : 'var(--glass-text-muted)',
              cursor: 'pointer',
              letterSpacing: '0.05em',
              transition: 'all 0.25s ease',
              boxShadow: mode === 'demo' ? '0 0 10px rgba(217, 119, 6, 0.4)' : 'none'
            }}
          >
            DEMO PLAYGROUND
          </button>
          <button
            onClick={() => {
              setMode('live');
              triggerToast('⚠️ ALERT: ACTIVE DEPLOYMENT [LIVE SUBREDDIT FEED] ENABLED.', 'warning');
            }}
            style={{
              background: mode === 'live' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'transparent',
              border: 'none',
              borderRadius: '20px',
              padding: '4px 14px',
              fontSize: '9px',
              fontWeight: 700,
              fontFamily: 'var(--font-heading)',
              color: mode === 'live' ? '#ffffff' : 'var(--glass-text-muted)',
              cursor: 'pointer',
              letterSpacing: '0.05em',
              transition: 'all 0.25s ease',
              boxShadow: mode === 'live' ? '0 0 10px rgba(16, 185, 129, 0.4)' : 'none'
            }}
          >
            LIVE PRODUCTION
          </button>
        </div>
        
        {/* Right Section: Diagnostics, Theme & Profile */}
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '11px',
            fontWeight: 500,
            color: '#94a3b8'
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981', boxShadow: '0 0 8px #10b981', display: 'inline-block' }}></span>
            REDIS SUBCHANNEL SECURE
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--glass-text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            🕒 {dateStr} {timeStr}
          </span>
          
          <div style={{ width: '1px', height: '20px', backgroundColor: 'rgba(255,255,255,0.08)' }} />

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#ffffff' }}>{profile.username}</span>
            <span style={{ fontSize: '8px', fontWeight: 500, color: 'var(--accent-gold)', fontFamily: "var(--font-mono)", letterSpacing: '0.05em', marginTop: '-1px' }}>
              {mode === 'live' ? 'LIVE OPERATOR' : `${profile.roleLabel.toUpperCase()} // LVL ${profile.trainingLevel}`}
            </span>
          </div>

          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--accent-gold) 0%, rgba(0,0,0,0.4) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontFamily: 'var(--font-heading)',
            fontWeight: 'bold',
            color: '#fff',
            transition: 'background 0.8s ease'
          }}>
            {profile.username.substring(2, 4).toUpperCase()}
          </div>
        </div>
      </div>

      {/* 3. Main Desktop Area containing Grid + Widgets */}
      <div 
        style={{
          flexGrow: 1,
          padding: '24px',
          position: 'relative',
          minHeight: 0
        }}
      >
        {/* Desktop Widgets (Positioned in the background under windows) */}
        <div style={{
          position: 'absolute',
          top: '24px',
          right: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          width: '300px',
          zIndex: 1,
          pointerEvents: 'auto'
        }}>
          {/* Widget A: Operator Stats radar Card (Show training stats in Demo Mode, Subreddit details in Live Mode) */}
          {mode === 'demo' ? (
            <div className="desktop-widget" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h4 style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: '8px', color: 'var(--accent-gold)', letterSpacing: '0.15em' }}>
                OPERATOR STATUS SUMMARY
              </h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ position: 'relative', width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center' }}>
                  <svg width="60" height="60" viewBox="0 0 60 60">
                    <circle cx="30" cy="30" r="26" stroke="rgba(255,255,255,0.04)" strokeWidth="3" fill="transparent" />
                    <circle cx="30" cy="30" r="26" stroke="var(--accent-gold)" strokeWidth="3" fill="transparent" 
                      strokeDasharray="163" 
                      strokeDashoffset={163 - (163 * Math.min(100, (profile.correctScenarios / (profile.totalScenarios || 1)) * 100)) / 100}
                      strokeLinecap="round"
                      transform="rotate(-90 30 30)"
                    />
                  </svg>
                  <span style={{ position: 'absolute', fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#ffffff' }}>
                    {profile.totalScenarios > 0 ? Math.round((profile.correctScenarios / profile.totalScenarios) * 100) : 0}%
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--glass-text-muted)' }}>Correct Evaluation Rate</span>
                  <span style={{ fontSize: '15px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#ffffff' }}>{profile.xp} <span style={{ fontSize: '9px', color: 'var(--accent-gold)', fontWeight: 500 }}>XP Total</span></span>
                </div>
              </div>
              <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.05)' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--glass-text-muted)' }}>
                <div>
                  <span>Reviewed:</span>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#ffffff', marginTop: '2px' }}>{profile.queueReviewed} Items</div>
                </div>
                <div>
                  <span>Votes Cast:</span>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#ffffff', marginTop: '2px' }}>{profile.consensusVotesCast} Ballots</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="desktop-widget" style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(0, 0, 0, 0.45) 100%)', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
              <h4 style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: '8px', color: '#10b981', letterSpacing: '0.15em' }}>
                SUBREDDIT LIVE TELEMETRY
              </h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span style={{ fontSize: '28px' }}>📡</span>
                <div>
                  <span style={{ fontSize: '10px', color: 'var(--glass-text-muted)', display: 'block' }}>Connected Community</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>r/{settings.subredditName}</span>
                </div>
              </div>
              <div style={{ height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.05)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--glass-text-muted)' }}>
                <div>LIVE ENDPOINT CONNECTION: <strong style={{ color: '#10b981' }}>ESTABLISHED</strong></div>
                <div>AUTODEP COMMIT BRIDGE: <strong style={{ color: '#10b981' }}>ACTIVE</strong></div>
                <div>AUDIT TRAIL LOGGING: <strong style={{ color: '#10b981' }}>FULL COMPLIANCE</strong></div>
              </div>
            </div>
          )}

          {/* Widget B: Real-Time Node Health Telemetry */}
          <div className="desktop-widget" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h4 style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: '8px', color: '#ffffff', opacity: 0.8, letterSpacing: '0.15em' }}>
              NODE DIAGNOSTICS MONITOR
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ background: 'rgba(0,0,0,0.15)', padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.03)' }}>
                <span style={{ fontSize: '9px', color: '#94a3b8', display: 'block' }}>SIM. CPU LOAD</span>
                <span style={{ fontSize: '16px', fontWeight: 800, color: cpuLoad > 60 ? '#ef4444' : '#34d399' }}>{cpuLoad}%</span>
                <div style={{ width: '100%', height: '3px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '2px', marginTop: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${cpuLoad}%`, height: '100%', backgroundColor: cpuLoad > 60 ? '#ef4444' : '#34d399' }} />
                </div>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.15)', padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.03)' }}>
                <span style={{ fontSize: '9px', color: '#94a3b8', display: 'block' }}>LATENCY</span>
                <span style={{ fontSize: '16px', fontWeight: 800, color: '#38bdf8' }}>{apiLatency}ms</span>
                <div style={{ width: '100%', height: '3px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '2px', marginTop: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, (apiLatency / 150) * 100)}%`, height: '100%', backgroundColor: '#38bdf8' }} />
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9px', color: '#64748b' }}>
              <span>ACTIVE VISITORS: <span style={{ color: '#fff', fontWeight: 600 }}>{activeUsers}</span></span>
              <span>DEVVIT BRIDGES: STABLE</span>
            </div>
          </div>
        </div>

        {/* Shortcuts Launcher (Grid on desktop workspace) */}
        <div 
          style={{
            position: 'absolute',
            top: '24px',
            left: '24px',
            display: 'grid',
            gridAutoFlow: 'row',
            gridTemplateColumns: 'repeat(1, 85px)',
            gap: '16px',
            zIndex: 5
          }}
        >
          <DesktopIcon 
            id="academy"
            label="ModAcademy"
            icon="🎓"
            isSelected={selectedIcon === 'academy'}
            onSelect={() => setSelectedIcon('academy')}
            onDoubleClick={() => openWindow('academy')}
          />
          <DesktopIcon 
            id="consensus"
            label="Consensus"
            icon="⚖️"
            isSelected={selectedIcon === 'consensus'}
            onSelect={() => setSelectedIcon('consensus')}
            onDoubleClick={() => openWindow('consensus')}
          />
          <DesktopIcon 
            id="typewriter"
            label="Typewriter"
            icon="⌨️"
            isSelected={selectedIcon === 'typewriter'}
            onSelect={() => setSelectedIcon('typewriter')}
            onDoubleClick={() => openWindow('typewriter')}
          />
          <DesktopIcon 
            id="queue"
            label="Live Queue"
            icon="🗃️"
            isSelected={selectedIcon === 'queue'}
            onSelect={() => setSelectedIcon('queue')}
            onDoubleClick={() => openWindow('queue')}
          />
          <DesktopIcon 
            id="automod"
            label="AutoMod Rules"
            icon="🛡️"
            isSelected={selectedIcon === 'automod'}
            onSelect={() => setSelectedIcon('automod')}
            onDoubleClick={() => openWindow('automod')}
          />
          <DesktopIcon 
            id="modlog"
            label="Mod Logs"
            icon="🖥️"
            isSelected={selectedIcon === 'modlog'}
            onSelect={() => setSelectedIcon('modlog')}
            onDoubleClick={() => openWindow('modlog')}
          />
          <DesktopIcon 
            id="usergrid"
            label="User Registry"
            icon="👥"
            isSelected={selectedIcon === 'usergrid'}
            onSelect={() => setSelectedIcon('usergrid')}
            onDoubleClick={() => openWindow('usergrid')}
          />
          <DesktopIcon 
            id="settings"
            label="Control Panel"
            icon="⚙️"
            isSelected={selectedIcon === 'settings'}
            onSelect={() => setSelectedIcon('settings')}
            onDoubleClick={() => openWindow('settings')}
          />
        </div>

        {/* ================================================= */}
        {/* ACTIVE WINDOWS CONTAINER                          */}
        {/* ================================================= */}

        {/* 1. ModAcademy window */}
        <RetroWindow
          id="academy"
          title={windows.academy.title}
          icon={windows.academy.icon}
          isOpen={windows.academy.isOpen}
          onClose={() => closeWindow('academy')}
          isActive={activeWindow === 'academy'}
          onFocus={() => focusWindow('academy')}
          isMinimized={windows.academy.isMinimized}
          isMaximized={windows.academy.isMaximized}
          onMinimize={() => minimizeWindow('academy')}
          onMaximize={() => maximizeWindow('academy')}
          defaultPosition={windows.academy.position}
          defaultSize={{ width: windows.academy.width, height: windows.academy.height }}
        >
          <ModAcademy 
            profile={profile}
            onProfileUpdate={handleProfileUpdate}
            triggerToast={triggerToast}
          />
        </RetroWindow>

        {/* 2. Consensus Voting Desk window */}
        <RetroWindow
          id="consensus"
          title={windows.consensus.title}
          icon={windows.consensus.icon}
          isOpen={windows.consensus.isOpen}
          onClose={() => closeWindow('consensus')}
          isActive={activeWindow === 'consensus'}
          onFocus={() => focusWindow('consensus')}
          isMinimized={windows.consensus.isMinimized}
          isMaximized={windows.consensus.isMaximized}
          onMinimize={() => minimizeWindow('consensus')}
          onMaximize={() => maximizeWindow('consensus')}
          defaultPosition={windows.consensus.position}
          defaultSize={{ width: windows.consensus.width, height: windows.consensus.height }}
        >
          <ConsensusDesk 
            profile={profile}
            triggerToast={triggerToast}
          />
        </RetroWindow>

        {/* 3. Typewriter Canned responses window */}
        <RetroWindow
          id="typewriter"
          title={windows.typewriter.title}
          icon={windows.typewriter.icon}
          isOpen={windows.typewriter.isOpen}
          onClose={() => closeWindow('typewriter')}
          isActive={activeWindow === 'typewriter'}
          onFocus={() => focusWindow('typewriter')}
          isMinimized={windows.typewriter.isMinimized}
          isMaximized={windows.typewriter.isMaximized}
          onMinimize={() => minimizeWindow('typewriter')}
          onMaximize={() => maximizeWindow('typewriter')}
          defaultPosition={windows.typewriter.position}
          defaultSize={{ width: windows.typewriter.width, height: windows.typewriter.height }}
        >
          <Typewriter triggerToast={triggerToast} />
        </RetroWindow>

        {/* 4. Live Queue Console window */}
        <RetroWindow
          id="queue"
          title={windows.queue.title}
          icon={windows.queue.icon}
          isOpen={windows.queue.isOpen}
          onClose={() => closeWindow('queue')}
          isActive={activeWindow === 'queue'}
          onFocus={() => focusWindow('queue')}
          isMinimized={windows.queue.isMinimized}
          isMaximized={windows.queue.isMaximized}
          onMinimize={() => minimizeWindow('queue')}
          onMaximize={() => maximizeWindow('queue')}
          defaultPosition={windows.queue.position}
          defaultSize={{ width: windows.queue.width, height: windows.windows ? '540px' : windows.queue.height }}
        >
          <QueueConsole 
            profile={profile}
            onProfileUpdate={handleProfileUpdate}
            triggerToast={triggerToast}
            mode={mode}
          />
        </RetroWindow>

        {/* 5. AutoModerator Rules window */}
        <RetroWindow
          id="automod"
          title={windows.automod.title}
          icon={windows.automod.icon}
          isOpen={windows.automod.isOpen}
          onClose={() => closeWindow('automod')}
          isActive={activeWindow === 'automod'}
          onFocus={() => focusWindow('automod')}
          isMinimized={windows.automod.isMinimized}
          isMaximized={windows.automod.isMaximized}
          onMinimize={() => minimizeWindow('automod')}
          onMaximize={() => maximizeWindow('automod')}
          defaultPosition={windows.automod.position}
          defaultSize={{ width: windows.automod.width, height: windows.automod.height }}
        >
          <AutomodPanel triggerToast={triggerToast} />
        </RetroWindow>

        {/* 6. Live Moderation Audit Stream window */}
        <RetroWindow
          id="modlog"
          title={windows.modlog.title}
          icon={windows.modlog.icon}
          isOpen={windows.modlog.isOpen}
          onClose={() => closeWindow('modlog')}
          isActive={activeWindow === 'modlog'}
          onFocus={() => focusWindow('modlog')}
          isMinimized={windows.modlog.isMinimized}
          isMaximized={windows.modlog.isMaximized}
          onMinimize={() => minimizeWindow('modlog')}
          onMaximize={() => maximizeWindow('modlog')}
          defaultPosition={windows.modlog.position}
          defaultSize={{ width: windows.modlog.width, height: windows.modlog.height }}
        >
          <ModLogConsole triggerToast={triggerToast} />
        </RetroWindow>

        {/* 7. Subreddit User Management window */}
        <RetroWindow
          id="usergrid"
          title={windows.usergrid.title}
          icon={windows.usergrid.icon}
          isOpen={windows.usergrid.isOpen}
          onClose={() => closeWindow('usergrid')}
          isActive={activeWindow === 'usergrid'}
          onFocus={() => focusWindow('usergrid')}
          isMinimized={windows.usergrid.isMinimized}
          isMaximized={windows.usergrid.isMaximized}
          onMinimize={() => minimizeWindow('usergrid')}
          onMaximize={() => maximizeWindow('usergrid')}
          defaultPosition={windows.usergrid.position}
          defaultSize={{ width: windows.usergrid.width, height: windows.usergrid.height }}
        >
          <UserControlRegistry triggerToast={triggerToast} />
        </RetroWindow>

        {/* 8. Control Panel / Settings window */}
        <RetroWindow
          id="settings"
          title={windows.settings.title}
          icon={windows.settings.icon}
          isOpen={windows.settings.isOpen}
          onClose={() => closeWindow('settings')}
          isActive={activeWindow === 'settings'}
          onFocus={() => focusWindow('settings')}
          isMinimized={windows.settings.isMinimized}
          isMaximized={windows.settings.isMaximized}
          onMinimize={() => minimizeWindow('settings')}
          onMaximize={() => maximizeWindow('settings')}
          defaultPosition={windows.settings.position}
          defaultSize={{ width: windows.settings.width, height: windows.settings.height }}
        >
          <SettingsPanel 
            settings={settings}
            onSettingsUpdate={(s) => setSettings(s)}
            profile={profile}
            triggerToast={triggerToast}
            onReset={onReset}
          />
        </RetroWindow>

        {/* 9. Static Audit Ticker Logs viewer window */}
        {auditsOpen && (
          <RetroWindow
            id="audits"
            title="Chronological Audit Events Registry"
            icon="📃"
            isOpen={auditsOpen}
            onClose={() => setAuditsOpen(false)}
            isActive={activeWindow === 'audits'}
            onFocus={() => setActiveWindow('audits')}
            defaultPosition={{ x: 100, y: 100 }}
            defaultSize={{ width: '640px', height: '460px' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%', fontFamily: "var(--font-body)" }}>
              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                <span style={{ fontSize: '8px', fontWeight: 700, color: 'var(--accent-gold)', fontFamily: "var(--font-heading)", letterSpacing: '0.15em' }}>
                  SECURITY SYSTEM AUDIT EVENTS REGISTRY
                </span>
              </div>
              <div style={{
                flexGrow: 1,
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                padding: '12px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                {auditTicker.map((audit) => (
                  <div key={audit.eventId} style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', lineHeight: '1.6', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                    <span style={{ color: 'var(--glass-text-muted)' }}>[{new Date(audit.createdAt).toLocaleTimeString()}]</span>{' '}
                    <span style={{
                      backgroundColor: 'rgba(217, 119, 6, 0.08)',
                      color: 'var(--accent-gold)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '8px',
                      fontWeight: 600,
                      margin: '0 4px'
                    }}>{audit.eventType.toUpperCase()}</span>{' '}
                    <span style={{ color: '#e5e7eb', fontWeight: 600 }}>{audit.actor}:</span>{' '}
                    <span style={{ color: 'var(--glass-text)' }}>{audit.summary}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="glass-btn primary" onClick={() => setAuditsOpen(false)}>DISMISS</button>
              </div>
            </div>
          </RetroWindow>
        )}

        {/* ================================================= */}
        {/* SLIDING CO-PILOT ASSISTANT SIDEBAR PANEL          */}
        {/* ================================================= */}
        <div style={{
          position: 'absolute',
          top: 0,
          right: copilotOpen ? 0 : '-360px',
          width: '350px',
          height: '100%',
          zIndex: 99999,
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(30px)',
          WebkitBackdropFilter: 'blur(30px)',
          borderLeft: '1px solid var(--glass-border)',
          boxShadow: '-10px 0 30px rgba(0, 0, 0, 0.4)',
          transition: 'right 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
          padding: '20px'
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '12px', marginBottom: '16px' }}>
            <span style={{ fontSize: '9px', fontWeight: 700, fontFamily: "var(--font-heading)", color: 'var(--accent-gold)', letterSpacing: '0.15em', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>💬</span> SUBREDDIT CO-PILOT
            </span>
            <button 
              onClick={() => setCopilotOpen(false)}
              style={{ background: 'none', border: 'none', color: 'var(--glass-text-muted)', fontSize: '20px', cursor: 'pointer', outline: 'none' }}
            >
              ×
            </button>
          </div>

          {/* Messages list */}
          <div style={{
            flexGrow: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            paddingRight: '4px',
            marginBottom: '16px'
          }}>
            {copilotMessages.map((m, idx) => (
              <div 
                key={idx}
                style={{
                  alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  background: m.sender === 'user' ? 'rgba(217, 119, 6, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                  border: m.sender === 'user' ? '1px solid rgba(217, 119, 6, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  fontSize: '12px',
                  fontFamily: 'var(--font-body)',
                  lineHeight: '1.5',
                  color: '#ffffff',
                  whiteSpace: 'pre-line'
                }}
              >
                {m.text}
              </div>
            ))}
            {isTyping && (
              <div style={{ alignSelf: 'flex-start', background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '10px 14px', fontSize: '11px', color: '#94a3b8' }}>
                Copilot is composing advice...
              </div>
            )}
          </div>

          {/* Suggestion Prompts */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
            <span style={{ fontSize: '8px', fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--glass-text-muted)', letterSpacing: '0.1em' }}>QUICK CONSOLE RUNS</span>
            <button 
              onClick={() => handleAskCopilot("Analyze the current pending moderator Queue items")}
              className="glass-btn" 
              style={{ fontSize: '10px', padding: '6px 12px', justifyContent: 'flex-start', textAlign: 'left' }}
            >
              📊 Queue summary check
            </button>
            <button 
              onClick={() => handleAskCopilot("Draft a Rule 1 warning canned template response")}
              className="glass-btn" 
              style={{ fontSize: '10px', padding: '6px 12px', justifyContent: 'flex-start', textAlign: 'left' }}
            >
              📝 Draft warning macro reply
            </button>
            <button 
              onClick={() => handleAskCopilot("Recommend rule action for u/AggressiveTroll scenario")}
              className="glass-btn" 
              style={{ fontSize: '10px', padding: '6px 12px', justifyContent: 'flex-start', textAlign: 'left' }}
            >
              ⚖️ Rule suggestion on abuse case
            </button>
          </div>

          {/* Input field */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <input 
              type="text"
              placeholder="Ask Subreddit AI..."
              value={copilotInput}
              onChange={(e) => setCopilotInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAskCopilot(copilotInput)}
              className="glass-input"
              style={{ padding: '8px 12px' }}
            />
            <button 
              onClick={() => handleAskCopilot(copilotInput)}
              className="glass-btn primary"
              style={{ padding: '0 12px' }}
            >
              ➜
            </button>
          </div>
        </div>

      </div>

      {/* ================================================= */}
      {/* 4. BOTTOM FLOATING APP DOCK (macOS/WebOS style)    */}
      {/* ================================================= */}
      <div 
        style={{
          position: 'absolute',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 99999
        }}
      >
        <div className="floating-dock">
          {([
            { id: 'academy', label: 'ModAcademy (Shift Practice)', icon: '🎓' },
            { id: 'consensus', label: 'Consensus Desk (Ballots)', icon: '⚖️' },
            { id: 'typewriter', label: 'Typewriter (Canned Rules)', icon: '⌨️' },
            { id: 'queue', label: 'Priority Queue (Live Mod)', icon: '🗃️' },
            { id: 'automod', label: 'AutoMod Rules (YAML)', icon: '🛡️' },
            { id: 'modlog', label: 'Audit Log Stream (Live)', icon: '🖥️' },
            { id: 'usergrid', label: 'User Registry (Bans)', icon: '👥' },
            { id: 'settings', label: 'Control Panel (Settings)', icon: '⚙️' }
          ] as const).map((item) => {
            const win = windows[item.id];
            const isOpen = win.isOpen;
            const isMinimized = win.isMinimized;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (!isOpen) {
                    openWindow(item.id);
                  } else {
                    toggleMinimize(item.id);
                  }
                }}
                className="dock-item"
                data-label={item.label}
                style={{ 
                  outline: 'none',
                  background: isMinimized ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
                  transform: isMinimized ? 'scale(0.95)' : 'scale(1)'
                }}
              >
                <span style={{ fontSize: '24px' }}>{item.icon}</span>
                {isOpen && (
                  <span 
                    className="dock-dot" 
                    style={{ 
                      backgroundColor: isMinimized ? 'rgba(255, 255, 255, 0.4)' : 'var(--accent-gold)',
                      boxShadow: isMinimized ? 'none' : '0 0 8px var(--accent-gold)'
                    }} 
                  />
                )}
              </button>
            );
          })}
          
          <div style={{ width: '1px', height: '24px', backgroundColor: 'rgba(255,255,255,0.12)', margin: '0 4px' }} />

          {/* Audit log dock icon */}
          <button
            onClick={() => setAuditsOpen(true)}
            className="dock-item"
            data-label="Audit Events Logs"
            style={{ outline: 'none' }}
          >
            <span style={{ fontSize: '24px' }}>📃</span>
            {auditsOpen && <span className="dock-dot" />}
          </button>

          {/* AI Copilot toggle icon */}
          <button
            onClick={() => setCopilotOpen(!copilotOpen)}
            className="dock-item"
            data-label="AI Operations Copilot"
            style={{ 
              outline: 'none', 
              background: copilotOpen ? 'rgba(217, 119, 6, 0.15)' : 'transparent',
              borderColor: copilotOpen ? 'rgba(217, 119, 6, 0.3)' : 'transparent'
            }}
          >
            <span style={{ fontSize: '24px' }}>💬</span>
          </button>
        </div>
      </div>
    </div>
  );
};
