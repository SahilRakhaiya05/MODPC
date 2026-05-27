import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { NotificationDot } from './NotificationDot';
import { SentinelChat } from '../modules/SentinelChat';
import { RiskRadar } from '../modules/RiskRadar';
import { ActionComposer } from '../modules/ActionComposer';
import { ShiftHandoff } from '../modules/ShiftHandoff';
import { DeveloperAppsPanel } from '../modules/DeveloperAppsPanel';
import { NativeRedditBridge } from '../modules/NativeRedditBridge';
import { CommentCopPanel } from '../modules/CommentCopPanel';
import { TeamChat } from '../modules/TeamChat';
import { OwnerAdminPanel } from '../modules/OwnerAdminPanel';
import { PersonalModPanel } from '../modules/PersonalModPanel';

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
  | 'sentinel'
  | 'radar'
  | 'composer'
  | 'handoff'
  | 'devapps'
  | 'bridge'
  | 'commentcop'
  | 'teamchat'
  | 'owneradmin'
  | 'personal';

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

type ModuleId = Exclude<WindowId, 'home' | 'consensus'>;

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
  sentinel: makeWindow('Sentinel AI Chat', 'AI', '1050px', '700px', 126, 76),
  radar: makeWindow('Risk Radar', 'RADAR', '980px', '650px', 98, 84),
  composer: makeWindow('Action Composer', 'DRAFT', '1000px', '660px', 116, 92),
  handoff: makeWindow('Shift Handoff', 'SHIFT', '980px', '640px', 136, 112),
  devapps: makeWindow('Reddit Developer Apps', 'APP', '860px', '600px', 152, 104),
  bridge: makeWindow('Native Reddit Bridge', 'NAV', '900px', '640px', 144, 96),
  commentcop: makeWindow('CommentCop Shield', 'COP', '940px', '640px', 118, 76),
  teamchat: makeWindow('Team Chat', 'CHAT', '940px', '660px', 132, 84),
  owneradmin: makeWindow('Owner Admin', 'OWN', '960px', '660px', 156, 96),
  personal: makeWindow('My Mod Panel', 'ME', '880px', '640px', 176, 108),
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
    description: 'Subreddit-scoped configuration, identity, and reset controls.',
    icon: '/moddesk-icons/settings.png',
    tint: '#e2dccf',
    category: 'Settings',
    aliases: ['settings', 'system', 'config'],
  },
  {
    id: 'sentinel',
    file: 'sentinel.ai',
    label: 'Sentinel AI',
    description: 'Groq-powered moderation chat for queue triage, Automod, modmail tone, and launch-ready workflows.',
    icon: '/snoo.png',
    tint: '#dff3ff',
    category: 'Support',
    aliases: ['ai', 'chat', 'rag', 'sentinel', 'copilot', 'assistant'],
  },
  {
    id: 'commentcop',
    file: 'commentcop.app',
    label: 'CommentCop',
    description: 'Anti-bot similarity shield for copied comments, trigger dedupe, and vector verification.',
    icon: '/moddesk-icons/commentcop.svg',
    tint: '#e5f4ff',
    category: 'Moderation',
    aliases: ['commentcop', 'bot', 'similarity', 'duplicate comments', 'anti spam'],
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
    id: 'devapps',
    file: 'reddit-apps.app',
    label: 'Developer Apps',
    description: 'Official Reddit Developer Platform links and install-management boundaries.',
    icon: '/moddesk-icons/devapps.svg',
    tint: '#e4f7f1',
    category: 'Community Apps',
    aliases: ['apps', 'developer', 'installed apps', 'browse apps', 'reddit apps'],
  },
  {
    id: 'personal',
    file: 'my-panel.app',
    label: 'My Panel',
    description: 'Personal moderator preferences, private pinned modules, and notification counters.',
    icon: '/moddesk-icons/users.png',
    tint: '#f6e9ff',
    category: 'Settings',
    aliases: ['personal', 'my panel', 'prefs', 'notifications'],
  },
  {
    id: 'teamchat',
    file: 'team-chat.app',
    label: 'Team Chat',
    description: 'Private Redis-backed moderator channel with mentions and owner/admin pins.',
    icon: '/moddesk-icons/modmail.png',
    tint: '#e2f3ff',
    category: 'Support',
    aliases: ['chat', 'team', 'mentions', 'communication'],
  },
  {
    id: 'owneradmin',
    file: 'owner-admin.app',
    label: 'Owner Admin',
    description: 'Owner/admin defaults, moderator roster, install links, and first-run configuration.',
    icon: '/moddesk-icons/settings.png',
    tint: '#ffe8d8',
    category: 'Settings',
    aliases: ['owner', 'admin', 'install', 'roster'],
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
  {
    id: 'bridge',
    file: 'reddit-bridge.app',
    label: 'Native Reddit Bridge',
    description: 'Deep-link to real Reddit mod surfaces (modqueue, modmail, wiki, mod log) that can\'t embed inside Devvit.',
    icon: '/moddesk-icons/bridge.svg',
    tint: '#fff3df',
    category: 'Community Apps',
    aliases: ['bridge', 'native', 'open reddit', 'deep link', 'navigate'],
  },
];

