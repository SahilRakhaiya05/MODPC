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
import { SentinelChat } from '../modules/SentinelChat';
import { RiskRadar } from '../modules/RiskRadar';
import { ActionComposer } from '../modules/ActionComposer';
import { ShiftHandoff } from '../modules/ShiftHandoff';

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
  | 'academy'
  | 'sentinel'
  | 'radar'
  | 'composer'
  | 'handoff';

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

type IconPosition = {
  x: number;
  y: number;
};

type IconDrag = {
  id: ModuleId;
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type DesktopIconStyle = React.CSSProperties & {
  '--tile-tint': string;
};

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
  sentinel: makeWindow('Sentinel AI Chat', 'AI', '1050px', '700px', 126, 76),
  radar: makeWindow('Risk Radar', 'RADAR', '980px', '650px', 98, 84),
  composer: makeWindow('Action Composer', 'DRAFT', '1000px', '660px', 116, 92),
  handoff: makeWindow('Shift Handoff', 'SHIFT', '980px', '640px', 136, 112),
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
  {
    id: 'sentinel',
    file: 'sentinel.ai',
    label: 'Sentinel AI',
    description: 'RAG chat for queue triage, Automod, modmail tone, and launch-ready moderator workflows.',
    icon: '/snoo.png',
    tint: '#dff3ff',
    category: 'Support',
    aliases: ['ai', 'chat', 'rag', 'sentinel', 'copilot', 'assistant'],
  },
  {
    id: 'radar',
    file: 'crisis-radar.app',
    label: 'Crisis Radar',
    description: 'A live pressure board for urgent reports, rule pressure, trigger activity, and consensus-ready cases.',
    icon: '/moddesk-icons/radar.svg',
    tint: '#e3f7ee',
    category: 'Moderation',
    aliases: ['risk', 'radar', 'triage', 'pressure', 'dispatch'],
  },
  {
    id: 'composer',
    file: 'action-composer.app',
    label: 'Action Composer',
    description: 'Draft safer moderation actions with templates, removal reasons, evidence checks, and consensus routing.',
    icon: '/moddesk-icons/composer.svg',
    tint: '#fff0d1',
    category: 'Moderation',
    aliases: ['composer', 'draft', 'action', 'removal', 'reply'],
  },
  {
    id: 'handoff',
    file: 'shift-handoff.app',
    label: 'Shift Handoff',
    description: 'Summarize pressure, next-mod items, recent changes, and handoff notes for timezone coverage.',
    icon: '/moddesk-icons/handoff.svg',
    tint: '#eaf3ff',
    category: 'Overview',
    aliases: ['handoff', 'shift', 'notes', 'coverage', 'team'],
  },
];

const mainTabs: Array<{ id: WindowId; label: string }> = [
  { id: 'queue', label: 'Needs Review' },
  { id: 'modmail', label: 'Mod Mail' },
  { id: 'automod', label: 'Automod' },
  { id: 'insights', label: 'Insights' },
  { id: 'typewriter', label: 'Saved Responses' },
  { id: 'radar', label: 'Crisis Radar' },
  { id: 'composer', label: 'Composer' },
  { id: 'handoff', label: 'Handoff' },
  { id: 'sentinel', label: 'Sentinel AI' },
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
  'sentinel',
  'radar',
  'composer',
  'handoff',
];

const topNavItems: Array<{ id: WindowId; label: string }> = [
  { id: 'radar', label: 'Radar' },
  { id: 'queue', label: 'Queue' },
  { id: 'modmail', label: 'Modmail' },
  { id: 'automod', label: 'Automod' },
  { id: 'composer', label: 'Composer' },
  { id: 'handoff', label: 'Handoff' },
  { id: 'sentinel', label: 'Sentinel' },
];

