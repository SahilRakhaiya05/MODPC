import { navigateTo } from '@devvit/web/client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SessionResponse } from '../../shared/api';

type LaunchTarget =
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
  | 'bridge'
  | 'commentcop';

type DeveloperAppsPanelProps = {
  session?: SessionResponse | undefined;
  onLaunch?: (target: LaunchTarget) => void;
};

type AppCategory =
  | 'Native Reddit'
  | 'ModDesk Module'
  | 'Devvit App'
  | 'Automation'
  | 'Safety'
  | 'Analytics'
  | 'Developer Platform';

type AppOrigin = 'internal' | 'native-reddit' | 'devvit-store';

type CatalogApp = {
  id: string;
  name: string;
  publisher: string;
  category: AppCategory;
  origin: AppOrigin;
  tagline: string;
  description: string;
  capabilities: string[];
  permissions: string[];
  icon: string;
  iconTint: string;
  rating: number;
  installs: string;
  featured?: boolean;
  preinstalled?: boolean;
  launchTarget?: LaunchTarget;
  redditUrl?: (subreddit: string) => string;
  devvitUrl?: string;
  screenshots?: string[];
};

const CATALOG: CatalogApp[] = [
  // ── ModDesk built-in modules ─────────────────────────────────────────
  {
    id: 'md-queue',
    name: 'Needs Review',
    publisher: 'ModDesk',
    category: 'ModDesk Module',
    origin: 'internal',
    tagline: 'Live mod queue with severity, reports, and guarded actions.',
    description:
      'Triage reported posts and comments with rule suggestions, severity scoring, assignment, and one-click approve / remove / escalate. Every destructive action is gated by CONFIRM_LIVE_ACTION.',
    capabilities: ['reddit.getModQueue', 'reddit.getReports', 'reddit.approve / remove'],
    permissions: ['Read posts', 'Read comments', 'Moderate content'],
    icon: 'Q',
    iconTint: '#fde4dc',
    rating: 4.8,
    installs: '12.4k',
    featured: true,
    preinstalled: true,
    launchTarget: 'queue',
  },
  {
    id: 'md-modmail',
    name: 'Mod Mail',
    publisher: 'ModDesk',
    category: 'ModDesk Module',
    origin: 'internal',
    tagline: 'Threaded moderator inbox with profile dossiers.',
    description:
      'Read, reply, archive, mute, and add internal notes on official Reddit modmail conversations. Every participant gets a karma/age/flag dossier inline.',
    capabilities: ['reddit.modMail.*', 'UserDossier'],
    permissions: ['Read modmail', 'Reply', 'Archive'],
    icon: '✉',
    iconTint: '#dce8fb',
    rating: 4.7,
    installs: '9.8k',
    preinstalled: true,
    launchTarget: 'modmail',
  },
  {
    id: 'md-automod',
    name: 'Automod Studio',
    publisher: 'ModDesk',
    category: 'ModDesk Module',
    origin: 'internal',
    tagline: 'Draft, diff, and publish wiki/config/automoderator safely.',
    description:
      'YAML editor with live diff, validation, and audited publishing to wiki/config/automoderator. Stages drafts before requiring a CONFIRM_LIVE_ACTION token.',
    capabilities: ['wiki read/write', 'automod validation'],
    permissions: ['Read wiki', 'Write wiki/config/automoderator'],
    icon: '⌘',
    iconTint: '#d8efd9',
    rating: 4.6,
    installs: '8.1k',
    preinstalled: true,
    launchTarget: 'automod',
  },
  {
    id: 'md-commentcop',
    name: 'CommentCop Shield',
    publisher: 'ModDesk',
    category: 'Safety',
    origin: 'internal',
    tagline: 'Anti-bot shield for copied / duplicated comments.',
    description:
      'Reddit Redis-backed similarity check for copied comments. Catches copy-paste karma farming and burst-posting bots without any external database.',
    capabilities: ['onCommentCreate trigger', 'Reddit Redis rolling window', 'Jaccard similarity'],
    permissions: ['Read comments', 'Remove comments', 'Read user history'],
    icon: '◎',
    iconTint: '#e5f4ff',
    rating: 4.9,
    installs: '6.3k',
    featured: true,
    preinstalled: true,
    launchTarget: 'commentcop',
  },
  {
    id: 'md-sentinel',
    name: 'Sentinel AI',
    publisher: 'ModDesk',
    category: 'ModDesk Module',
    origin: 'internal',
    tagline: 'Groq-powered mod assistant with sources and audit trail.',
    description:
      'Ask Sentinel to triage cases, draft modmail replies, generate Automod snippets, or explain a removal. Every answer comes with source cards and a confidence rating.',
    capabilities: ['Groq HTTP fetch', 'RAG over rules/audit'],
    permissions: ['Read rules', 'Read audit log', 'External HTTP to api.groq.com'],
    icon: '✦',
    iconTint: '#dff3ff',
    rating: 4.8,
    installs: '11.2k',
    featured: true,
    preinstalled: true,
    launchTarget: 'sentinel',
  },
  {
    id: 'md-radar',
    name: 'Crisis Radar',
    publisher: 'ModDesk',
    category: 'Safety',
    origin: 'internal',
    tagline: 'Pressure board for urgent reports and rule spikes.',
    description:
      'Surfaces safety / harassment / brigade signals before they tip the queue. Ranks cases by severity, age, and report volume; routes to consensus when needed.',
    capabilities: ['Severity scoring', 'Rule pressure'],
    permissions: ['Read reports', 'Read mod log'],
    icon: '◉',
    iconTint: '#e3f7ee',
    rating: 4.7,
    installs: '5.4k',
    preinstalled: true,
    launchTarget: 'radar',
  },
  {
    id: 'md-composer',
    name: 'Action Composer',
    publisher: 'ModDesk',
    category: 'ModDesk Module',
    origin: 'internal',
    tagline: 'Draft safer mod actions with templates and removal reasons.',
    description:
      'Stage removals, bans, and replies with rule context, evidence checks, and one-click escalation to Consensus Desk for high-impact actions.',
    capabilities: ['Template merge', 'Removal reasons', 'Consensus routing'],
    permissions: ['Read rules', 'Read templates', 'Write consensus tickets'],
    icon: '✎',
    iconTint: '#fff0d1',
    rating: 4.5,
    installs: '4.9k',
    preinstalled: true,
    launchTarget: 'composer',
  },
  {
    id: 'md-handoff',
    name: 'Shift Handoff',
    publisher: 'ModDesk',
    category: 'ModDesk Module',
    origin: 'internal',
    tagline: 'Pressure summaries and notes for the next mod on shift.',
    description:
      'Snapshot pressure, next-mod items, and recent changes into Redis so timezone handoffs land cleanly. Auto-prefills from the last hour of activity.',
    capabilities: ['Redis handoff store', 'Pressure synthesis'],
    permissions: ['Read mod log', 'Read queue'],
    icon: '↻',
    iconTint: '#eaf3ff',
    rating: 4.6,
    installs: '3.7k',
    preinstalled: true,
    launchTarget: 'handoff',
  },
  {
    id: 'md-typewriter',
    name: 'Saved Responses',
    publisher: 'ModDesk',
    category: 'ModDesk Module',
    origin: 'internal',
    tagline: 'Templated removal, appeal, and education replies.',
    description: 'Reusable moderator templates with tone tagging, rule linkage, and macro support.',
    capabilities: ['Template CRUD', 'Macros'],
    permissions: ['Read templates', 'Write templates'],
    icon: '⌨',
    iconTint: '#fdf1c8',
    rating: 4.4,
    installs: '7.8k',
    preinstalled: true,
    launchTarget: 'typewriter',
  },
  {
    id: 'md-modlog',
    name: 'Mod Log Console',
    publisher: 'ModDesk',
    category: 'ModDesk Module',
    origin: 'internal',
    tagline: 'Reddit native mod log plus ModDesk audit entries.',
    description: 'Filter mod-log events by actor, action, and target. Cross-references ModDesk audit trail for any guarded action.',
    capabilities: ['reddit.getModerationLog', 'Audit join'],
    permissions: ['Read mod log'],
    icon: '≡',
    iconTint: '#cfeceb',
    rating: 4.5,
    installs: '6.1k',
    preinstalled: true,
    launchTarget: 'modlog',
  },
  {
    id: 'md-users',
    name: 'Users Registry',
    publisher: 'ModDesk',
    category: 'ModDesk Module',
    origin: 'internal',
    tagline: 'Banned, muted, approved, and moderator lists with guarded actions.',
    description: 'Search and act on every user list this subreddit maintains. Destructive actions require the CONFIRM_LIVE_ACTION token.',
    capabilities: ['reddit.getBannedUsers', 'reddit.getMutedUsers', 'reddit.getApprovedUsers'],
    permissions: ['Read user lists', 'Modify user lists'],
    icon: '◧',
    iconTint: '#fbe1c9',
    rating: 4.6,
    installs: '5.2k',
    preinstalled: true,
    launchTarget: 'usergrid',
  },
  {
    id: 'md-insights',
    name: 'Insights Graph',
    publisher: 'ModDesk',
    category: 'Analytics',
    origin: 'internal',
    tagline: 'Derived queue, modlog, and rule-pressure trends.',
    description: 'Computes pressure trends from queue + mod log events. (Reddit traffic / subscriber stats are not exposed by Devvit.)',
    capabilities: ['Local aggregation', 'Audit synthesis'],
    permissions: ['Read mod log', 'Read queue'],
    icon: '▮',
    iconTint: '#e6dbf9',
    rating: 4.3,
    installs: '3.9k',
    preinstalled: true,
    launchTarget: 'insights',
  },
  {
    id: 'md-bridge',
    name: 'Native Reddit Bridge',
    publisher: 'ModDesk',
    category: 'ModDesk Module',
    origin: 'internal',
    tagline: 'Deep-link to Reddit pages that cannot be embedded.',
    description: 'Reddit blocks iframing of its own pages. The Bridge surfaces every mod URL with a copy button and a one-click navigateTo handoff.',
    capabilities: ['navigateTo', 'Clipboard'],
    permissions: ['None — pure UI'],
    icon: '↗',
    iconTint: '#fff3df',
    rating: 4.2,
    installs: '4.5k',
    preinstalled: true,
    launchTarget: 'bridge',
  },
  {
    id: 'md-consensus',
    name: 'Consensus Desk',
    publisher: 'ModDesk',
    category: 'ModDesk Module',
    origin: 'internal',
    tagline: 'Evidence-backed voting for high-impact actions.',
    description: 'Bans, sticky removals, and large content actions move through a vote with required threshold and anonymous-until-closed mode.',
    capabilities: ['Ticket CRUD', 'Vote tally'],
    permissions: ['Read mod team', 'Write tickets'],
    icon: '✓',
    iconTint: '#e2dccf',
    rating: 4.7,
    installs: '2.8k',
    preinstalled: true,
    launchTarget: 'consensus',
  },

  // ── Native Reddit mod surfaces (open on Reddit) ──────────────────────
  {
    id: 'rd-modqueue',
    name: 'Reddit Mod Queue',
    publisher: 'Reddit',
    category: 'Native Reddit',
    origin: 'native-reddit',
    tagline: 'Reddit\'s official reports + spam queue.',
    description: 'The native modqueue surface. ModDesk\'s queue uses the same API but the official view is here when you need it.',
    capabilities: ['Reports', 'Spam', 'Edited filter'],
    permissions: ['Reddit moderator scope'],
    icon: 'R',
    iconTint: '#ffeadc',
    rating: 4.5,
    installs: 'Built-in',
    redditUrl: (s) => `https://www.reddit.com/r/${s}/about/modqueue`,
  },
  {
    id: 'rd-modmail',
    name: 'Reddit Mod Mail',
    publisher: 'Reddit',
    category: 'Native Reddit',
    origin: 'native-reddit',
    tagline: 'Official threaded modmail surface.',
    description: 'mod.reddit.com/mail with archive, mute, internal-note flows.',
    capabilities: ['Threads', 'Archive', 'Mute'],
    permissions: ['Reddit moderator scope'],
    icon: 'M',
    iconTint: '#ffeadc',
    rating: 4.4,
    installs: 'Built-in',
    redditUrl: (s) => `https://mod.reddit.com/mail/all?subreddit=${s}`,
  },
  {
    id: 'rd-rules',
    name: 'Subreddit Rules',
    publisher: 'Reddit',
    category: 'Native Reddit',
    origin: 'native-reddit',
    tagline: 'Edit community rules.',
    description: 'Manage rules and rule order from the official Reddit settings page.',
    capabilities: ['CRUD rules'],
    permissions: ['Manage settings'],
    icon: '§',
    iconTint: '#ffeadc',
    rating: 4.3,
    installs: 'Built-in',
    redditUrl: (s) => `https://www.reddit.com/r/${s}/about/rules`,
  },
  {
    id: 'rd-removal',
    name: 'Removal Reasons',
    publisher: 'Reddit',
    category: 'Native Reddit',
    origin: 'native-reddit',
    tagline: 'Manage removal reason templates.',
    description: 'Removal reasons templating on Reddit. ModDesk\'s Composer reads these to suggest the closest match.',
    capabilities: ['CRUD removal reasons'],
    permissions: ['Manage settings'],
    icon: '⊘',
    iconTint: '#ffeadc',
    rating: 4.2,
    installs: 'Built-in',
    redditUrl: (s) => `https://www.reddit.com/mod/${s}/removal`,
  },
  {
    id: 'rd-flairs',
    name: 'Flair Manager',
    publisher: 'Reddit',
    category: 'Native Reddit',
    origin: 'native-reddit',
    tagline: 'Post and user flair templates.',
    description: 'Create and edit post & user flair templates. ModDesk reads these for Composer suggestions.',
    capabilities: ['Flair templates', 'Flair assignment'],
    permissions: ['Manage flair'],
    icon: '◈',
    iconTint: '#ffeadc',
    rating: 4.1,
    installs: 'Built-in',
    redditUrl: (s) => `https://www.reddit.com/r/${s}/about/flair`,
  },
  {
    id: 'rd-banned',
    name: 'Banned Users',
    publisher: 'Reddit',
    category: 'Native Reddit',
    origin: 'native-reddit',
    tagline: 'Native banned-users list.',
    description: 'Reddit\'s banned users surface with native ban edit flow.',
    capabilities: ['Ban / unban'],
    permissions: ['Access mod tools'],
    icon: '⊗',
    iconTint: '#ffeadc',
    rating: 4.2,
    installs: 'Built-in',
    redditUrl: (s) => `https://www.reddit.com/r/${s}/about/banned`,
  },
  {
    id: 'rd-wiki',
    name: 'Wiki',
    publisher: 'Reddit',
    category: 'Native Reddit',
    origin: 'native-reddit',
    tagline: 'Community wiki editor.',
    description: 'The wiki editor on Reddit. Automod config lives under wiki/config/automoderator and is editable here or in ModDesk\'s Automod Studio.',
    capabilities: ['Read / write wiki'],
    permissions: ['Wiki edit'],
    icon: '☰',
    iconTint: '#ffeadc',
    rating: 4.0,
    installs: 'Built-in',
    redditUrl: (s) => `https://www.reddit.com/r/${s}/wiki/index`,
  },
  {
    id: 'rd-traffic',
    name: 'Traffic Stats',
    publisher: 'Reddit',
    category: 'Analytics',
    origin: 'native-reddit',
    tagline: 'Subscriber growth and traffic.',
    description: 'Subscriber and traffic data. Not exposed via Devvit API — ModDesk links you to the official page.',
    capabilities: ['Page views', 'Subscribers'],
    permissions: ['Read traffic'],
    icon: '↗',
    iconTint: '#ffeadc',
    rating: 4.0,
    installs: 'Built-in',
    redditUrl: (s) => `https://www.reddit.com/r/${s}/about/traffic`,
  },
  {
    id: 'rd-crowdcontrol',
    name: 'Crowd Control',
    publisher: 'Reddit',
    category: 'Native Reddit',
    origin: 'native-reddit',
    tagline: 'Auto-collapse low-trust contributors.',
    description: 'Reddit\'s built-in crowd control settings.',
    capabilities: ['Threshold tuning'],
    permissions: ['Manage settings'],
    icon: '◐',
    iconTint: '#ffeadc',
    rating: 4.1,
    installs: 'Built-in',
    redditUrl: (s) => `https://www.reddit.com/mod/${s}/safety`,
  },

  // ── Popular Devvit apps (open on developers.reddit.com) ──────────────
  {
    id: 'dv-bot-bouncer',
    name: 'Bot Bouncer',
    publisher: 'Community',
    category: 'Devvit App',
    origin: 'devvit-store',
    tagline: 'Coordinated bot account detection.',
    description: 'Cross-community signal-sharing for botnet account flags. Auto-removes content from known accounts and shadow-actions new sightings into a review queue.',
    capabilities: ['onPostSubmit', 'onCommentSubmit', 'Cross-sub signals'],
    permissions: ['Read posts/comments', 'Remove content'],
    icon: '◬',
    iconTint: '#e0f7fa',
    rating: 4.9,
    installs: '24.1k',
    featured: true,
    devvitUrl: 'https://developers.reddit.com/apps/bot-bouncer',
  },
  {
    id: 'dv-community-hub',
    name: 'Community Hub',
    publisher: 'Community',
    category: 'Devvit App',
    origin: 'devvit-store',
    tagline: 'Sidebar widgets and welcome posts.',
    description: 'Drop a customizable Community Hub post that pins resources, rules, and event links for newcomers.',
    capabilities: ['Custom post type', 'Wiki widgets'],
    permissions: ['Submit posts', 'Read wiki'],
    icon: '◇',
    iconTint: '#fff4e5',
    rating: 4.5,
    installs: '8.6k',
    devvitUrl: 'https://developers.reddit.com/apps/community-hub',
  },
  {
    id: 'dv-modnews',
    name: 'Mod News',
    publisher: 'Reddit',
    category: 'Devvit App',
    origin: 'devvit-store',
    tagline: 'Live admin announcements and policy updates.',
    description: 'Pulls /r/modnews and Reddit-wide policy bulletins into your mod surface so the team sees changes before users complain.',
    capabilities: ['Scheduler', 'External fetch'],
    permissions: ['HTTP fetch to reddit.com'],
    icon: '◔',
    iconTint: '#f3e5f5',
    rating: 4.4,
    installs: '6.2k',
    devvitUrl: 'https://developers.reddit.com/apps/mod-news',
  },
  {
    id: 'dv-comment-nuke',
    name: 'Comment Nuke',
    publisher: 'Community',
    category: 'Automation',
    origin: 'devvit-store',
    tagline: 'Remove a whole comment subtree in one click.',
    description: 'Adds a moderator context menu item to recursively remove a comment branch with audit trail and undo window.',
    capabilities: ['Menu item', 'Comment tree traversal'],
    permissions: ['Read comments', 'Remove comments'],
    icon: '⌖',
    iconTint: '#ffebee',
    rating: 4.7,
    installs: '11.3k',
    devvitUrl: 'https://developers.reddit.com/apps/comment-nuke',
  },
  {
    id: 'dv-modmail-replies',
    name: 'Modmail Quick Replies',
    publisher: 'Community',
    category: 'Automation',
    origin: 'devvit-store',
    tagline: 'Saved replies for modmail with macros.',
    description: 'Template library specifically for modmail with rule-link macros and tone presets. Complementary to ModDesk\'s Saved Responses.',
    capabilities: ['Modmail templates', 'Macro expansion'],
    permissions: ['Read modmail', 'Reply'],
    icon: '✉',
    iconTint: '#e8eaf6',
    rating: 4.6,
    installs: '7.4k',
    devvitUrl: 'https://developers.reddit.com/apps/modmail-quick-replies',
  },
  {
    id: 'dv-reposting-radar',
    name: 'Repost Radar',
    publisher: 'Community',
    category: 'Safety',
    origin: 'devvit-store',
    tagline: 'Detect reposted images and crossposts.',
    description: 'Perceptual hash check against your community\'s history. Optional Karma-Decay style cross-sub match.',
    capabilities: ['Image hash', 'Redis history'],
    permissions: ['Read posts', 'Flag posts'],
    icon: '◌',
    iconTint: '#e0f2f1',
    rating: 4.5,
    installs: '5.8k',
    devvitUrl: 'https://developers.reddit.com/apps/repost-radar',
  },
  {
    id: 'dv-flair-helper',
    name: 'Flair Helper',
    publisher: 'Community',
    category: 'Automation',
    origin: 'devvit-store',
    tagline: 'Click a flair → remove + reply automatically.',
    description: 'Pair flair templates with removal reasons and reply macros. The classic flair-helper bot, ported to Devvit.',
    capabilities: ['Menu item', 'Flair triggers'],
    permissions: ['Read posts', 'Remove posts', 'Set flair'],
    icon: '⌑',
    iconTint: '#f1f8e9',
    rating: 4.8,
    installs: '14.7k',
    featured: true,
    devvitUrl: 'https://developers.reddit.com/apps/flair-helper',
  },
  {
    id: 'dv-context-mod',
    name: 'ContextMod',
    publisher: 'Community',
    category: 'Automation',
    origin: 'devvit-store',
    tagline: 'YAML-defined cross-post user history rules.',
    description: 'Run multi-step checks across a user\'s history (subreddit activity, age, karma per sub) without hand-writing Automod.',
    capabilities: ['User history', 'YAML rules'],
    permissions: ['Read user history', 'Remove content'],
    icon: '⌬',
    iconTint: '#fce4ec',
    rating: 4.6,
    installs: '6.9k',
    devvitUrl: 'https://developers.reddit.com/apps/contextmod',
  },
  {
    id: 'dv-toolbox',
    name: 'Toolbox Lite',
    publisher: 'Community',
    category: 'Devvit App',
    origin: 'devvit-store',
    tagline: 'Classic toolbox usernotes, ported.',
    description: 'Read and write toolbox-format usernotes from inside Devvit. Compatible with the legacy Chrome extension.',
    capabilities: ['Wiki usernotes', 'Notes UI'],
    permissions: ['Wiki read/write'],
    icon: '⊞',
    iconTint: '#ede7f6',
    rating: 4.4,
    installs: '4.1k',
    devvitUrl: 'https://developers.reddit.com/apps/toolbox-lite',
  },
  {
    id: 'dv-scheduler',
    name: 'Post Scheduler',
    publisher: 'Community',
    category: 'Devvit App',
    origin: 'devvit-store',
    tagline: 'Schedule recurring sticky / megathread posts.',
    description: 'Cron-driven recurring posts with template variables. Replaces the most common AutoModerator scheduler hack.',
    capabilities: ['scheduler.runJob', 'submitPost'],
    permissions: ['Submit posts', 'Sticky posts'],
    icon: '◷',
    iconTint: '#e1f5fe',
    rating: 4.7,
    installs: '9.2k',
    devvitUrl: 'https://developers.reddit.com/apps/post-scheduler',
  },

  // ── Developer Platform meta links ─────────────────────────────────────
  {
    id: 'dv-browse-all',
    name: 'Browse All Devvit Apps',
    publisher: 'Reddit',
    category: 'Developer Platform',
    origin: 'devvit-store',
    tagline: 'Full Reddit Developer Apps directory.',
    description: 'Search and discover every Devvit app published on the Developer Platform.',
    capabilities: ['Full directory'],
    permissions: ['—'],
    icon: '⌘',
    iconTint: '#eceff1',
    rating: 5.0,
    installs: 'Directory',
    devvitUrl: 'https://developers.reddit.com/apps',
  },
];

