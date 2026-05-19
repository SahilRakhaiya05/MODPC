import React, { useEffect, useMemo, useState } from 'react';
import type { AppSettings, AuditEvent, ModeratorProfile, SystemStatus } from '../types';
import { api } from '../utils/api';
import { RetroWindow } from './RetroWindow';
import { ModAcademy } from '../modules/ModAcademy';
import { ConsensusDesk } from '../modules/ConsensusDesk';
import { Typewriter } from '../modules/Typewriter';
import { QueueConsole } from '../modules/QueueConsole';
import { SettingsPanel } from '../modules/SettingsPanel';
import { AutomodPanel } from '../modules/AutomodPanel';
import { ModLogConsole } from '../modules/ModLogConsole';
import { UserControlRegistry } from '../modules/UserControlRegistry';

type WindowId =
  | 'academy'
  | 'consensus'
  | 'typewriter'
  | 'queue'
  | 'settings'
  | 'automod'
  | 'modlog'
  | 'usergrid';

type WindowInfo = {
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  title: string;
  icon: string;
  width: string;
  height: string;
  position: { x: number; y: number };
};

type WindowState = Record<WindowId, WindowInfo>;

type DesktopShellProps = {
  statusData: SystemStatus;
  triggerToast: (msg: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
  onReset: () => void;
};

const moduleMeta: Array<{
  id: WindowId;
  eyebrow: string;
  title: string;
  copy: string;
  metric: string;
  trend: string;
  tone: string;
}> = [
  {
    id: 'queue',
    eyebrow: 'Review loop',
    title: 'Priority Queue',
    copy: 'Rank reports by risk, age, and moderation confidence before taking action.',
    metric: '12',
    trend: '+4 urgent',
    tone: 'orange',
  },
  {
    id: 'academy',
    eyebrow: 'Training',
    title: 'Mod Academy',
    copy: 'Run realistic scenarios and build moderator judgment with feedback.',
    metric: '86%',
    trend: 'accuracy',
    tone: 'green',
  },
  {
    id: 'consensus',
    eyebrow: 'Governance',
    title: 'Consensus Desk',
    copy: 'Collect votes for high-impact actions with a clean audit trail.',
    metric: '3',
    trend: 'open ballots',
    tone: 'blue',
  },
  {
    id: 'typewriter',
    eyebrow: 'Templates',
    title: 'Typewriter',
    copy: 'Compose policy-safe replies and reusable moderator macros.',
    metric: '18',
    trend: 'macros',
    tone: 'purple',
  },
  {
    id: 'automod',
    eyebrow: 'Policy engine',
    title: 'AutoMod Rules',
    copy: 'Prototype YAML rules and review rule intent before shipping.',
    metric: '7',
    trend: 'checks',
    tone: 'red',
  },
  {
    id: 'modlog',
    eyebrow: 'Auditability',
    title: 'Mod Logs',
    copy: 'Watch recent actions, state changes, and traceable moderation events.',
    metric: '42',
    trend: 'events',
    tone: 'gray',
  },
  {
    id: 'usergrid',
    eyebrow: 'User ops',
    title: 'User Registry',
    copy: 'Review status, notes, history, and ban/mute context in one place.',
    metric: '128',
    trend: 'profiles',
    tone: 'teal',
  },
  {
    id: 'settings',
    eyebrow: 'Workspace',
    title: 'Control Panel',
    copy: 'Tune thresholds, training requirements, and subreddit workspace settings.',
    metric: '9',
    trend: 'controls',
    tone: 'yellow',
  },
];

const initialWindows: WindowState = {
  academy: { isOpen: false, isMinimized: false, isMaximized: false, title: 'Mod Academy', icon: 'EDU', width: '760px', height: '560px', position: { x: 84, y: 82 } },
  consensus: { isOpen: false, isMinimized: false, isMaximized: false, title: 'Consensus Desk', icon: 'VOTE', width: '780px', height: '560px', position: { x: 118, y: 96 } },
  typewriter: { isOpen: false, isMinimized: false, isMaximized: false, title: 'Typewriter Templates', icon: 'TXT', width: '760px', height: '560px', position: { x: 152, y: 110 } },
  queue: { isOpen: false, isMinimized: false, isMaximized: false, title: 'Priority Queue', icon: 'Q', width: '800px', height: '580px', position: { x: 96, y: 76 } },
  settings: { isOpen: false, isMinimized: false, isMaximized: false, title: 'Control Panel', icon: 'CFG', width: '660px', height: '520px', position: { x: 210, y: 126 } },
  automod: { isOpen: false, isMinimized: false, isMaximized: false, title: 'AutoMod Rules', icon: 'YAML', width: '820px', height: '600px', position: { x: 132, y: 94 } },
  modlog: { isOpen: false, isMinimized: false, isMaximized: false, title: 'Moderation Audit Stream', icon: 'LOG', width: '820px', height: '560px', position: { x: 166, y: 108 } },
  usergrid: { isOpen: false, isMinimized: false, isMaximized: false, title: 'User Registry', icon: 'USR', width: '860px', height: '600px', position: { x: 118, y: 90 } },
};

export const DesktopShell: React.FC<DesktopShellProps> = ({ statusData, triggerToast, onReset }) => {
  const [settings, setSettings] = useState<AppSettings>(statusData.settings);
  const [profile, setProfile] = useState<ModeratorProfile>(statusData.moderatorProfile);
  const [auditTicker, setAuditTicker] = useState<AuditEvent[]>(statusData.recentAudits ?? []);
  const [mode, setMode] = useState<'demo' | 'live'>('demo');
  const [windows, setWindows] = useState<WindowState>(initialWindows);
  const [activeWindow, setActiveWindow] = useState<WindowId | 'audits' | ''>('');
  const [auditsOpen, setAuditsOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotInput, setCopilotInput] = useState('');
  const [messages, setMessages] = useState<Array<{ sender: 'ai' | 'user'; text: string }>>([
    {
      sender: 'ai',
      text: 'Ask me for queue summaries, rule suggestions, or a calmer moderator reply. I will keep it short and actionable.',
    },
  ]);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'posthog');
  }, []);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    const fetchAudits = async () => {
      try {
        const data = await api.getAudits();
        setAuditTicker(data.audits);
      } catch (err) {
        console.error(err);
      }
    };

    void fetchAudits();
    const interval = window.setInterval(() => {
      void fetchAudits();
    }, 8000);
    return () => window.clearInterval(interval);
  }, []);

  const accuracy = profile.totalScenarios > 0
    ? Math.round((profile.correctScenarios / profile.totalScenarios) * 100)
    : 0;

  const dateLabel = useMemo(() => {
    return now.toLocaleString('en-US', {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  }, [now]);

  const openWindow = (id: WindowId) => {
    setWindows((prev) => ({
      ...prev,
      [id]: { ...prev[id], isOpen: true, isMinimized: false },
    }));
    setActiveWindow(id);
  };

  const closeWindow = (id: WindowId) => {
    setWindows((prev) => ({
      ...prev,
      [id]: { ...prev[id], isOpen: false, isMaximized: false, isMinimized: false },
    }));
    setActiveWindow((current) => current === id ? '' : current);
  };

  const minimizeWindow = (id: WindowId) => {
    setWindows((prev) => ({
      ...prev,
      [id]: { ...prev[id], isMinimized: true },
    }));
    setActiveWindow((current) => current === id ? '' : current);
  };

  const toggleMinimize = (id: WindowId) => {
    setWindows((prev) => {
      const win = prev[id];
      const next = !win.isOpen
        ? { ...win, isOpen: true, isMinimized: false }
        : { ...win, isMinimized: !win.isMinimized };
      return { ...prev, [id]: next };
    });
    setActiveWindow(id);
  };

  const maximizeWindow = (id: WindowId) => {
    setWindows((prev) => ({
      ...prev,
      [id]: { ...prev[id], isMaximized: !prev[id].isMaximized },
    }));
    setActiveWindow(id);
  };

  const handleProfileUpdate = (updatedProfile: ModeratorProfile) => {
    setProfile(updatedProfile);
  };

  const askCopilot = (text: string) => {
    const query = text.trim();
    if (!query) return;

    setMessages((prev) => [...prev, { sender: 'user', text: query }]);
    setCopilotInput('');

    const lower = query.toLowerCase();
    let reply = 'Workspace looks healthy. Queue risk is concentrated in recent reported comments, so start with Priority Queue and escalate anything that affects multiple users.';
    if (lower.includes('rule') || lower.includes('warning')) {
      reply = 'Suggested action: cite the closest community rule, keep the first sentence human, and avoid over-explaining. Use Typewriter to draft and save the reusable version.';
    }
    if (lower.includes('queue') || lower.includes('summary')) {
      reply = 'Queue summary: review high-report comments first, then check aging posts with repeated reports. Anything severe should move to Consensus Desk before a high-impact action.';
    }
    if (lower.includes('spam') || lower.includes('bot')) {
      reply = 'Spam pattern: compare author age, repeated links, and report reasons. If the pattern repeats, create an AutoMod rule draft and log the action for review.';
    }

    window.setTimeout(() => {
      setMessages((prev) => [...prev, { sender: 'ai', text: reply }]);
    }, 450);
  };

  const renderModule = (id: WindowId) => {
    if (id === 'academy') {
      return <ModAcademy profile={profile} onProfileUpdate={handleProfileUpdate} triggerToast={triggerToast} />;
    }
    if (id === 'consensus') {
      return <ConsensusDesk profile={profile} triggerToast={triggerToast} />;
    }
    if (id === 'typewriter') {
      return <Typewriter triggerToast={triggerToast} />;
    }
    if (id === 'queue') {
      return <QueueConsole profile={profile} onProfileUpdate={handleProfileUpdate} triggerToast={triggerToast} mode={mode} />;
    }
    if (id === 'settings') {
      return (
        <SettingsPanel
          settings={settings}
          onSettingsUpdate={(updatedSettings) => setSettings(updatedSettings)}
          profile={profile}
          triggerToast={triggerToast}
          onReset={onReset}
        />
      );
    }
    if (id === 'automod') {
      return <AutomodPanel triggerToast={triggerToast} />;
    }
    if (id === 'modlog') {
      return <ModLogConsole triggerToast={triggerToast} />;
    }
    return <UserControlRegistry triggerToast={triggerToast} />;
  };

  const leftDesktopItems = [
    { label: 'home.mdx', glyph: 'Aa', action: () => openWindow('queue') },
    { label: 'Mod OS', glyph: 'OS', action: () => openWindow('settings') },
    { label: 'Pricing', glyph: '$', action: () => openWindow('consensus') },
    { label: 'templates.mdx', glyph: 'MD', action: () => openWindow('typewriter') },
    { label: 'demo.mov', glyph: '▶', action: () => openWindow('academy') },
    { label: 'Docs', glyph: 'D', action: () => openWindow('automod') },
    { label: 'Talk to a human', glyph: '@', action: () => openWindow('usergrid') },
    { label: 'Ask a question', glyph: '?', action: () => setCopilotOpen(true) },
  ];

  const rightDesktopItems = [
    { label: 'Why ModDesk?', glyph: 'WHY', action: () => openWindow('academy') },
    { label: 'Changelog', glyph: 'LOG', action: () => setAuditsOpen(true) },
    { label: 'Team handbook', glyph: 'BK', action: () => openWindow('consensus') },
    { label: 'Store', glyph: 'BAG', action: () => openWindow('settings') },
    { label: 'Work here', glyph: 'JOB', action: () => openWindow('modlog') },
    { label: 'Trash', glyph: 'BIN', action: () => triggerToast('Nothing to empty. The workspace is tidy.', 'success') },
  ];

  return (
    <main className="ph-os-shell">
      <header className="ph-os-menubar">
        <div className="ph-os-menu-left">
          <button className="ph-mini-logo" onClick={() => openWindow('queue')} aria-label="Open queue">
            <span />
            <span />
            <span />
          </button>
          <button onClick={() => openWindow('settings')}>Product OS</button>
          <button onClick={() => openWindow('consensus')}>Pricing</button>
          <button onClick={() => openWindow('automod')}>Docs</button>
          <button onClick={() => openWindow('usergrid')}>Community</button>
          <button onClick={() => setAuditsOpen(true)}>Company</button>
          <button onClick={() => setCopilotOpen(true)}>More</button>
        </div>
        <div className="ph-os-menu-right">
          <button className="ph-top-cta" onClick={() => openWindow('queue')}>Get started - free</button>
          <button className="ph-round-btn" onClick={() => setCopilotOpen(true)} aria-label="Search">⌕</button>
          <button className="ph-round-btn" onClick={() => setCopilotOpen(true)} aria-label="Help">?</button>
          <button className="ph-ticket-btn" onClick={() => setAuditsOpen(true)}>{auditTicker.length || 1}</button>
          <button className="ph-round-btn" onClick={() => openWindow('settings')} aria-label="Profile">{profile.username.slice(0, 1).toUpperCase()}</button>
        </div>
      </header>

      <section className="ph-desktop-icons left" aria-label="Desktop files">
        {leftDesktopItems.map((item) => (
          <button key={item.label} className="ph-file-icon" onClick={item.action}>
            <span className="ph-file-art">{item.glyph}</span>
            <strong>{item.label}</strong>
          </button>
        ))}
      </section>

      <section className="ph-desktop-icons right" aria-label="Desktop folders">
        {rightDesktopItems.map((item) => (
          <button key={item.label} className="ph-file-icon" onClick={item.action}>
            <span className="ph-file-art folder">{item.glyph}</span>
            <strong>{item.label}</strong>
          </button>
        ))}
      </section>

      <section className="ph-home-window" aria-label="home.mdx">
        <div className="ph-home-titlebar">
          <button className="ph-doc-button" aria-label="home file">▣</button>
          <strong>home.mdx⌄</strong>
          <div className="ph-window-actions" aria-hidden="true">
            <span>—</span>
            <span>□</span>
            <span>×</span>
          </div>
        </div>
        <div className="ph-editor-toolbar">
          <button>↶</button>
          <button>↷</button>
          <span />
          <button>Zoom⌄</button>
          <button>B</button>
          <button><i>I</i></button>
          <button><u>U</u></button>
          <button>Font⌄</button>
          <button>☰</button>
          <button>≡</button>
          <button>⌕</button>
          <button>⚙</button>
          <button className="ph-top-cta" onClick={() => openWindow('queue')}>Get started - free</button>
        </div>
        <div className="ph-doc-scroll">
          <div className="ph-tabs">
            <button className="active">Understand product usage</button>
            <button onClick={() => openWindow('queue')}>One place for mod data</button>
            <button onClick={() => openWindow('modlog')}>Debug & fix issues</button>
            <button onClick={() => openWindow('consensus')}>Test & roll out changes</button>
          </div>

          <section className="ph-blue-stage">
            <button className="ph-pause" aria-label="Pause">Ⅱ</button>
            <div className="ph-stage-copy">
              <h1>Understand what your community is doing</h1>
              <p>Measure reports, queue movement, rule confidence, moderator training, and user history from one playful desktop.</p>
            </div>
            <div className="ph-stage-copy">
              <p>ModDesk can help your team decide faster, keep a paper trail, and build better subreddit operations with AI-assisted workflows.</p>
            </div>

            <div className="ph-product-orbit">
              <div className="ph-orbit-links left-links">
                {moduleMeta.slice(0, 4).map((item) => (
                  <button key={item.id} onClick={() => openWindow(item.id)}>
                    <span className={`ph-dot ${item.tone}`} />
                    {item.title}
                  </button>
                ))}
              </div>

              <div className="ph-builder-card">
                <div className="ph-builder-mark">
                  <span />
                  <span />
                  <span />
                </div>
                <h2>Hello, moderator!</h2>
                <label>
                  <span>⌕</span>
                  <input
                    value={copilotInput}
                    onChange={(event) => setCopilotInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        askCopilot(copilotInput);
                        setCopilotOpen(true);
                      }
                    }}
                    placeholder="What can I help you with?"
                  />
                </label>
                <div className="ph-command-hint"><kbd>/</kbd> For commands</div>
                <div className="ph-builder-actions">
                  <button onClick={() => openWindow('academy')}>Learn</button>
                  <button onClick={() => openWindow('automod')}>Build</button>
                  <button onClick={() => setAuditsOpen(true)}>Signals</button>
                </div>
              </div>

              <div className="ph-orbit-links right-links">
                {moduleMeta.slice(4).map((item) => (
                  <button key={item.id} onClick={() => openWindow(item.id)}>
                    <span className={`ph-dot ${item.tone}`} />
                    {item.title}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="ph-os-section-grid">
            <div className="ph-os-section-copy">
              <h2>The new way to moderate communities</h2>
              <p>Moderation used to mean jumping between queues, logs, wiki pages, user profiles, modmail, and spreadsheets. ModDesk turns it into a single operating system.</p>
              <div className="ph-install-card">
                <span>Install with AI in a single prompt</span>
                <code>npx devvit playtest</code>
              </div>
            </div>
            <div className="ph-mini-stats">
              <button onClick={() => openWindow('academy')}><strong>{accuracy}%</strong><span>training accuracy</span></button>
              <button onClick={() => openWindow('queue')}><strong>{profile.queueReviewed}</strong><span>queue reviews</span></button>
              <button onClick={() => openWindow('consensus')}><strong>{profile.consensusVotesCast}</strong><span>votes cast</span></button>
            </div>
          </section>

          <section className="ph-using">
            <h2>Who's using ModDesk?</h2>
            <p>Teams that want moderation to feel less like tab juggling and more like a proper product cockpit.</p>
            <div className="ph-customer-row">
              {['r/ProductMods', 'r/Builders', 'r/LaunchOps', 'r/CommunityHQ', 'r/Signals'].map((name) => (
                <button key={name} onClick={() => openWindow('usergrid')}>{name}</button>
              ))}
            </div>
          </section>
        </div>
      </section>

      <div className="ph-command-bar">
        {moduleMeta.map((item) => {
          const win = windows[item.id];
          return (
            <button
              key={item.id}
              className={win.isOpen && !win.isMinimized ? 'active' : ''}
              title={item.title}
              onClick={() => toggleMinimize(item.id)}
            >
              {windows[item.id].icon}
            </button>
          );
        })}
        <button className={copilotOpen ? 'active' : ''} title="Copilot" onClick={() => setCopilotOpen((open) => !open)}>AI</button>
      </div>

      {moduleMeta.map((item) => {
        const win = windows[item.id];
        return (
          <RetroWindow
            key={item.id}
            id={item.id}
            title={win.title}
            icon={win.icon}
            isOpen={win.isOpen}
            onClose={() => closeWindow(item.id)}
            isActive={activeWindow === item.id}
            onFocus={() => setActiveWindow(item.id)}
            isMinimized={win.isMinimized}
            isMaximized={win.isMaximized}
            onMinimize={() => minimizeWindow(item.id)}
            onMaximize={() => maximizeWindow(item.id)}
            defaultPosition={win.position}
            defaultSize={{ width: win.width, height: win.height }}
          >
            {renderModule(item.id)}
          </RetroWindow>
        );
      })}

      {auditsOpen && (
        <RetroWindow
          id="audits"
          title="Audit Events"
          icon="LOG"
          isOpen={auditsOpen}
          onClose={() => setAuditsOpen(false)}
          isActive={activeWindow === 'audits'}
          onFocus={() => setActiveWindow('audits')}
          defaultPosition={{ x: 130, y: 92 }}
          defaultSize={{ width: '680px', height: '500px' }}
        >
          <div className="ph-window-list">
            {auditTicker.map((audit) => (
              <div key={audit.eventId}>
                <span>{new Date(audit.createdAt).toLocaleString()}</span>
                <strong>{audit.actor} · {audit.eventType}</strong>
                <p>{audit.summary}</p>
              </div>
            ))}
          </div>
        </RetroWindow>
      )}

      <aside className={`ph-copilot ${copilotOpen ? 'open' : ''}`} aria-label="AI moderation copilot">
        <div className="ph-copilot-head">
          <div>
            <span className="ph-kicker">AI assistant</span>
            <strong>Mod Copilot</strong>
          </div>
          <button onClick={() => setCopilotOpen(false)}>Close</button>
        </div>

        <div className="ph-chat">
          {messages.map((message, index) => (
            <div key={index} className={message.sender === 'user' ? 'user' : ''}>
              {message.text}
            </div>
          ))}
        </div>

        <div className="ph-prompts">
          <button onClick={() => askCopilot('Summarize the queue')}>Queue summary</button>
          <button onClick={() => askCopilot('Draft a warning')}>Draft warning</button>
          <button onClick={() => askCopilot('Find spam pattern')}>Spam pattern</button>
        </div>

        <div className="ph-chat-input">
          <input
            value={copilotInput}
            onChange={(event) => setCopilotInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') askCopilot(copilotInput);
            }}
            placeholder="Ask for a moderation readout"
          />
          <button onClick={() => askCopilot(copilotInput)}>Send</button>
        </div>
      </aside>
    </main>
  );
};