const defaultIconPositions: Record<ModuleId, IconPosition> = {
  queue: { x: 28, y: 74 },
  automod: { x: 28, y: 184 },
  modlog: { x: 28, y: 294 },
  insights: { x: 28, y: 404 },
  sentinel: { x: 28, y: 514 },
  radar: { x: 148, y: 74 },
  modmail: { x: 148, y: 184 },
  typewriter: { x: 148, y: 294 },
  usergrid: { x: 148, y: 404 },
  settings: { x: 148, y: 514 },
  composer: { x: 268, y: 74 },
  handoff: { x: 268, y: 184 },
};

const iconStorageKey = 'moddesk-os:desktop-icons:v1';

const readStoredIconPositions = (): Record<ModuleId, IconPosition> => {
  if (typeof window === 'undefined') return defaultIconPositions;
  try {
    const raw = window.localStorage.getItem(iconStorageKey);
    if (!raw) return defaultIconPositions;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return defaultIconPositions;
    const next = { ...defaultIconPositions };
    for (const item of modules) {
      const value = parsed[item.id];
      if (
        typeof value === 'object' &&
        value !== null &&
        typeof value.x === 'number' &&
        typeof value.y === 'number'
      ) {
        next[item.id] = { x: value.x, y: value.y };
      }
    }
    return next;
  } catch {
    return defaultIconPositions;
  }
};

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
  // Workspace mode is driven by persisted settings now — toggled from SettingsPanel only.
  const mode: 'demo' | 'live' = settings.workspaceMode === 'training' ? 'demo' : 'live';
  const [windows, setWindows] = useState<Record<WindowId, WindowInfo>>({
    ...initialWindows,
    home: { ...initialWindows.home, isOpen: true },
  });
  const [activeWindow, setActiveWindow] = useState<WindowId | 'audits' | ''>('home');
  const [auditsOpen, setAuditsOpen] = useState(false);
  const [iconPositions, setIconPositions] = useState<Record<ModuleId, IconPosition>>(readStoredIconPositions);
  const [iconDrag, setIconDrag] = useState<IconDrag | null>(null);
  const [draggedIcon, setDraggedIcon] = useState<ModuleId | null>(null);
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

  useEffect(() => {
    window.localStorage.setItem(iconStorageKey, JSON.stringify(iconPositions));
  }, [iconPositions]);

  useEffect(() => {
    if (!iconDrag) return undefined;

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== iconDrag.pointerId) return;
      const nextX = iconDrag.originX + event.clientX - iconDrag.startX;
      const nextY = iconDrag.originY + event.clientY - iconDrag.startY;
      const maxX = Math.max(24, window.innerWidth - 116);
      const maxY = Math.max(70, window.innerHeight - 116);
      const clamped = {
        x: Math.max(12, Math.min(maxX, nextX)),
        y: Math.max(58, Math.min(maxY, nextY)),
      };
      if (Math.abs(event.clientX - iconDrag.startX) > 4 || Math.abs(event.clientY - iconDrag.startY) > 4) {
        setDraggedIcon(iconDrag.id);
      }
      setIconPositions((prev) => ({ ...prev, [iconDrag.id]: clamped }));
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== iconDrag.pointerId) return;
      setIconDrag(null);
      window.setTimeout(() => setDraggedIcon(null), 0);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [iconDrag]);

  // Cmd/Ctrl+H reopens the home dashboard.
  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const isMod = event.metaKey || event.ctrlKey;
      if (isMod && event.key.toLowerCase() === 'h') {
        event.preventDefault();
        setWindows((prev) => ({ ...prev, home: { ...prev.home, isOpen: true, isMinimized: false } }));
        setActiveWindow('home');
        return;
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
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
      // Live mode: only items that came from the Reddit API (their itemId is namespaced 'live:').
      const queueForMode = mode === 'live'
        ? queue.filter((item) => typeof item.itemId === 'string' && item.itemId.startsWith('live:'))
        : queue.filter((item) => typeof item.itemId !== 'string' || !item.itemId.startsWith('live:'));
      const activeQueue = queueForMode.filter((item) => item.status === 'new' || item.status === 'reviewing');
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
  }, [auditTicker.length, mode]);

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

  const startIconDrag = (event: React.PointerEvent<HTMLButtonElement>, idValue: ModuleId) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const origin = iconPositions[idValue];
    setIconDrag({
      id: idValue,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: origin.x,
      originY: origin.y,
    });
  };

  const handleIconClick = (target: ModuleId) => {
    if (draggedIcon === target) return;
    openWindow(target);
  };

  const resetDesktopLayout = () => {
    setIconPositions(defaultIconPositions);
    window.localStorage.removeItem(iconStorageKey);
    triggerToast('Desktop icon layout reset.', 'success');
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
          onResetDesktop={resetDesktopLayout}
        />
      );
    }
    if (target === 'consensus') return <ConsensusDesk profile={profile} triggerToast={triggerToast} />;
    if (target === 'sentinel') return <SentinelChat triggerToast={triggerToast} />;
    if (target === 'radar') return <RiskRadar mode={mode} triggerToast={triggerToast} />;
    if (target === 'composer') {
      return (
        <ActionComposer
          mode={mode}
          triggerToast={triggerToast}
          openConsensus={() => openWindow('consensus')}
          openSentinel={() => openWindow('sentinel')}
        />
      );
    }
    if (target === 'handoff') return <ShiftHandoff triggerToast={triggerToast} openSentinel={() => openWindow('sentinel')} />;
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
          <div className="ph-product-title">
            <strong>ModDesk OS</strong>
            <span>{mode === 'live' ? 'Live moderator workspace' : 'Training workspace'}</span>
          </div>
          <nav className="ph-top-launcher" aria-label="Quick launch">
            {topNavItems.map((item) => (
              <button key={item.id} onClick={() => openWindow(item.id)}>{item.label}</button>
            ))}
          </nav>
        </div>
        <div className="ph-os-menu-right">
          {mode === 'demo' && (
            <span
              className="ph-mode-pill training"
              title="Workspace is in training mode — toggle from Settings to use live Reddit data."
            >
              Training
            </span>
          )}
          <span className="ph-clock">{dateLabel}</span>
          <button
            type="button"
            className="ph-xp-pill"
            onClick={() => openWindow('academy')}
            title={`u/${profile.username} · Lvl ${profile.trainingLevel} · ${profile.xp} XP · ${profile.correctScenarios}/${profile.totalScenarios} scenarios`}
            aria-label="Open Mod Academy"
          >
            <span className="ph-xp-level">L{profile.trainingLevel}</span>
            <span className="ph-xp-value">{profile.xp} XP</span>
          </button>
          <button className="ph-top-cta" onClick={() => openWindow('queue')}>
            <span>Needs Review</span>
            <NotificationDot count={homeStats.queueOpen} label={`${homeStats.queueOpen} items needing review`} />
          </button>
          <button className="ph-round-btn" onClick={() => openWindow('sentinel')} aria-label="Open Sentinel AI">AI</button>
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
        {modules.map((item) => {
          const position = iconPositions[item.id];
          const iconStyle: DesktopIconStyle = {
            '--tile-tint': item.tint,
            left: `${position.x}px`,
            top: `${position.y}px`,
          };
          return (
          <button
            key={item.file}
            className={`ph-file-icon tint-${item.id}${iconDrag?.id === item.id ? ' dragging' : ''}`}
            style={iconStyle}
            onPointerDown={(event) => startIconDrag(event, item.id)}
            onClick={() => handleIconClick(item.id)}
            aria-label={`${item.label} — ${item.file}`}
          >
            <span className="ph-file-art image"><img src={item.icon} alt="" draggable={false} /></span>
            <strong>{item.file}</strong>
          </button>
          );
        })}
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
          <button className="ph-top-cta" onClick={() => openWindow('sentinel')}>Sentinel AI</button>
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

    </main>
  );
};