const mainTabs: Array<{ id: WindowId; label: string }> = [
  { id: 'queue', label: 'Needs Review' },
  { id: 'modmail', label: 'Mod Mail' },
  { id: 'automod', label: 'Automod' },
  { id: 'commentcop', label: 'CommentCop' },
  { id: 'insights', label: 'Insights' },
  { id: 'typewriter', label: 'Saved Responses' },
  { id: 'radar', label: 'Crisis Radar' },
  { id: 'composer', label: 'Composer' },
  { id: 'handoff', label: 'Handoff' },
  { id: 'teamchat', label: 'Team Chat' },
  { id: 'personal', label: 'My Panel' },
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
  'sentinel',
  'radar',
  'composer',
  'handoff',
  'devapps',
  'bridge',
  'commentcop',
  'teamchat',
  'owneradmin',
  'personal',
];

const navMenus: Array<{ label: string; items: Array<{ id: WindowId | 'audits'; label: string; hint: string }> }> = [
  {
    label: 'Moderation',
    items: [
      { id: 'queue', label: 'Needs Review', hint: 'Reports, severity, rules, guarded actions' },
      { id: 'modmail', label: 'Modmail', hint: 'Replies, internal notes, archive workflow' },
      { id: 'typewriter', label: 'Saved Responses', hint: 'Reusable moderator replies' },
      { id: 'modlog', label: 'Mod Log', hint: 'Reddit native log plus MODPC audit' },
      { id: 'automod', label: 'Automod', hint: 'Automod wiki sandbox and live publishing gates' },
      { id: 'commentcop', label: 'CommentCop', hint: 'Anti-bot copied-comment shield' },
      { id: 'consensus', label: 'Consensus', hint: 'Evidence-backed high-impact decisions' },
      { id: 'teamchat', label: 'Team Chat', hint: 'Private moderator channel and mentions' },
      { id: 'handoff', label: 'Handoff', hint: 'Pass context to the next moderator' },
      { id: 'usergrid', label: 'User Registry', hint: 'Banned, muted, approved, moderators' },
    ],
  },
  {
    label: 'Community',
    items: [
      { id: 'home', label: 'Overview', hint: 'Live pressure and workspace summary' },
      { id: 'radar', label: 'Radar', hint: 'Urgent signals and rule pressure' },
      { id: 'insights', label: 'Insights', hint: 'Queue and mod activity trends' },
      { id: 'modlog', label: 'Modlog', hint: 'Reddit modlog plus audit trail' },
      { id: 'typewriter', label: 'Saved Responses', hint: 'Reusable moderator replies' },
      { id: 'devapps', label: 'Developer Apps', hint: 'Reddit Developer Platform links' },
      { id: 'bridge', label: 'Native Reddit Bridge', hint: 'Deep-link to Reddit mod surfaces' },
    ],
  },
  {
    label: 'Automod',
    items: [
      { id: 'automod', label: 'Automod Studio', hint: 'Draft, validate, diff, publish safely' },
      { id: 'composer', label: 'Snippet Generator', hint: 'Draft Automod snippets with Sentinel context' },
      { id: 'audits', label: 'History', hint: 'Automod and MODPC audit events' },
    ],
  },
  {
    label: 'AI',
    items: [
      { id: 'sentinel', label: 'Sentinel', hint: 'Groq assistant, sources, prompt preview' },
      { id: 'composer', label: 'Composer', hint: 'Safe drafts and response shaping' },
      { id: 'radar', label: 'Source Library', hint: 'Radar context and retrieved cases' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { id: 'settings', label: 'Install Status', hint: 'Community picker and capabilities' },
      { id: 'devapps', label: 'Reddit Apps', hint: 'Installed apps, Browse Apps, Developer Apps links' },
      { id: 'personal', label: 'My Panel', hint: 'Your private per-moderator preferences' },
      { id: 'owneradmin', label: 'Owner Admin', hint: 'Owner/admin install and team defaults' },
      { id: 'settings', label: 'Groq Setup', hint: 'Model status and connection errors' },
      { id: 'audits', label: 'Audit Log', hint: 'Review guarded actions and outcomes' },
    ],
  },
];

const commandItems: Array<{ label: string; target: WindowId | 'audits'; hint: string }> = [
  { label: 'Open Sentinel', target: 'sentinel', hint: 'Ask Sentinel and inspect source cards' },
  { label: 'Review queue', target: 'queue', hint: 'Open Needs Review' },
  { label: 'Open modmail', target: 'modmail', hint: 'Reply, note, archive, draft' },
  { label: 'Open team chat', target: 'teamchat', hint: 'Private moderator communication' },
  { label: 'Open my panel', target: 'personal', hint: 'Personal moderator prefs and notifications' },
  { label: 'Open owner admin', target: 'owneradmin', hint: 'Owner/admin first-run config and mod roster' },
  { label: 'Draft modmail reply', target: 'sentinel', hint: 'Start from Sentinel draft prompt' },
  { label: 'Open Automod Studio', target: 'automod', hint: 'Validate and diff Automod changes' },
  { label: 'Open CommentCop', target: 'commentcop', hint: 'Configure copied-comment bot protection' },
  { label: 'Generate Automod snippet', target: 'composer', hint: 'Use Composer/Sentinel as a draft desk' },
  { label: 'Check Groq status', target: 'sentinel', hint: 'Open Model Status tab' },
  { label: 'Switch community', target: 'settings', hint: 'Open community picker' },
  { label: 'Escalate to consensus', target: 'consensus', hint: 'Create evidence-backed case' },
  { label: 'Open user registry', target: 'usergrid', hint: 'Review user lists and guarded actions' },
  { label: 'Open capability matrix', target: 'settings', hint: 'See what is available now' },
  { label: 'Open Reddit Developer Apps', target: 'devapps', hint: 'Manage app installs on Reddit Developer Platform' },
  { label: 'Open audit log', target: 'audits', hint: 'Review action history' },
];

const defaultIconPositions: Record<ModuleId, IconPosition> = {
  queue: { x: 14, y: 74 },
  automod: { x: 14, y: 184 },
  modlog: { x: 14, y: 294 },
  insights: { x: 14, y: 404 },
  sentinel: { x: 14, y: 514 },
  radar: { x: 14, y: 624 },
  handoff: { x: 14, y: 734 },
  modmail: { x: 118, y: 74 },
  typewriter: { x: 118, y: 184 },
  usergrid: { x: 118, y: 294 },
  settings: { x: 118, y: 404 },
  composer: { x: 118, y: 514 },
  devapps: { x: 118, y: 624 },
  bridge: { x: 118, y: 734 },
  commentcop: { x: 222, y: 74 },
  teamchat: { x: 222, y: 184 },
  personal: { x: 222, y: 294 },
  owneradmin: { x: 222, y: 404 },
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

const ownerOnlyWindows = new Set<WindowId>(['owneradmin']);

export const DesktopShell: React.FC<DesktopShellProps> = ({ statusData, session, triggerToast, onReset }) => {
  const [settings, setSettings] = useState<AppSettings>(statusData.settings);
  const [profile, setProfile] = useState<ModeratorProfile>(statusData.moderatorProfile);
  const [auditTicker, setAuditTicker] = useState<AuditEvent[]>(statusData.recentAudits ?? []);
  const [homeStats, setHomeStats] = useState<HomeStats>(() => fallbackStats(statusData.recentAudits?.length ?? 0));
  const workspaceMode = settings.workspaceMode === 'training' ? 'demo' : 'live';
  const [windows, setWindows] = useState<Record<WindowId, WindowInfo>>({
    ...initialWindows,
    home: { ...initialWindows.home, isOpen: true },
  });
  const [activeWindow, setActiveWindow] = useState<WindowId | 'audits' | ''>('home');
  const [auditsOpen, setAuditsOpen] = useState(false);
  const [openNavMenu, setOpenNavMenu] = useState<string | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [iconPositions, setIconPositions] = useState<Record<ModuleId, IconPosition>>(readStoredIconPositions);
  const [iconDrag, setIconDrag] = useState<IconDrag | null>(null);
  const [draggedIcon, setDraggedIcon] = useState<ModuleId | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [liveRules, setLiveRules] = useState<Array<{ shortName: string; description?: string; priority?: number }>>([]);
  const [liveEvents, setLiveEvents] = useState<Array<{ id: string; kind: string; createdAt: string; actor?: string | null; summary: string }>>([]);
  const liveWritesLocked = !settings.liveWritesEnabled;

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
      if (isMod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((current) => !current);
        setOpenNavMenu(null);
        return;
      }
      if (event.key === 'Escape') {
        setCommandOpen(false);
        setOpenNavMenu(null);
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
      const activeQueue = queue
        .filter((item) => typeof item.itemId === 'string' && item.itemId.startsWith('live:'))
        .filter((item) => item.status === 'new' || item.status === 'reviewing');
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
        const [rulesResult, eventsResult] = await Promise.allSettled([
          api.getLiveRules(),
          api.getLiveEvents(),
        ]);
        if (rulesResult.status === 'fulfilled') setLiveRules(rulesResult.value.rules ?? []);
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
  const cleanSubredditName = settings.subredditName.replace(/^r\//i, '').replace(/\s+\(Standalone\)$/i, '');
  const cleanUsername = profile.username.replace(/^u\//i, '');
  const subredditLabel = `r/${cleanSubredditName}`;
  const canManageApp = session?.modDeskRole === 'owner' || session?.modDeskRole === 'admin';
  const canOpenTarget = useCallback(
    (target: WindowId | 'audits') => target === 'audits' || !ownerOnlyWindows.has(target) || canManageApp,
    [canManageApp]
  );
  const visibleModules = useMemo(
    () => modules.filter((item) => canOpenTarget(item.id)),
    [canOpenTarget]
  );
  const visibleMainTabs = useMemo(
    () => mainTabs.filter((item) => canOpenTarget(item.id)),
    [canOpenTarget]
  );
  const visibleWindowIds = useMemo(
    () => windowIds.filter((item) => canOpenTarget(item)),
    [canOpenTarget]
  );
  const visibleNavMenus = useMemo(
    () => navMenus.map((menu) => ({
      ...menu,
      items: menu.items.filter((item) => canOpenTarget(item.id)),
    })),
    [canOpenTarget]
  );
  const visibleCommandItems = useMemo(
    () => commandItems.filter((item) => canOpenTarget(item.target)),
    [canOpenTarget]
  );
  const filteredCommands = visibleCommandItems.filter((item) => {
    const needle = commandQuery.trim().toLowerCase();
    return !needle || `${item.label} ${item.hint}`.toLowerCase().includes(needle);
  });

  const formatModeratorLabel = (entry: { actor?: string | null; moderatorName?: string | null }) => {
    const rawName = (entry.actor ?? entry.moderatorName ?? '').trim().replace(/^u\//i, '');
    if (!rawName || /^unknown[_ ]mod$/i.test(rawName)) return 'Moderator unavailable';
    return rawName === 'AutoModerator' ? rawName : `u/${rawName}`;
  };

  const openWindow = (target: WindowId) => {
    if (!canOpenTarget(target)) {
      triggerToast('Owner Admin is only visible to the community owner or app admin.', 'warning');
      return;
    }
    setWindows((prev) => ({ ...prev, [target]: { ...prev[target], isOpen: true, isMinimized: false } }));
    setActiveWindow(target);
    setOpenNavMenu(null);
    setCommandOpen(false);
  };

  const runLauncherTarget = (target: WindowId | 'audits') => {
    if (target === 'audits') {
      setAuditsOpen(true);
      setActiveWindow('audits');
      setCommandOpen(false);
      setOpenNavMenu(null);
      return;
    }
    openWindow(target);
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
    if (target === 'queue') return <QueueConsole mode={workspaceMode} profile={profile} onProfileUpdate={setProfile} triggerToast={triggerToast} />;
    if (target === 'modmail') return <ModmailHub mode={workspaceMode} triggerToast={triggerToast} />;
    if (target === 'automod') return <AutomodPanel mode={workspaceMode} triggerToast={triggerToast} />;
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
    if (target === 'radar') return <RiskRadar triggerToast={triggerToast} />;
    if (target === 'composer') {
      return (
        <ActionComposer
          triggerToast={triggerToast}
          openConsensus={() => openWindow('consensus')}
          openSentinel={() => openWindow('sentinel')}
        />
      );
    }
    if (target === 'handoff') return <ShiftHandoff triggerToast={triggerToast} openSentinel={() => openWindow('sentinel')} />;
    if (target === 'devapps') return <DeveloperAppsPanel session={session} onLaunch={(t) => openWindow(t)} />;
    if (target === 'bridge') return <NativeRedditBridge session={session} />;
    if (target === 'commentcop') return <CommentCopPanel triggerToast={triggerToast} />;
    if (target === 'teamchat') return <TeamChat session={session} triggerToast={triggerToast} />;
    if (target === 'owneradmin') return <OwnerAdminPanel session={session} triggerToast={triggerToast} />;
    if (target === 'personal') {
      return (
        <PersonalModPanel
          session={session}
          triggerToast={triggerToast}
          openTeamChat={() => openWindow('teamchat')}
          openOwnerAdmin={() => openWindow('owneradmin')}
          canOpenOwnerAdmin={canManageApp}
        />
      );
    }
    return <CommentCopPanel triggerToast={triggerToast} />;
  };

  return (
    <main className="ph-os-shell" data-wallpaper={settings.wallpaperId ?? 'wall1'}>
      <header className="ph-os-menubar">
        <div className="ph-os-menu-left">
          <button
            className="ph-mini-logo"
            onClick={() => openWindow('home')}
            title="MODPC home (Ctrl+H)"
            aria-label="Open MODPC home"
          >
            <span />
            <span />
            <span />
          </button>
          <div className="ph-product-title">
            <strong>MODPC</strong>
            <span>Live Reddit console</span>
          </div>
          <nav className="ph-top-launcher" aria-label="Quick launch">
            {visibleNavMenus.map((menu) => (
              <div key={menu.label} className="ph-nav-menu">
                <button
                  type="button"
                  aria-expanded={openNavMenu === menu.label}
                  onClick={() => setOpenNavMenu((current) => current === menu.label ? null : menu.label)}
                >
                  {menu.label}
                </button>
                {openNavMenu === menu.label && (
                  <div className="ph-nav-dropdown" role="menu">
                    {menu.items.map((item) => (
                      <button key={`${menu.label}-${item.label}`} type="button" onClick={() => runLauncherTarget(item.id)} role="menuitem">
                        <strong>{item.label}</strong>
                        <span>{item.hint}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </div>
        <div className="ph-os-menu-right">
          <button type="button" className="ph-command-btn" onClick={() => setCommandOpen(true)} aria-label="Open command launcher">
            Search
          </button>
          <span className="ph-clock">{dateLabel}</span>
          <button
            type="button"
            className="ph-xp-pill"
            onClick={() => openWindow('modlog')}
            title={`u/${cleanUsername} · ${profile.queueReviewed} reviewed · ${profile.consensusVotesCast} consensus votes`}
            aria-label="Open live audit log"
          >
            <span className="ph-xp-level">LIVE</span>
            <span className="ph-xp-value">Audit</span>
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

      {commandOpen && (
        <div className="ph-command-backdrop" role="dialog" aria-modal="true" aria-label="Command launcher">
          <section className="ph-command-palette">
            <header>
              <strong>Command launcher</strong>
              <button type="button" onClick={() => setCommandOpen(false)} aria-label="Close command launcher">x</button>
            </header>
            <input
              autoFocus
              value={commandQuery}
              onChange={(event) => setCommandQuery(event.target.value)}
              placeholder="Search commands: Sentinel, queue, modmail, Automod, CommentCop..."
            />
            <div>
              {filteredCommands.length === 0 ? (
                <p>No matching command. Try "queue", "Groq", "CommentCop", or "modmail".</p>
              ) : (
                filteredCommands.slice(0, 9).map((item) => (
                  <button key={item.label} type="button" onClick={() => runLauncherTarget(item.target)}>
                    <strong>{item.label}</strong>
                    <span>{item.hint}</span>
                  </button>
                ))
              )}
            </div>
            <footer>Cmd/Ctrl + K opens this launcher. Destructive Reddit actions still require explicit confirmation.</footer>
          </section>
        </div>
      )}

      <section className="ph-desktop-icons left" aria-label="Desktop files">
        {visibleModules.map((item) => {
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
        aria-label="MODPC home"
        onMouseDown={() => setActiveWindow('home')}
      >
        <div className="ph-home-titlebar">
          <button className="ph-doc-button" onClick={() => openWindow('settings')} aria-label="MODPC settings">MD</button>
          <strong>modpc.sys</strong>
          <div className="ph-window-actions glass-window-controls">
            <button
              type="button"
              className="window-ctrl-dot minimize"
              aria-label="Minimize MODPC home"
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
              aria-label={windows.home.isMaximized ? 'Restore MODPC home' : 'Maximize MODPC home'}
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
              aria-label="Close MODPC home"
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
          {visibleMainTabs.map((tab) => (
            <button key={tab.id} onClick={() => openWindow(tab.id)}>{tab.label}</button>
          ))}
          <button className="ph-top-cta" onClick={() => openWindow('sentinel')}>Sentinel AI</button>
        </div>
        <div className="ph-doc-scroll">
          <section className="moddesk-command-center">
            <div className="moddesk-status-head">
              <div>
                <span className="ph-kicker">{subredditLabel} / live moderator workspace</span>
                <h1>MODPC</h1>
                <p>One document-window workspace for the queues, mail, policy, users, logs, and response work your mod team actually touches.</p>
              </div>
              <div className="moddesk-session-card">
                <span>Active session</span>
                <strong>u/{cleanUsername}</strong>
                <em>{liveWritesLocked ? 'Live writes locked' : 'Guarded live workspace'}</em>
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
                    <p className="moddesk-empty">No items need review right now. Switch subreddits from the identity chip or open Mod Mail for {subredditLabel}.</p>
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
                </div>
              </section>

              <aside className="moddesk-workbench-col secondary">
                <div className="ph-panel-title">
                  <span>Subreddit rules</span>
                  <button onClick={() => openWindow('typewriter')}>Templates ↗</button>
                </div>
                <ol className="moddesk-rules-list">
                  {liveRules.length === 0 ? (
                    <li className="moddesk-empty">No rules returned by Reddit. Define them in native subreddit settings or open the Rules and Saved Responses tools.</li>
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
                  <span>MODPC audit</span>
                  <button onClick={() => setAuditsOpen(true)}>Full feed ↗</button>
                </div>
                <div className="moddesk-activity-mini">
                  {visibleAudits.length === 0 ? (
                    <p className="moddesk-empty">No MODPC audit entries yet.</p>
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

      {visibleWindowIds.map((item) => {
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