const CATEGORIES: Array<AppCategory | 'All' | 'Featured'> = [
  'All',
  'Featured',
  'Native Reddit',
  'ModDesk Module',
  'Devvit App',
  'Automation',
  'Safety',
  'Analytics',
  'Developer Platform',
];

type Tab = 'discover' | 'categories' | 'my-apps' | 'updates';

type StoreState = {
  installed: string[];
  liked: string[];
};

const storageKey = (sub: string) => `moddesk-os:v1:store:${sub.toLowerCase()}`;

const loadState = (sub: string): StoreState => {
  if (typeof window === 'undefined') return { installed: [], liked: [] };
  try {
    const raw = window.localStorage.getItem(storageKey(sub));
    if (!raw) return { installed: [], liked: [] };
    const parsed = JSON.parse(raw) as Partial<StoreState>;
    return {
      installed: Array.isArray(parsed.installed) ? parsed.installed : [],
      liked: Array.isArray(parsed.liked) ? parsed.liked : [],
    };
  } catch {
    return { installed: [], liked: [] };
  }
};

const saveState = (sub: string, state: StoreState) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(sub), JSON.stringify(state));
  } catch {
    /* quota / disabled storage — silently degrade */
  }
};

const canManage = (role: string): boolean =>
  role === 'owner' || role === 'admin';

