import React, { useEffect, useMemo, useState } from 'react';
import type { AppSettings, AuditEvent, ModeratorProfile, QueueItem, SystemStatus } from '../types';
import { api } from '../utils/api';
import { RetroWindow } from './RetroWindow';
import { QueueConsole } from '../modules/QueueConsole';
import { ModmailHub } from '../modules/ModmailHub';
import { AutomodPanel } from '../modules/AutomodPanel';
import { InsightsPanel } from '../modules/InsightsPanel';
import { Typewriter } from '../modules/Typewriter';
import { ModLogConsole } from '../modules/ModLogConsole';
import { UserControlRegistry } from '../modules/UserControlRegistry';
import { SettingsPanel } from '../modules/SettingsPanel';
import { ConsensusDesk } from '../modules/ConsensusDesk';
import { ModAcademy } from '../modules/ModAcademy';

type WindowId =
  | 'queue'
  | 'modmail'
  | 'automod'
  | 'insights'
  | 'typewriter'
  | 'modlog'
  | 'usergrid'
  | 'settings'
  | 'consensus'
  | 'academy';

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

type DesktopShellProps = {
  statusData: SystemStatus;
  triggerToast: (msg: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
  onReset: () => void;
};

type ModuleId = Exclude<WindowId, 'consensus' | 'academy'>;

type ProductModule = {
  id: ModuleId;
  file: string;
  label: string;
  description: string;
  icon: string;
  category: 'Overview' | 'Moderation' | 'Content' | 'Community Apps' | 'Settings' | 'Support';
  aliases: string[];
};

type HomeStats = {
  queueOpen: number;
  queueCritical: number;
  modmailOpen: number;
  modlogCount: number;
  automodState: 'live' | 'empty' | 'unavailable';
  latestQueue: QueueItem[];
  loadedAt: string;
};

const makeWindow = (
  title: string,
  icon: string,
  width: string,
  height: string,
  x: number,
  y: number
): WindowInfo => ({
  isOpen: false,
  isMinimized: false,
  isMaximized: false,
  title,
  icon,
  width,
  height,
  position: { x, y },
});

const initialWindows: Record<WindowId, WindowInfo> = {
  queue: makeWindow('Needs Review', 'Q', '900px', '610px', 90, 72),
  modmail: makeWindow('Mod Mail', 'MAIL', '1080px', '650px', 110, 82),
  automod: makeWindow('Automod YAML', 'YAML', '860px', '620px', 132, 94),
  insights: makeWindow('Insights Graph', 'GRAPH', '900px', '620px', 148, 104),
  typewriter: makeWindow('Saved Responses', 'MD', '780px', '560px', 152, 110),
  modlog: makeWindow('Modlog Feed', 'LOG', '860px', '580px', 166, 108),
  usergrid: makeWindow('Users DB', 'DB', '900px', '620px', 118, 90),
  settings: makeWindow('Settings System', 'SYS', '680px', '540px', 210, 126),
  consensus: makeWindow('Consensus Desk', 'VOTE', '800px', '580px', 118, 96),
  academy: makeWindow('Mod Academy', 'EDU', '780px', '560px', 84, 82),
};

const modules: ProductModule[] = [
  {
    id: 'queue',
    file: 'queue.mdx',
    label: 'Needs Review',
    description: 'Reported posts and comments, severity, rules, approve/remove/escalate.',
    icon: '/moddesk-icons/queue.png',
    category: 'Moderation',
    aliases: ['queue', 'reports', 'needs review', 'approve', 'remove'],
  },
  {
    id: 'modmail',
    file: 'modmail.app',
    label: 'Mod Mail',
    description: 'Read, reply, archive, and use saved moderator responses.',
    icon: '/moddesk-icons/modmail.png',
    category: 'Support',
    aliases: ['mail', 'modmail', 'inbox', 'reply'],
  },
  {
    id: 'automod',
    file: 'automod.yml',
    label: 'Automod',
    description: 'Read and save wiki/config/automoderator with audit trail.',
    icon: '/moddesk-icons/automod.png',
    category: 'Content',
    aliases: ['automod', 'yaml', 'wiki', 'config'],
  },
  {
    id: 'typewriter',
    file: 'saved-responses.md',
    label: 'Saved Responses',
    description: 'Reusable removal, appeal, redirect, and education templates.',
    icon: '/moddesk-icons/saved-responses.png',
    category: 'Moderation',
    aliases: ['responses', 'templates', 'saved'],
  },
  {
    id: 'modlog',
    file: 'modlog.feed',
    label: 'Mod Log',
    description: 'Live moderation log plus ModDesk audit entries.',
    icon: '/moddesk-icons/modlog.png',
    category: 'Overview',
    aliases: ['log', 'modlog', 'audit'],
  },
  {
    id: 'usergrid',
    file: 'users.db',
    label: 'Users',
    description: 'Banned, muted, approved, and moderator registries.',
    icon: '/moddesk-icons/users.png',
    category: 'Community Apps',
    aliases: ['users', 'ban', 'mute', 'approved', 'moderators'],
  },
  {
    id: 'insights',
    file: 'insights.graph',
    label: 'Insights',
    description: 'Derived queue pressure, modlog activity, and rule pressure.',
    icon: '/moddesk-icons/insights.png',
    category: 'Overview',
    aliases: ['insights', 'graph', 'summary', 'pressure'],
  },
  {
    id: 'settings',
    file: 'settings.sys',
    label: 'Settings',
    description: 'Subreddit-scoped configuration, mode, training, and reset controls.',
    icon: '/moddesk-icons/settings.png',
    category: 'Settings',
    aliases: ['settings', 'system', 'config'],
  },
];

const mainTabs: Array<{ id: WindowId; label: string }> = [
  { id: 'queue', label: 'Needs Review' },
  { id: 'modmail', label: 'Mod Mail' },
  { id: 'automod', label: 'Automod' },
  { id: 'insights', label: 'Insights' },
  { id: 'typewriter', label: 'Saved Responses' },
];

const windowIds: WindowId[] = [
  'queue',
  'modmail',
  'automod',
  'insights',
  'typewriter',
  'modlog',
  'usergrid',
  'settings',
  'consensus',
  'academy',
];

const categories: Array<{ id: WindowId; label: ProductModule['category']; glyph: string }> = [
  { id: 'insights', label: 'Overview', glyph: 'OVR' },
  { id: 'queue', label: 'Moderation', glyph: 'MOD' },
  { id: 'automod', label: 'Content', glyph: 'CNT' },
  { id: 'usergrid', label: 'Community Apps', glyph: 'APP' },
  { id: 'settings', label: 'Settings', glyph: 'SYS' },
  { id: 'modmail', label: 'Support', glyph: 'SUP' },
];

const fallbackStats = (auditCount: number): HomeStats => ({
  queueOpen: 0,
  queueCritical: 0,
  modmailOpen: 0,
  modlogCount: auditCount,
  automodState: 'unavailable',
  latestQueue: [],
  loadedAt: new Date().toISOString(),
});

export const DesktopShell: React.FC<DesktopShellProps> = ({ statusData, triggerToast, onReset }) => {
  const [settings, setSettings] = useState<AppSettings>(statusData.settings);
  const [profile, setProfile] = useState<ModeratorProfile>(statusData.moderatorProfile);
  const [auditTicker, setAuditTicker] = useState<AuditEvent[]>(statusData.recentAudits ?? []);
  const [homeStats, setHomeStats] = useState<HomeStats>(() => fallbackStats(statusData.recentAudits?.length ?? 0));
  const [mode, setMode] = useState<'demo' | 'live'>('live');
  const [windows, setWindows] = useState<Record<WindowId, WindowInfo>>({
    ...initialWindows,
    queue: { ...initialWindows.queue, isOpen: true },
  });
  const [activeWindow, setActiveWindow] = useState<WindowId | 'audits' | ''>('queue');
  const [auditsOpen, setAuditsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandInput, setCommandInput] = useState('');
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'posthog');
  }, []);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    const loadHomeStats = async () => {
      const [queueResult, modmailResult, modlogResult, automodResult] = await Promise.allSettled([
        api.getQueue(),
        api.getLiveModmail(),
        api.getLiveModlog(),
        api.getAutomod(),
      ]);

      const queue = queueResult.status === 'fulfilled' ? queueResult.value.queue : [];
      const activeQueue = queue.filter((item) => item.status === 'new' || item.status === 'reviewing');
      const latestQueue = activeQueue.slice(0, 4);
      const modmailOpen = modmailResult.status === 'fulfilled'
        ? modmailResult.value.conversations.filter((thread) => thread.folder !== 'archived').length
        : 0;
      const modlogCount = modlogResult.status === 'fulfilled' ? modlogResult.value.logs.length : auditTicker.length;
      const automodState = automodResult.status === 'fulfilled'
        ? automodResult.value.content.trim().length > 0 ? 'live' : 'empty'
        : 'unavailable';

      setHomeStats({
        queueOpen: activeQueue.length,
        queueCritical: activeQueue.filter((item) => item.severity === 'critical').length,
        modmailOpen,
        modlogCount,
        automodState,
        latestQueue,
        loadedAt: new Date().toISOString(),
      });
    };

    void loadHomeStats();
    const interval = window.setInterval(() => void loadHomeStats(), 15000);
    return () => window.clearInterval(interval);
  }, [auditTicker.length]);

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
    const interval = window.setInterval(() => void fetchAudits(), 8000);
    return () => window.clearInterval(interval);
  }, []);

  const dateLabel = useMemo(
    () => now.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }),
    [now]
  );
  const visibleAudits = auditTicker.slice(0, 5);
  const subredditLabel = `r/${settings.subredditName}`;

  const openWindow = (target: WindowId) => {
    setWindows((prev) => ({ ...prev, [target]: { ...prev[target], isOpen: true, isMinimized: false } }));
    setActiveWindow(target);
  };

  const closeWindow = (target: WindowId) => {
    setWindows((prev) => ({ ...prev, [target]: { ...prev[target], isOpen: false, isMaximized: false, isMinimized: false } }));
    setActiveWindow((current) => (current === target ? '' : current));
  };

  const minimizeWindow = (target: WindowId) => {
    setWindows((prev) => ({ ...prev, [target]: { ...prev[target], isMinimized: true } }));
    setActiveWindow((current) => (current === target ? '' : current));
  };

  const toggleMinimize = (target: WindowId) => {
    setWindows((prev) => {
      const win = prev[target];
      return { ...prev, [target]: win.isOpen ? { ...win, isMinimized: !win.isMinimized } : { ...win, isOpen: true, isMinimized: false } };
    });
    setActiveWindow(target);
  };

  const maximizeWindow = (target: WindowId) => {
    setWindows((prev) => ({ ...prev, [target]: { ...prev[target], isMaximized: !prev[target].isMaximized } }));
    setActiveWindow(target);
  };

  const runCommand = (value: string) => {
    const query = value.trim().toLowerCase();
    if (!query) return;
    const match = modules.find((module) =>
      [module.label, module.file, module.category, ...module.aliases].some((candidate) => candidate.toLowerCase().includes(query))
    );
    if (match) {
      openWindow(match.id);
      setCommandOpen(false);
      setCommandInput('');
      return;
    }
    if (query.includes('audit') || query.includes('recent')) {
      setAuditsOpen(true);
      setCommandOpen(false);
      setCommandInput('');
      return;
    }
    triggerToast('No matching ModDesk command found.', 'warning');
    setCommandInput('');
  };

  const renderModule = (target: WindowId) => {
    if (target === 'queue') return <QueueConsole profile={profile} onProfileUpdate={setProfile} triggerToast={triggerToast} mode={mode} />;
    if (target === 'modmail') return <ModmailHub triggerToast={triggerToast} />;
    if (target === 'automod') return <AutomodPanel triggerToast={triggerToast} />;
    if (target === 'insights') return <InsightsPanel triggerToast={triggerToast} />;
    if (target === 'typewriter') return <Typewriter triggerToast={triggerToast} />;
    if (target === 'modlog') return <ModLogConsole triggerToast={triggerToast} />;
    if (target === 'usergrid') return <UserControlRegistry triggerToast={triggerToast} />;
    if (target === 'settings') {
      return (
        <SettingsPanel
          settings={settings}
          onSettingsUpdate={setSettings}
          profile={profile}
          triggerToast={triggerToast}
          onReset={onReset}
        />
      );
    }
    if (target === 'consensus') return <ConsensusDesk profile={profile} triggerToast={triggerToast} />;
    return <ModAcademy profile={profile} onProfileUpdate={setProfile} triggerToast={triggerToast} />;
  };

  return (
    <main className="ph-os-shell">
      <header className="ph-os-menubar">
        <div className="ph-os-menu-left">
          <button className="ph-mini-logo" onClick={() => openWindow('queue')} aria-label="Open needs review">
            <span />
            <span />
            <span />
          </button>
          {categories.map((category) => (
            <button key={category.label} onClick={() => openWindow(category.id)}>{category.label}</button>
          ))}
        </div>
        <div className="ph-os-menu-right">
          <div className="ph-segmented compact">
            <button className={mode === 'demo' ? 'active' : ''} onClick={() => setMode('demo')}>Demo</button>
            <button className={mode === 'live' ? 'active live' : ''} onClick={() => setMode('live')}>Live</button>
          </div>
          <span className="ph-clock">{dateLabel}</span>
          <button className="ph-top-cta" onClick={() => openWindow('queue')}>{homeStats.queueOpen} Needs Review</button>
          <button className="ph-round-btn" onClick={() => setCommandOpen(true)} aria-label="Search">/</button>
          <button className="ph-ticket-btn" onClick={() => setAuditsOpen(true)}>{auditTicker.length || 0}</button>
          <button className="ph-round-btn" onClick={() => openWindow('settings')} aria-label="Profile">
            {profile.username.slice(0, 1).toUpperCase()}
          </button>
        </div>
      </header>

      <section className="ph-desktop-icons left" aria-label="Desktop files">
        {modules.map((item) => (
          <button key={item.file} className="ph-file-icon" onClick={() => openWindow(item.id)}>
            <span className="ph-file-art image"><img src={item.icon} alt="" /></span>
            <strong>{item.file}</strong>
          </button>
        ))}
      </section>

      <section className="ph-desktop-icons right" aria-label="Moderator categories">
        {categories.map((item) => (
          <button key={item.label} className="ph-file-icon" onClick={() => openWindow(item.id)}>
            <span className="ph-file-art folder">{item.glyph}</span>
            <strong>{item.label}</strong>
          </button>
        ))}
      </section>

      <section className="ph-home-window moddesk-home" aria-label="ModDesk home">
        <div className="ph-home-titlebar">
          <button className="ph-doc-button" onClick={() => openWindow('settings')} aria-label="ModDesk settings">MD</button>
          <strong>moddesk-os.sys</strong>
          <div className="ph-window-actions" aria-hidden="true">
            <span>-</span>
            <span>[]</span>
            <span>x</span>
          </div>
        </div>
        <div className="ph-editor-toolbar">
          {mainTabs.map((tab) => (
            <button key={tab.id} onClick={() => openWindow(tab.id)}>{tab.label}</button>
          ))}
          <button className="ph-top-cta" onClick={() => setCommandOpen(true)}>Command</button>
        </div>
        <div className="ph-doc-scroll">
          <section className="moddesk-command-center">
            <div className="moddesk-status-head">
              <div>
                <span className="ph-kicker">{subredditLabel} / live moderator workspace</span>
                <h1>ModDesk OS</h1>
                <p>One document-window workspace for the queues, mail, policy, users, logs, and response work your mod team actually touches.</p>
              </div>
              <div className="moddesk-session-card">
                <span>Active session</span>
                <strong>u/{profile.username}</strong>
                <em>{mode === 'live' ? 'Guarded live mode' : 'Local demo mode'}</em>
              </div>
            </div>

            <div className="moddesk-status-grid">
              <button onClick={() => openWindow('queue')} className={homeStats.queueCritical > 0 ? 'alert' : ''}>
                <span>Queue</span>
                <strong>{homeStats.queueOpen}</strong>
                <em>{homeStats.queueCritical} critical</em>
              </button>
              <button onClick={() => openWindow('modmail')}>
                <span>Modmail</span>
                <strong>{homeStats.modmailOpen}</strong>
                <em>open threads</em>
              </button>
              <button onClick={() => openWindow('automod')}>
                <span>Automod</span>
                <strong>{homeStats.automodState}</strong>
                <em>wiki/config/automoderator</em>
              </button>
              <button onClick={() => openWindow('modlog')}>
                <span>Activity</span>
                <strong>{homeStats.modlogCount}</strong>
                <em>modlog/audit signals</em>
              </button>
            </div>

            <div className="moddesk-product-grid">
              <section className="moddesk-module-board">
                {modules.map((module) => (
                  <button key={module.id} className="moddesk-module-tile" onClick={() => openWindow(module.id)}>
                    <img src={module.icon} alt="" />
                    <span>{module.category}</span>
                    <strong>{module.label}</strong>
                    <em>{module.description}</em>
                  </button>
                ))}
              </section>

              <aside className="moddesk-live-panel">
                <div className="ph-panel-title">
                  <span>Live workbench</span>
                  <button onClick={() => setCommandOpen(true)}>Search</button>
                </div>
                <div className="moddesk-queue-mini">
                  <span>Top queue items</span>
                  {homeStats.latestQueue.length === 0 ? (
                    <p>No open queue items returned for this subreddit.</p>
                  ) : (
                    homeStats.latestQueue.map((item) => (
                      <button key={item.itemId} onClick={() => openWindow('queue')}>
                        <strong>{item.reportCount} reports</strong>
                        <span>{item.title || item.bodyExcerpt}</span>
                      </button>
                    ))
                  )}
                </div>
                <div className="moddesk-activity-mini">
                  <span>Recent audit</span>
                  {visibleAudits.length === 0 ? (
                    <p>No audit entries yet.</p>
                  ) : (
                    visibleAudits.map((audit) => (
                      <button key={audit.eventId} onClick={() => setAuditsOpen(true)}>
                        <strong>{audit.eventType}</strong>
                        <span>{audit.summary}</span>
                      </button>
                    ))
                  )}
                </div>
              </aside>
            </div>
          </section>
        </div>
      </section>

      <div className="ph-command-bar">
        {mainTabs.map((item) => {
          const win = windows[item.id];
          return (
            <button
              key={item.id}
              className={win.isOpen && !win.isMinimized ? 'active' : ''}
              title={item.label}
              onClick={() => toggleMinimize(item.id)}
            >
              {win.icon}
            </button>
          );
        })}
        <button className={commandOpen ? 'active' : ''} title="Command" onClick={() => setCommandOpen((open) => !open)}>/</button>
      </div>

      {windowIds.map((item) => {
        const win = windows[item];
        return (
          <RetroWindow
            key={item}
            id={item}
            title={win.title}
            icon={win.icon}
            isOpen={win.isOpen}
            onClose={() => closeWindow(item)}
            isActive={activeWindow === item}
            onFocus={() => setActiveWindow(item)}
            isMinimized={win.isMinimized}
            isMaximized={win.isMaximized}
            onMinimize={() => minimizeWindow(item)}
            onMaximize={() => maximizeWindow(item)}
            defaultPosition={win.position}
            defaultSize={{ width: win.width, height: win.height }}
          >
            {renderModule(item)}
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
                <strong>{audit.actor} / {audit.eventType}</strong>
                <p>{audit.summary}</p>
              </div>
            ))}
          </div>
        </RetroWindow>
      )}

      {commandOpen && (
        <aside className="ph-copilot open" aria-label="ModDesk command palette">
          <div className="ph-copilot-head">
            <div>
              <span className="ph-kicker">Command palette</span>
              <strong>Open tools or summarize</strong>
            </div>
            <button onClick={() => setCommandOpen(false)}>Close</button>
          </div>
          <div className="ph-command-summary">
            <button onClick={() => openWindow('queue')}><strong>{homeStats.queueOpen}</strong><span>needs review</span></button>
            <button onClick={() => openWindow('modmail')}><strong>{homeStats.modmailOpen}</strong><span>modmail open</span></button>
            <button onClick={() => openWindow('modlog')}><strong>{auditTicker.length}</strong><span>audit events</span></button>
          </div>
          <div className="ph-prompts">
            {modules.map((module) => (
              <button key={module.id} onClick={() => openWindow(module.id)}>{module.label}</button>
            ))}
            <button onClick={() => setAuditsOpen(true)}>Audit feed</button>
          </div>
          <div className="ph-chat-input">
            <input
              value={commandInput}
              onChange={(event) => setCommandInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') runCommand(commandInput);
              }}
              placeholder="Try queue, modmail, users, automod..."
            />
            <button onClick={() => runCommand(commandInput)}>Run</button>
          </div>
          <p className="ph-command-footnote">Search opens real modules and live summaries only. Unsupported Reddit metrics stay unavailable instead of being invented.</p>
        </aside>
      )}
    </main>
  );
};
