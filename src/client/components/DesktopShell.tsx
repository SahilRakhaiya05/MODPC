import React, { useEffect, useMemo, useState } from 'react';
import type { AppSettings, AuditEvent, ModeratorProfile, QueueItem, SystemStatus } from '../types';
import type { SessionResponse } from '../../shared/api';
import { api } from '../utils/api';
import { RetroWindow } from './RetroWindow';
import { IdentityChip } from './IdentityChip';
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
import { NotificationDot } from './NotificationDot';

type WindowId =
  | 'home'
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
  session?: SessionResponse;
  triggerToast: (msg: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
  onReset: () => void;
};

type ModuleId = Exclude<WindowId, 'home' | 'consensus' | 'academy'>;

type ProductModule = {
  id: ModuleId;
  file: string;
  label: string;
  description: string;
  icon: string;
  tint: string;
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
  home: makeWindow('moddesk-os.sys', 'MD', '1200px', '760px', 0, 52),
  queue: makeWindow('Needs Review', 'Q', '900px', '610px', 90, 72),
  modmail: makeWindow('Mod Mail', 'MAIL', '1080px', '650px', 110, 82),
  automod: makeWindow('Automod YAML', 'YAML', '860px', '620px', 132, 94),
  insights: makeWindow('Insights Graph', 'GRAPH', '900px', '620px', 148, 104),
  typewriter: makeWindow('Saved Responses', 'MD', '980px', '640px', 152, 88),
  modlog: makeWindow('Modlog Feed', 'LOG', '860px', '580px', 166, 108),
  usergrid: makeWindow('Users DB', 'DB', '900px', '620px', 118, 90),
  settings: makeWindow('Settings System', 'SYS', '780px', '640px', 180, 82),
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
    tint: '#fde4dc',
    category: 'Moderation',
    aliases: ['queue', 'reports', 'needs review', 'approve', 'remove'],
  },
  {
    id: 'modmail',
    file: 'modmail.app',
    label: 'Mod Mail',
    description: 'Read, reply, archive, and use saved moderator responses.',
    icon: '/moddesk-icons/modmail.png',
    tint: '#dce8fb',
    category: 'Support',
    aliases: ['mail', 'modmail', 'inbox', 'reply'],
  },
  {
    id: 'automod',
    file: 'automod.yml',
    label: 'Automod',
    description: 'Read and save wiki/config/automoderator with audit trail.',
    icon: '/moddesk-icons/automod.png',
    tint: '#d8efd9',
    category: 'Content',
    aliases: ['automod', 'yaml', 'wiki', 'config'],
  },
  {
    id: 'typewriter',
    file: 'saved-responses.md',
    label: 'Saved Responses',
    description: 'Reusable removal, appeal, redirect, and education templates.',
    icon: '/moddesk-icons/saved-responses.png',
    tint: '#fdf1c8',
    category: 'Moderation',
    aliases: ['responses', 'templates', 'saved'],
  },
  {
    id: 'modlog',
    file: 'modlog.feed',
    label: 'Mod Log',
    description: 'Live moderation log plus ModDesk audit entries.',
    icon: '/moddesk-icons/modlog.png',
    tint: '#cfeceb',
    category: 'Overview',
    aliases: ['log', 'modlog', 'audit'],
  },
  {
    id: 'usergrid',
    file: 'users.db',
    label: 'Users',
    description: 'Banned, muted, approved, and moderator registries.',
    icon: '/moddesk-icons/users.png',
    tint: '#fbe1c9',
    category: 'Community Apps',
    aliases: ['users', 'ban', 'mute', 'approved', 'moderators'],
  },
  {
    id: 'insights',
    file: 'insights.graph',
    label: 'Insights',
    description: 'Derived queue pressure, modlog activity, and rule pressure.',
    icon: '/moddesk-icons/insights.png',
    tint: '#e6dbf9',
    category: 'Overview',
    aliases: ['insights', 'graph', 'summary', 'pressure'],
  },
  {
    id: 'settings',
    file: 'settings.sys',
    label: 'Settings',
    description: 'Subreddit-scoped configuration, mode, training, and reset controls.',
    icon: '/moddesk-icons/settings.png',
    tint: '#e2dccf',
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

// Window IDs rendered via RetroWindow (home is a special permanent shell rendered separately).
const windowIds: Exclude<WindowId, 'home'>[] = [
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

const categories: Array<{ id: WindowId; label: ProductModule['category'] }> = [
  { id: 'insights', label: 'Overview' },
  { id: 'queue', label: 'Moderation' },
  { id: 'automod', label: 'Content' },
  { id: 'usergrid', label: 'Community Apps' },
  { id: 'settings', label: 'Settings' },
  { id: 'modmail', label: 'Support' },
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

export const DesktopShell: React.FC<DesktopShellProps> = ({ statusData, session, triggerToast, onReset }) => {
  const [settings, setSettings] = useState<AppSettings>(statusData.settings);
  const [profile, setProfile] = useState<ModeratorProfile>(statusData.moderatorProfile);
  const [auditTicker, setAuditTicker] = useState<AuditEvent[]>(statusData.recentAudits ?? []);
  const [homeStats, setHomeStats] = useState<HomeStats>(() => fallbackStats(statusData.recentAudits?.length ?? 0));
  const [mode, setMode] = useState<'demo' | 'live'>('live');
  const [windows, setWindows] = useState<Record<WindowId, WindowInfo>>({
    ...initialWindows,
    home: { ...initialWindows.home, isOpen: true },
    queue: { ...initialWindows.queue, isOpen: true },
  });
  const [activeWindow, setActiveWindow] = useState<WindowId | 'audits' | ''>('home');
  const [auditsOpen, setAuditsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandInput, setCommandInput] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [liveRules, setLiveRules] = useState<Array<{ shortName: string; description?: string; priority?: number }>>([]);
  const [liveModlog, setLiveModlog] = useState<Array<{ id: string; type: string; moderatorName?: string; details?: string; description?: string; createdAt: string; target?: { author?: string; title?: string } }>>([]);
  const [liveEvents, setLiveEvents] = useState<Array<{ id: string; kind: string; createdAt: string; actor?: string | null; summary: string }>>([]);

  useEffect(() => {
    const themeAttr = settings.themeMode === 'high-contrast' ? 'dark' : 'posthog';
    document.documentElement.setAttribute('data-theme', themeAttr);
  }, [settings.themeMode]);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  // Cmd/Ctrl+H reopens the home dashboard; Escape closes the command palette.
  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const isMod = event.metaKey || event.ctrlKey;
      if (isMod && event.key.toLowerCase() === 'h') {
        event.preventDefault();
        setWindows((prev) => ({ ...prev, home: { ...prev.home, isOpen: true, isMinimized: false } }));
        setActiveWindow('home');
        return;
      }
      if (event.key === 'Escape' && commandOpen) {
        setCommandOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [commandOpen]);

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

  useEffect(() => {
    const fetchWorkbench = async () => {
      try {
        const [rulesResult, modlogResult, eventsResult] = await Promise.allSettled([
          api.getLiveRules(),
          api.getLiveModlog(),
          api.getLiveEvents(),
        ]);
        if (rulesResult.status === 'fulfilled') setLiveRules(rulesResult.value.rules ?? []);
        if (modlogResult.status === 'fulfilled') setLiveModlog((modlogResult.value.logs ?? []).slice(0, 6));
        if (eventsResult.status === 'fulfilled') setLiveEvents((eventsResult.value.events ?? []).slice(0, 8));
      } catch (err) {
        console.error(err);
      }
    };
    void fetchWorkbench();
    const interval = window.setInterval(() => void fetchWorkbench(), 12000);
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
          session={session}
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
          <button
            className="ph-mini-logo"
            onClick={() => openWindow('home')}
            title="ModDesk home (Ctrl+H)"
            aria-label="Open ModDesk home"
          >
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
          <button className="ph-top-cta" onClick={() => openWindow('queue')}>
            <span>Needs Review</span>
            <NotificationDot count={homeStats.queueOpen} label={`${homeStats.queueOpen} items needing review`} />
          </button>
          <button className="ph-round-btn" onClick={() => setCommandOpen(true)} aria-label="Search">/</button>
          <button className="ph-ticket-btn" onClick={() => setAuditsOpen(true)} aria-label="Audit feed">
            <span>Audit</span>
            <NotificationDot count={auditTicker.length} tone="info" label={`${auditTicker.length} audit events`} />
          </button>
          {session && (
            <IdentityChip
              session={session}
              onOpenSettings={() => openWindow('settings')}
              onCopyToast={(msg) => triggerToast(msg, 'success')}
            />
          )}
        </div>
      </header>

      {session && !session.isModerator && (
        <div className="ph-readonly-banner" role="status">
          <strong>Read-only</strong>
          <span>
            u/{session.username ?? 'unknown'} is not a moderator of r/{session.subredditName}. Destructive actions are hidden.
          </span>
        </div>
      )}

      <section className="ph-desktop-icons left" aria-label="Desktop files">
        {modules.map((item) => (
          <button
            key={item.file}
            className={`ph-file-icon tint-${item.id}`}
            style={{ ['--tile-tint' as string]: item.tint }}
            onClick={() => openWindow(item.id)}
            aria-label={`${item.label} — ${item.file}`}
          >
            <span className="ph-file-art image"><img src={item.icon} alt="" /></span>
            <strong>{item.file}</strong>
          </button>
        ))}
      </section>

      {windows.home.isOpen && !windows.home.isMinimized && (
      <section
        className={`ph-home-window moddesk-home${windows.home.isMaximized ? ' is-maximized' : ''}`}
        aria-label="ModDesk home"
        onMouseDown={() => setActiveWindow('home')}
      >
        <div className="ph-home-titlebar">
          <button className="ph-doc-button" onClick={() => openWindow('settings')} aria-label="ModDesk settings">MD</button>
          <strong>moddesk-os.sys</strong>
          <div className="ph-window-actions glass-window-controls">
            <button
              type="button"
              className="window-ctrl-dot minimize"
              aria-label="Minimize ModDesk home"
              title="Minimize"
              onClick={() => minimizeWindow('home')}
            >
              <svg viewBox="0 0 10 10" aria-hidden="true" focusable="false">
                <line x1="2" y1="5" x2="8" y2="5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              className="window-ctrl-dot maximize"
              aria-label={windows.home.isMaximized ? 'Restore ModDesk home' : 'Maximize ModDesk home'}
              title={windows.home.isMaximized ? 'Restore' : 'Maximize'}
              onClick={() => maximizeWindow('home')}
            >
              <svg viewBox="0 0 10 10" aria-hidden="true" focusable="false">
                <rect x="2.4" y="2.4" width="5.2" height="5.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              className="window-ctrl-dot close"
              aria-label="Close ModDesk home"
              title="Close (re-open with Ctrl+H)"
              onClick={() => closeWindow('home')}
            >
              <svg viewBox="0 0 10 10" aria-hidden="true" focusable="false">
                <line x1="2.6" y1="2.6" x2="7.4" y2="7.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <line x1="7.4" y1="2.6" x2="2.6" y2="7.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
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

            <div className="moddesk-workbench">
              <section className="moddesk-workbench-col primary">
                <div className="ph-panel-title">
                  <span>Top live reports</span>
                  <button onClick={() => openWindow('queue')}>Open queue ↗</button>
                </div>
                <div className="moddesk-queue-mini">
                  {homeStats.latestQueue.length === 0 ? (
                    <p className="moddesk-empty">Queue is clear. No reported posts or comments returned by Reddit for r/{settings.subredditName}.</p>
                  ) : (
                    homeStats.latestQueue.map((item) => (
                      <button key={item.itemId} onClick={() => openWindow('queue')}>
                        <div className="moddesk-queue-mini-head">
                          <strong>{item.reportCount} {item.reportCount === 1 ? 'report' : 'reports'}</strong>
                          <em>u/{item.author} · {item.itemType}</em>
                        </div>
                        <span>{item.title || item.bodyExcerpt}</span>
                        {item.reports && item.reports.length > 0 && (
                          <ul className="moddesk-report-reasons">
                            {item.reports.slice(0, 3).map((reason, index) => {
                              const label =
                                typeof reason === 'string'
                                  ? reason
                                  : reason?.reason ?? 'unknown reason';
                              const count =
                                typeof reason === 'object' && reason && typeof reason.count === 'number'
                                  ? reason.count
                                  : 0;
                              return (
                                <li key={`${item.itemId}-${index}`}>
                                  {label}
                                  {count > 1 && ` ×${count}`}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </button>
                    ))
                  )}
                </div>

                <div className="ph-panel-title">
                  <span>Live mod log</span>
                  <button onClick={() => openWindow('modlog')}>Open log ↗</button>
                </div>
                <div className="moddesk-modlog-mini">
                  {liveModlog.length === 0 ? (
                    <p className="moddesk-empty">No recent moderator actions in r/{settings.subredditName}.</p>
                  ) : (
                    liveModlog.map((entry) => (
                      <button key={entry.id} onClick={() => openWindow('modlog')}>
                        <div>
                          <strong>{entry.type}</strong>
                          <em>{entry.moderatorName ? `u/${entry.moderatorName}` : 'unknown mod'}</em>
                        </div>
                        <span>
                          {entry.description || entry.details || entry.target?.title || entry.target?.author || '—'}
                        </span>
                        <time dateTime={entry.createdAt}>
                          {new Date(entry.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </time>
                      </button>
                    ))
                  )}
                </div>
              </section>

              <aside className="moddesk-workbench-col secondary">
                <div className="ph-panel-title">
                  <span>Subreddit rules</span>
                  <button onClick={() => openWindow('typewriter')}>Templates ↗</button>
                </div>
                <ol className="moddesk-rules-list">
                  {liveRules.length === 0 ? (
                    <li className="moddesk-empty">No rules returned by Reddit. Define them in subreddit settings.</li>
                  ) : (
                    liveRules.map((rule, index) => (
                      <li key={`rule-${index}`}>
                        <strong>{index + 1}. {rule.shortName}</strong>
                        {rule.description && <span>{rule.description}</span>}
                      </li>
                    ))
                  )}
                </ol>

                <div className="ph-panel-title">
                  <span>Live triggers</span>
                  <button onClick={() => openWindow('modlog')}>Mod log ↗</button>
                </div>
                <div className="moddesk-activity-mini">
                  {liveEvents.length === 0 ? (
                    <p className="moddesk-empty">No live trigger events yet. Reports, mod actions, and modmail will stream in here as Devvit fires them.</p>
                  ) : (
                    liveEvents.map((event) => (
                      <button key={event.id} onClick={() => openWindow(event.kind === 'mod-mail' ? 'modmail' : event.kind.includes('report') ? 'queue' : 'modlog')}>
                        <strong>{event.kind.replace('-', ' ')}</strong>
                        <span>
                          {event.actor ? `u/${event.actor} · ` : ''}
                          {event.summary}
                        </span>
                      </button>
                    ))
                  )}
                </div>

                <div className="ph-panel-title">
                  <span>ModDesk audit</span>
                  <button onClick={() => setAuditsOpen(true)}>Full feed ↗</button>
                </div>
                <div className="moddesk-activity-mini">
                  {visibleAudits.length === 0 ? (
                    <p className="moddesk-empty">No ModDesk audit entries yet.</p>
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
      )}

      {/* The top-menubar logo (the three skewed bars) re-opens the home window when closed. */}

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