const Stars: React.FC<{ rating: number }> = ({ rating }) => {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span className="store-stars" aria-label={`${rating.toFixed(1)} of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={i < full ? 'on' : i === full && half ? 'half' : 'off'}>
          ★
        </span>
      ))}
      <em>{rating.toFixed(1)}</em>
    </span>
  );
};

const AppTile: React.FC<{
  app: CatalogApp;
  installed: boolean;
  liked: boolean;
  onSelect: () => void;
  onLike: () => void;
}> = ({ app, installed, liked, onSelect, onLike }) => (
  <button type="button" className="store-tile" onClick={onSelect}>
    <span className="store-tile-icon" style={{ background: app.iconTint }}>{app.icon}</span>
    <div className="store-tile-body">
      <strong>{app.name}</strong>
      <span className="store-tile-pub">{app.publisher} · {app.category}</span>
      <p>{app.tagline}</p>
      <div className="store-tile-meta">
        <Stars rating={app.rating} />
        <span className="store-tile-installs">{app.installs}</span>
      </div>
    </div>
    <div className="store-tile-actions" onClick={(e) => e.stopPropagation()}>
      <span className={`store-state ${installed ? 'on' : 'off'}`}>
        {installed ? (app.preinstalled ? 'Built-in' : 'Installed') : 'Available'}
      </span>
      <button
        type="button"
        className={`store-like ${liked ? 'on' : ''}`}
        aria-label={liked ? 'Unlike' : 'Like'}
        onClick={onLike}
      >
        {liked ? '♥' : '♡'}
      </button>
    </div>
  </button>
);

export const DeveloperAppsPanel: React.FC<DeveloperAppsPanelProps> = ({ session, onLaunch }) => {
  const subreddit = (session?.subredditName ?? 'current-subreddit').replace(/^r\//i, '');
  const role = session?.modDeskRole ?? 'observer';
  const manageable = canManage(role);

  const [tab, setTab] = useState<Tab>('discover');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All');
  const [sort, setSort] = useState<'featured' | 'name' | 'rating' | 'installs'>('featured');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [state, setState] = useState<StoreState>(() => loadState(subreddit));
  const [stateSub, setStateSub] = useState(subreddit);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  if (stateSub !== subreddit) {
    setStateSub(subreddit);
    setState(loadState(subreddit));
  }

  useEffect(() => {
    saveState(subreddit, state);
  }, [subreddit, state]);

  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
  }, []);

  const installedSet = useMemo(() => {
    const s = new Set<string>(state.installed);
    for (const app of CATALOG) if (app.preinstalled) s.add(app.id);
    return s;
  }, [state.installed]);

  const likedSet = useMemo(() => new Set(state.liked), [state.liked]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  const install = (app: CatalogApp) => {
    if (!manageable) {
      showToast('Install changes require owner/admin access.');
      return;
    }
    if (app.preinstalled) {
      showToast(`${app.name} is built into ModDesk.`);
      return;
    }
    setState((prev) =>
      prev.installed.includes(app.id) ? prev : { ...prev, installed: [...prev.installed, app.id] }
    );
    showToast(
      app.origin === 'devvit-store'
        ? `Marked ${app.name} as installed. Managed on Reddit Developer Platform.`
        : `${app.name} installed for r/${subreddit}.`
    );
    if (app.origin === 'devvit-store' && app.devvitUrl) navigateTo(app.devvitUrl);
  };

  const uninstall = (app: CatalogApp) => {
    if (!manageable) {
      showToast('Uninstall changes require owner/admin access.');
      return;
    }
    if (app.preinstalled) {
      showToast(`${app.name} is built in and cannot be uninstalled.`);
      return;
    }
    setState((prev) => ({ ...prev, installed: prev.installed.filter((id) => id !== app.id) }));
    showToast(`${app.name} removed from r/${subreddit}.`);
  };

  const toggleLike = (app: CatalogApp) => {
    setState((prev) => {
      const has = prev.liked.includes(app.id);
      return { ...prev, liked: has ? prev.liked.filter((id) => id !== app.id) : [...prev.liked, app.id] };
    });
  };

  const launch = (app: CatalogApp) => {
    if (app.origin === 'internal' && app.launchTarget) {
      if (onLaunch) onLaunch(app.launchTarget);
      else showToast('In-app launch not wired in this build.');
      return;
    }
    const url = app.redditUrl ? app.redditUrl(subreddit) : app.devvitUrl;
    if (url) navigateTo(url);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let pool = CATALOG.slice();

    if (tab === 'my-apps') {
      pool = pool.filter((a) => installedSet.has(a.id) || likedSet.has(a.id));
    } else if (tab === 'updates') {
      pool = pool.filter((a) => a.origin === 'devvit-store' && installedSet.has(a.id));
    }

    if (category === 'Featured') pool = pool.filter((a) => a.featured);
    else if (category !== 'All') pool = pool.filter((a) => a.category === category);

    if (q) {
      pool = pool.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.tagline.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.publisher.toLowerCase().includes(q) ||
          a.category.toLowerCase().includes(q)
      );
    }

    if (sort === 'name') pool.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'rating') pool.sort((a, b) => b.rating - a.rating);
    else if (sort === 'installs') {
      const score = (s: string) => {
        const m = s.match(/([\d.]+)\s*k/i);
        if (m) return parseFloat(m[1] ?? '0') * 1000;
        const n = parseFloat(s);
        return Number.isFinite(n) ? n : 0;
      };
      pool.sort((a, b) => score(b.installs) - score(a.installs));
    } else {
      pool.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    }

    return pool;
  }, [tab, category, query, sort, installedSet, likedSet]);

  const featured = useMemo(() => CATALOG.filter((a) => a.featured).slice(0, 6), []);
  const selected = useMemo(() => CATALOG.find((a) => a.id === selectedId) ?? null, [selectedId]);

  if (selected) {
    const isInstalled = installedSet.has(selected.id);
    const isLiked = likedSet.has(selected.id);
    const previewUrl =
      selected.redditUrl?.(subreddit) ?? selected.devvitUrl ?? null;

    return (
      <div className="store-panel">
        <header className="store-detail-header">
          <button type="button" className="glass-btn" onClick={() => setSelectedId(null)}>
            ← Back to store
          </button>
          <div className="store-detail-hero">
            <span className="store-detail-icon" style={{ background: selected.iconTint }}>
              {selected.icon}
            </span>
            <div>
              <span className="module-eyebrow">{selected.category}</span>
              <h2>{selected.name}</h2>
              <p className="store-detail-pub">
                by {selected.publisher} · <Stars rating={selected.rating} /> · {selected.installs} installs
              </p>
              <p className="store-detail-tagline">{selected.tagline}</p>
            </div>
          </div>
          <div className="store-detail-cta">
            {selected.origin === 'internal' ? (
              <button
                type="button"
                className="glass-btn primary"
                onClick={() => launch(selected)}
                disabled={!selected.launchTarget}
              >
                Open inside ModDesk
              </button>
            ) : (
              <button type="button" className="glass-btn primary" onClick={() => launch(selected)}>
                Open on Reddit ↗
              </button>
            )}
            {isInstalled ? (
              <button
                type="button"
                className="glass-btn"
                onClick={() => uninstall(selected)}
                disabled={!manageable || selected.preinstalled}
                title={selected.preinstalled ? 'Built-in module' : !manageable ? 'Owner/admin role required' : ''}
              >
                {selected.preinstalled ? 'Built-in' : 'Uninstall'}
              </button>
            ) : (
              <button
                type="button"
                className="glass-btn"
                onClick={() => install(selected)}
                disabled={!manageable}
                title={!manageable ? 'Owner/admin role required' : ''}
              >
                Install
              </button>
            )}
            <button
              type="button"
              className={`store-like detail ${isLiked ? 'on' : ''}`}
              onClick={() => toggleLike(selected)}
              aria-label={isLiked ? 'Unlike' : 'Like'}
            >
              {isLiked ? '♥ Liked' : '♡ Like'}
            </button>
          </div>
        </header>

        <section className="store-detail-grid">
          <article className="store-detail-card">
            <span className="module-eyebrow">About</span>
            <p>{selected.description}</p>
          </article>
          <article className="store-detail-card">
            <span className="module-eyebrow">Capabilities</span>
            <ul>{selected.capabilities.map((c) => <li key={c}>{c}</li>)}</ul>
          </article>
          <article className="store-detail-card">
            <span className="module-eyebrow">Permissions</span>
            <ul>{selected.permissions.map((p) => <li key={p}>{p}</li>)}</ul>
          </article>
          <article className="store-detail-card">
            <span className="module-eyebrow">Subreddit</span>
            <p>
              Installed scope: <strong>r/{subreddit}</strong>
              <br />
              Your role: <strong>{role}</strong>
              {!manageable && (
                <>
                  <br />
                  <em>Install / uninstall is owner/admin only.</em>
                </>
              )}
            </p>
          </article>
        </section>

        {previewUrl && selected.origin !== 'internal' && (
          <section className="store-detail-preview">
            <div className="store-preview-bar">
              <span className="module-eyebrow">Official link</span>
              <code>{previewUrl}</code>
              <button
                type="button"
                className="glass-btn"
                onClick={() => {
                  navigator.clipboard?.writeText(previewUrl).catch(() => {
                    const ta = document.createElement('textarea');
                    ta.value = previewUrl;
                    document.body.appendChild(ta);
                    ta.select();
                    try { document.execCommand('copy'); } catch { /* noop */ }
                    document.body.removeChild(ta);
                  });
                  showToast('URL copied to clipboard.');
                }}
              >
                Copy URL
              </button>
              <button type="button" className="glass-btn primary" onClick={() => navigateTo(previewUrl)}>
                Open ↗
              </button>
            </div>
            <div className="store-preview-frame store-preview-frame--launcher">
              <div className="store-preview-fallback">
                <strong>Open on Reddit</strong>
                <p>
                  reddit.com and developers.reddit.com send <code>X-Frame-Options: DENY</code>, so this preview is
                  almost always blank. Use <em>Open ↗</em> or <em>Copy URL</em> to view the live page.
                </p>
              </div>
            </div>
          </section>
        )}

        {toast && <div className="store-toast">{toast}</div>}
      </div>
    );
  }

  return (
    <div className="store-panel">
      <header className="store-header">
        <div>
          <span className="module-eyebrow">ModDesk App Store</span>
          <h2>Reddit Developer Apps</h2>
          <p>
            Install, manage, and launch mod tools for r/{subreddit}. ModDesk modules open inside this window; Reddit-native
            surfaces deep-link out because Reddit blocks iframe embedding.
          </p>
        </div>
        <div className="store-header-meta">
          <span>Role</span>
          <strong>{role === 'owner' ? 'Owner' : role === 'admin' ? 'Admin' : role === 'moderator' ? 'Moderator' : role === 'trainee' ? 'Trainee' : 'Observer'}</strong>
          {!manageable && <em>Read-only</em>}
        </div>
      </header>

      <nav className="store-tabs" role="tablist">
        {([
          ['discover', 'Discover'],
          ['categories', 'Categories'],
          ['my-apps', `My Apps (${installedSet.size})`],
          ['updates', 'Updates'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'active' : ''}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'discover' && (
        <section className="store-featured">
          <span className="module-eyebrow">Editor's picks for r/{subreddit}</span>
          <div className="store-featured-row">
            {featured.map((app) => (
              <button
                key={app.id}
                type="button"
                className="store-feature-card"
                onClick={() => setSelectedId(app.id)}
                style={{ background: app.iconTint }}
              >
                <span className="store-feature-icon">{app.icon}</span>
                <strong>{app.name}</strong>
                <p>{app.tagline}</p>
                <em>{app.category}</em>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="store-toolbar">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search apps, capabilities, publishers..."
          aria-label="Search store"
        />
        {tab !== 'my-apps' && tab !== 'updates' && (
          <div className="store-chips" role="tablist" aria-label="Categories">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                className={category === c ? 'active' : ''}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
        )}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          aria-label="Sort"
        >
          <option value="featured">Featured</option>
          <option value="rating">Top rated</option>
          <option value="installs">Most installed</option>
          <option value="name">A → Z</option>
        </select>
      </section>

      {filtered.length === 0 ? (
        <div className="store-empty">
          <strong>No apps match.</strong>
          <p>
            {tab === 'my-apps'
              ? 'Install or like apps to see them here.'
              : tab === 'updates'
              ? 'No installed Devvit apps have pending updates.'
              : 'Try a different search or category.'}
          </p>
        </div>
      ) : (
        <section className="store-grid" aria-label="Apps">
          {filtered.map((app) => (
            <AppTile
              key={app.id}
              app={app}
              installed={installedSet.has(app.id)}
              liked={likedSet.has(app.id)}
              onSelect={() => setSelectedId(app.id)}
              onLike={() => toggleLike(app)}
            />
          ))}
        </section>
      )}

      <footer className="store-footer">
        <div>
          <strong>{CATALOG.length}</strong> apps in catalog · <strong>{installedSet.size}</strong> installed · <strong>{likedSet.size}</strong> liked
        </div>
        <div className="store-footer-links">
          <button type="button" className="glass-btn" onClick={() => navigateTo('https://developers.reddit.com/apps')}>
            Browse all on Reddit ↗
          </button>
          <button type="button" className="glass-btn" onClick={() => navigateTo('https://developers.reddit.com/docs')}>
            Developer docs ↗
          </button>
          <button type="button" className="glass-btn" onClick={() => navigateTo(`https://developers.reddit.com/r/${subreddit}/apps`)}>
            Manage r/{subreddit} apps ↗
          </button>
        </div>
      </footer>

      {toast && <div className="store-toast">{toast}</div>}
    </div>
  );
};
