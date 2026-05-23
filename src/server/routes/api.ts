/* eslint-disable @typescript-eslint/no-explicit-any */
import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import { buildStructuredFallbackReply } from '../services/sentinel/fallback';
import type {
  ApiError,
  AiChatMessage,
  AiChatRequest,
  AiChatResponse,
  AiContextSource,
  AppSettings,
  AuditEvent,
  ConsensusTicket,
  ConsensusVote,
  ComposerDraftRequest,
  ComposerDraftResponse,
  CreateHandoffRequest,
  CreateTicketRequest,
  CrisisRadarCase,
  CrisisRadarResponse,
  CrisisSignal,
  DashboardResponse,
  HandoffRecord,
  HandoffResponse,
  LiveInsightResponse,
  LiveInsightRule,
  ModeratorProfile,
  QueueActionRequest,
  QueueItem,
  ResponseTemplate,
  SaveTemplateRequest,
  SessionResponse,
  Severity,
  SubredditInstall,
  SubmitAttemptRequest,
  SubmitAttemptResponse,
  TemplateStatus,
  TicketDetailResponse,
  TicketStatus,
  TrainingAttempt,
  TrainingScenario,
  UpdateSettingsRequest,
  VoteRequest,
} from '../../shared/api';

export const api = new Hono();

const NS = 'moddesk-os:v1';
const key = (name: string) => `${NS}:${context.subredditName ?? 'testsubreddit'}:${name}`;
const now = () => new Date().toISOString();
const id = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

type ModContextState = {
  username: string | null;
  subredditName: string;
  isModerator: boolean;
  modPermissions: string[];
  subredditIconUrl: string | null;
  subredditSubscribers: number | null;
  redisStatus: 'ok' | 'degraded';
};

type RagDocument = {
  id: string;
  title: string;
  type: AiContextSource['type'];
  content: string;
};

type LiveTriggerEvent = {
  id: string;
  kind: 'post-report' | 'comment-report' | 'mod-action' | 'mod-mail' | 'app-install';
  createdAt: string;
  actor?: string | null;
  target?: string | null;
  summary: string;
};

const installsKey = (username: string) => `${NS}:installs:${username.toLowerCase()}`;

async function touchInstall(
  username: string,
  install: Omit<SubredditInstall, 'lastSeenAt'> & { lastSeenAt?: string }
): Promise<void> {
  try {
    const record: SubredditInstall = {
      subredditName: install.subredditName,
      iconUrl: install.iconUrl ?? null,
      subscribers: install.subscribers ?? null,
      lastSeenAt: install.lastSeenAt ?? now(),
    };
    await redis.hSet(installsKey(username), { [install.subredditName]: JSON.stringify(record) });
  } catch (err) {
    console.error('touchInstall failed', err);
  }
}

async function getInstalls(username: string): Promise<SubredditInstall[]> {
  try {
    const raw = await redis.hGetAll(installsKey(username));
    if (!raw) return [];
    const entries: SubredditInstall[] = [];
    for (const value of Object.values(raw)) {
      try {
        entries.push(JSON.parse(value as string) as SubredditInstall);
      } catch {
        /* skip malformed */
      }
    }
    entries.sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1));
    return entries;
  } catch (err) {
    console.error('getInstalls failed', err);
    return [];
  }
}

function mergeInstalls(...groups: SubredditInstall[][]): SubredditInstall[] {
  const byName = new Map<string, SubredditInstall>();
  for (const group of groups) {
    for (const install of group) {
      const normalized = install.subredditName.replace(/^r\//i, '');
      const existing = byName.get(normalized.toLowerCase());
      byName.set(normalized.toLowerCase(), {
        subredditName: normalized,
        iconUrl: install.iconUrl ?? existing?.iconUrl ?? null,
        subscribers: install.subscribers ?? existing?.subscribers ?? null,
        lastSeenAt: existing && existing.lastSeenAt > install.lastSeenAt ? existing.lastSeenAt : install.lastSeenAt,
      });
    }
  }
  return Array.from(byName.values()).sort((a, b) => {
    if (a.subredditName.toLowerCase() === b.subredditName.toLowerCase()) return 0;
    return b.lastSeenAt.localeCompare(a.lastSeenAt);
  });
}

async function getModeratedCommunities(username: string, current?: SubredditInstall): Promise<SubredditInstall[]> {
  const stored = await getInstalls(username);
  const live: SubredditInstall[] = [];
  try {
    const modmailSubs = await reddit.modMail.getSubreddits();
    for (const sub of Object.values(modmailSubs)) {
      const subredditName = sub.displayName ?? sub.name;
      if (!subredditName) continue;
      live.push({
        subredditName: subredditName.replace(/^r\//i, ''),
        iconUrl: sub.communityIcon ?? sub.icon ?? null,
        subscribers: sub.subscribers ?? null,
        lastSeenAt: sub.lastUpdated ?? now(),
      });
    }
  } catch (err) {
    console.warn('Modmail subreddit discovery unavailable; using local install history.', err);
  }
  return mergeInstalls(current ? [current] : [], live, stored);
}

type RedditThingId = `t1_${string}` | `t3_${string}`;

class AuthError extends Error {
  constructor(
    public readonly code: NonNullable<ApiError['code']>,
    message: string,
    public readonly statusCode: 401 | 403 | 503 = 403
  ) {
    super(message);
  }
}

api.onError((error, c) => {
  if (error instanceof AuthError) {
    return c.json<ApiError>({ status: 'error', code: error.code, message: error.message }, error.statusCode);
  }
  console.error('Unhandled ModDesk API error', error);
  return c.json<ApiError>({ status: 'error', code: 'REDDIT_API_UNAVAILABLE', message: 'ModDesk API request failed.' }, 500);
});

const json = {
  async get<T>(redisKey: string): Promise<T | undefined> {
    const raw = await redis.get(redisKey);
    return raw ? (JSON.parse(raw) as T) : undefined;
  },
  async set<T>(redisKey: string, value: T): Promise<void> {
    await redis.set(redisKey, JSON.stringify(value));
  },
};

const ruleTitle = (ruleId: string) => {
  const titles: Record<string, string> = {
    'rule-1': 'Civility',
    'rule-2': 'Stay on Topic',
    'rule-3': 'Spam / Self-Promo',
    'rule-4': 'Duplicate / Megathread',
    'rule-5': 'Crisis or Safety Escalation',
  };
  return titles[ruleId] ?? ruleId;
};

const defaultSettings = (subredditName: string): AppSettings => ({
  subredditName,
  initializedAt: now(),
  consensusThresholdMode: 'fixed_count',
  consensusFixedCount: 3,
  consensusPercent: 67,
  highImpactActions: ['Permanent ban', 'Long mute', 'Thread lock', 'Sticky announcement'],
  trainingRequiredLevel: 3,
  themeMode: 'authentic',
  mobileCompactMode: false,
  anonymousVotesUntilClosed: false,
  templateApprovalRequired: false,
  scenarioDifficultyMix: 'balanced',
  workspaceMode: 'live',
});

const profileFor = (username: string): ModeratorProfile => ({
  username,
  firstSeenAt: now(),
  roleLabel: 'Trainee',
  trainingLevel: 1,
  xp: 0,
  totalScenarios: 0,
  correctScenarios: 0,
  queueReviewed: 0,
  consensusVotesCast: 0,
  streak: 0,
  lastActiveAt: now(),
  missedConcepts: [],
});

const seedScenarios = (): TrainingScenario[] => [
  {
    scenarioId: 'scenario-spam-link',
    sourceType: 'post',
    title: 'Discount mirror site posted by a new account',
    bodyExcerpt:
      'New account posts a shortened URL promising free game keys. Reports mention affiliate spam and previous removals.',
    authorNameHash: 'u/moddesk-demo-41f',
    reportReasons: ['Spam', 'Suspicious link', 'Self-promotion'],
    expectedAction: 'remove',
    expectedRuleId: 'rule-3',
    difficulty: 'easy',
    explanation:
      'The link pattern, new-account context, and repeated promotional wording make this a clear Rule 3 removal.',
    tags: ['spam', 'links', 'new-account'],
    createdBy: 'system',
    createdAt: now(),
    status: 'active',
  },
  {
    scenarioId: 'scenario-borderline-insult',
    sourceType: 'comment',
    title: 'Heated reply with borderline insult',
    bodyExcerpt:
      'A user calls another commenter dishonest and clueless during a fast-moving argument, but also includes on-topic evidence.',
    authorNameHash: 'u/moddesk-demo-8b2',
    reportReasons: ['Harassment', 'Be civil'],
    expectedAction: 'filter',
    expectedRuleId: 'rule-1',
    difficulty: 'medium',
    explanation:
      'Filtering or holding for senior review preserves useful context while preventing the argument from escalating.',
    tags: ['civility', 'edge-case'],
    createdBy: 'system',
    createdAt: now(),
    status: 'active',
  },
  {
    scenarioId: 'scenario-duplicate-news',
    sourceType: 'post',
    title: 'Breaking news link already covered in megathread',
    bodyExcerpt:
      'A second submission repeats a news item that is already pinned in a megathread with active discussion.',
    authorNameHash: 'u/moddesk-demo-2cc',
    reportReasons: ['Duplicate', 'Megathread'],
    expectedAction: 'remove',
    expectedRuleId: 'rule-4',
    difficulty: 'medium',
    explanation:
      'Duplicate news should be redirected to the active megathread to keep discussion consolidated.',
    tags: ['duplicate', 'megathread'],
    createdBy: 'system',
    createdAt: now(),
    status: 'active',
  },
  {
    scenarioId: 'scenario-self-harm',
    sourceType: 'comment',
    title: 'Possible self-harm report in a comment chain',
    bodyExcerpt:
      'A user writes that they might hurt themselves tonight. Other users are arguing under the same comment.',
    authorNameHash: 'u/moddesk-demo-f11',
    reportReasons: ['Self-harm', 'Urgent safety'],
    expectedAction: 'escalate',
    expectedRuleId: 'rule-5',
    difficulty: 'hard',
    explanation:
      'Urgent safety reports should be escalated and handled with care. Do not treat this as a points-earning queue clear.',
    tags: ['safety', 'urgent'],
    createdBy: 'system',
    createdAt: now(),
    status: 'active',
  },
  {
    scenarioId: 'scenario-flamebait',
    sourceType: 'post',
    title: 'Ambiguous political flamebait during a sensitive news cycle',
    bodyExcerpt:
      'The post is technically on topic, but the title uses loaded phrasing and the first comments show brigading risk.',
    authorNameHash: 'u/moddesk-demo-a77',
    reportReasons: ['Flamebait', 'Possible raid', 'Off-topic'],
    expectedAction: 'escalate',
    expectedRuleId: 'rule-2',
    difficulty: 'hard',
    explanation:
      'Ambiguous high-impact political moderation benefits from consensus before locking or removing a visible thread.',
    tags: ['governance', 'brigading', 'high-impact'],
    createdBy: 'system',
    createdAt: now(),
    status: 'active',
  },
  {
    scenarioId: 'scenario-doxxing',
    sourceType: 'comment',
    title: 'Comment posts another user’s real name and workplace',
    bodyExcerpt:
      'Comment reveals "I looked up this person on LinkedIn — their real name is REDACTED and they work at REDACTED."',
    authorNameHash: 'u/moddesk-demo-d0x',
    reportReasons: ['Doxxing', 'Personal info', 'Site-wide rule'],
    expectedAction: 'remove',
    expectedRuleId: 'rule-5',
    difficulty: 'easy',
    explanation:
      'Posting personal information is a Reddit site-wide violation. Remove immediately and report to admins via the safety form.',
    tags: ['doxxing', 'site-wide', 'safety'],
    createdBy: 'system',
    createdAt: now(),
    status: 'active',
  },
  {
    scenarioId: 'scenario-ban-evasion',
    sourceType: 'comment',
    title: 'Newly-created account posting in style of a recently banned user',
    bodyExcerpt:
      'Day-old account using the same niche phrasing, slurs, and topic obsession as last week’s permaban. Modmail confirmed identity in private.',
    authorNameHash: 'u/moddesk-demo-evd',
    reportReasons: ['Ban evasion', 'Suspected alt'],
    expectedAction: 'escalate',
    expectedRuleId: 'rule-5',
    difficulty: 'medium',
    explanation:
      'Ban evasion is a site-wide violation. Escalate so a senior mod can submit to Reddit admins with the evidence trail.',
    tags: ['ban-evasion', 'site-wide'],
    createdBy: 'system',
    createdAt: now(),
    status: 'active',
  },
  {
    scenarioId: 'scenario-nsfw-untagged',
    sourceType: 'post',
    title: 'Borderline NSFW image without tag in a SFW community',
    bodyExcerpt:
      'Post is an image with strong sexual undertones — would be allowed in a NSFW-tagged sub but this community is SFW-only.',
    authorNameHash: 'u/moddesk-demo-nsf',
    reportReasons: ['NSFW', 'Untagged sexual content'],
    expectedAction: 'remove',
    expectedRuleId: 'rule-2',
    difficulty: 'easy',
    explanation:
      'NSFW content in a SFW community is a clear removal. Send a templated removal reason that points to the NSFW rule.',
    tags: ['nsfw', 'tagging'],
    createdBy: 'system',
    createdAt: now(),
    status: 'active',
  },
  {
    scenarioId: 'scenario-brigade-detected',
    sourceType: 'post',
    title: 'Sudden brigade from a linked external community',
    bodyExcerpt:
      'In ten minutes the post jumped from 12 upvotes to -300. New accounts piling in with identical low-effort insults — a known sub is linking here.',
    authorNameHash: 'u/moddesk-demo-brg',
    reportReasons: ['Brigade', 'Vote manipulation', 'Mass downvotes'],
    expectedAction: 'escalate',
    expectedRuleId: 'rule-2',
    difficulty: 'hard',
    explanation:
      'Brigades require a quick lock + admin report with the inbound subreddit. Escalate to consensus before removing the OP\'s on-topic post.',
    tags: ['brigading', 'vote-manipulation'],
    createdBy: 'system',
    createdAt: now(),
    status: 'active',
  },
  {
    scenarioId: 'scenario-low-effort',
    sourceType: 'post',
    title: 'One-line low-effort meme in a discussion sub',
    bodyExcerpt:
      'Image macro with the caption "lol same" — no substantive content. Sub rules require text discussion posts only.',
    authorNameHash: 'u/moddesk-demo-mem',
    reportReasons: ['Low effort', 'Off-topic'],
    expectedAction: 'remove',
    expectedRuleId: 'rule-2',
    difficulty: 'easy',
    explanation:
      'Low-effort image posts in a discussion-only sub are removable. A short templated reply is enough.',
    tags: ['low-effort'],
    createdBy: 'system',
    createdAt: now(),
    status: 'active',
  },
  {
    scenarioId: 'scenario-misinfo-edge',
    sourceType: 'post',
    title: 'Borderline misinformation citing a real-but-stale study',
    bodyExcerpt:
      'Post links to a 2014 retracted study to support a current health claim. Comments are pushing back factually but heatedly.',
    authorNameHash: 'u/moddesk-demo-mis',
    reportReasons: ['Misinformation', 'Out-of-date source'],
    expectedAction: 'filter',
    expectedRuleId: 'rule-2',
    difficulty: 'hard',
    explanation:
      'Filter for senior review — let the discussion add the correction context rather than removing outright. Distinguish a correcting comment if available.',
    tags: ['misinformation', 'edge-case'],
    createdBy: 'system',
    createdAt: now(),
    status: 'active',
  },
];

const seedTickets = (username: string): ConsensusTicket[] => [
  makeTicket('Permanent ban', 'user', 'u_spamwave', 'u/SpamWave', username, 'Repeated spam after warnings', 'high', [
    'https://reddit.com/r/example/comments/demo1',
    'Mod note: removed similar links three times',
  ]),
  makeTicket('Long mute', 'user', 'u_modmail_abuse', 'u/AngryMailbox', username, 'Abusive modmail after removal', 'medium', [
    'modmail://thread/demo-abuse',
  ]),
  makeTicket(
    'Sticky announcement',
    'announcement',
    'sticky-rule-clarify',
    'Emergency rule clarification',
    username,
    'Visible clarification during breaking-news surge',
    'high',
    ['Draft announcement: Keep reports factual and avoid personal attacks']
  ),
  makeTicket('Thread lock', 'thread', 't3_brigade_demo', 'Brigading concern thread', username, 'Vote spike and hostile imports', 'critical', [
    't3_brigade_demo',
    'Reports increased from 2 to 28 in 15 minutes',
  ]),
];

const seedTemplates = (username: string): ResponseTemplate[] => [
  makeTemplate(
    'Rule 1 civility removal',
    'rule-1',
    'neutral',
    'Hi {username}, your {post_title} was removed under **Rule 1: Civility**.\n\nPlease focus on ideas rather than personal attacks. You can appeal by replying in {modmail_link}.',
    username
  ),
  makeTemplate(
    'Rule 3 spam/self-promo removal',
    'rule-3',
    'strict',
    'Your post was removed under **Rule 3: Spam / Self-Promotion**.\n\nPromotional links must follow our community rules: {rule_link}.',
    username
  ),
  makeTemplate(
    'Duplicate / megathread redirect',
    'rule-4',
    'friendly',
    'Thanks for posting. This topic is already being discussed in the active megathread, so we removed this duplicate.\n\nPlease continue here: {rule_link}.',
    username
  ),
  makeTemplate(
    'Appeal instructions',
    'rule-1',
    'educational',
    'If you believe this was a mistake, contact the mod team through {modmail_link}. Include the removed item and a short explanation.',
    username
  ),
  makeTemplate(
    'Temporary lock explanation',
    'rule-2',
    'neutral',
    'This thread is temporarily locked while moderators review reports. Please avoid reposting the same argument elsewhere.',
    username
  ),
];

const seedQueue = (): QueueItem[] => [
  makeQueue('comment', 'Reported comment: harassment', 'You are a fraud and everyone knows it.', 'u/SharpElbow', ['Harassment'], 5400, [
    'rule-1',
  ]),
  makeQueue('post', 'Reported post: spam link', 'Check out my guaranteed earning system at bit.ly/demo.', 'u/PromoPilot', ['Spam', 'Link shortener'], 2200, [
    'rule-3',
  ]),
  makeQueue('post', 'Reported post: duplicate news', 'Same article submitted for the fourth time today.', 'u/NewsRunner', ['Duplicate'], 8800, [
    'rule-4',
  ]),
  makeQueue('comment', 'Reported comment: possible self-harm', 'I do not think I can stay safe tonight.', 'u/ThrowawayCare', ['Self-harm', 'Urgent'], 600, [
    'rule-5',
  ]),
  makeQueue('thread', 'Reported thread: brigading / raid concern', 'Comment velocity spiked after an external link was shared.', 'u/TopicStarter', [
    'Brigading',
    'Harassment',
    'Rule-breaking influx',
  ], 1200, ['rule-1', 'rule-2']),
];

function makeTicket(
  actionType: string,
  targetType: ConsensusTicket['targetType'],
  targetId: string,
  targetDisplay: string,
  proposedBy: string,
  reason: string,
  severity: Severity,
  evidence: string[]
): ConsensusTicket {
  return {
    ticketId: id('ticket'),
    actionType,
    targetType,
    targetId,
    targetDisplay,
    proposedBy,
    reason,
    severity,
    evidence,
    thresholdType: 'fixed_count',
    requiredVotes: 3,
    status: 'pending',
    createdAt: now(),
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    notes: 'Seeded demo case for test installs.',
  };
}

function makeTemplate(
  title: string,
  linkedRuleId: string,
  tone: ResponseTemplate['tone'],
  markdown: string,
  username: string
): ResponseTemplate {
  return {
    templateId: id('tpl'),
    title,
    linkedRuleId,
    tone,
    markdown,
    macrosUsed: macrosIn(markdown),
    status: 'active',
    createdBy: username,
    createdAt: now(),
    updatedBy: username,
    updatedAt: now(),
    version: 1,
  };
}

function makeQueue(
  itemType: QueueItem['itemType'],
  title: string,
  bodyExcerpt: string,
  author: string,
  reports: string[],
  ageSeconds: number,
  suggestedRuleIds: string[]
): QueueItem {
  const severityScore = scoreQueue(reports, ageSeconds, bodyExcerpt);
  return {
    itemId: id('queue'),
    itemType,
    title,
    bodyExcerpt,
    author,
    reports,
    reportCount: reports.length,
    ageSeconds,
    severityScore,
    severity: severityFromScore(severityScore),
    suggestedRuleIds,
    status: 'new',
  };
}

function macrosIn(markdown: string): string[] {
  return Array.from(new Set(markdown.match(/\{[a-z_]+\}/g) ?? []));
}

function scoreQueue(reports: string[], ageSeconds: number, body: string): number {
  const joined = `${reports.join(' ')} ${body}`.toLowerCase();
  let score = reports.length * 18 + Math.min(24, Math.floor(ageSeconds / 1200));
  if (/self-harm|urgent|harm|stay safe/.test(joined)) score += 55;
  if (/brigad|raid|harass/.test(joined)) score += 30;
  if (/spam|shortener|promo|bit\.ly/.test(joined)) score += 20;
  return Math.min(100, score);
}

function severityFromScore(score: number): Severity {
  if (score >= 82) return 'critical';
  if (score >= 62) return 'high';
  if (score >= 36) return 'medium';
  return 'low';
}

type RedditQueueThing = {
  id: string;
  authorName: string;
  createdAt: Date;
  permalink: string;
  userReportReasons: string[];
  modReportReasons: string[];
} & (
  | {
      title: string;
      body?: string;
      numberOfReports: number;
    }
  | {
      body: string;
      numReports: number;
      postId: string;
    }
);

function rulesFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const rules = new Set<string>();
  if (/harass|insult|abuse|civil|threat/.test(lower)) rules.add('rule-1');
  if (/off[ -]?topic|politic|flame|brigad|raid/.test(lower)) rules.add('rule-2');
  if (/spam|promo|affiliate|crypto|bit\.ly|shortener/.test(lower)) rules.add('rule-3');
  if (/duplicate|repost|megathread/.test(lower)) rules.add('rule-4');
  if (/self-harm|suicide|harm|safety|urgent/.test(lower)) rules.add('rule-5');
  return Array.from(rules);
}

async function fetchLiveQueue(subredditName: string): Promise<QueueItem[]> {
  try {
    const subreddit = await reddit.getSubredditByName(subredditName);
    const [reported, modQueue] = await Promise.all([
      subreddit.getReports({ type: 'all', limit: 8 }).all(),
      subreddit.getModQueue({ type: 'all', limit: 8 }).all(),
    ]);
    const byId = new Map<string, RedditQueueThing>();
    for (const item of [...reported, ...modQueue] as RedditQueueThing[]) {
      byId.set(item.id, item);
    }
    return Array.from(byId.values()).map((item) => {
      const isPost = 'title' in item;
      const reports = [...item.userReportReasons, ...item.modReportReasons];
      const normalizedReports = reports.length ? reports : ['Live modqueue'];
      const title = isPost ? item.title : `Reported comment on ${item.postId}`;
      const body = isPost ? item.body ?? item.title : item.body;
      const ageSeconds = Math.max(0, Math.floor((Date.now() - item.createdAt.getTime()) / 1000));
      const severityScore = scoreQueue(normalizedReports, ageSeconds, body);
      return {
        itemId: `live:${item.id}`,
        itemType: isPost ? 'post' : 'comment',
        title,
        bodyExcerpt: body.slice(0, 500),
        author: item.authorName,
        reports: normalizedReports,
        reportCount: isPost ? item.numberOfReports : item.numReports,
        ageSeconds,
        severityScore,
        severity: severityFromScore(severityScore),
        suggestedRuleIds: rulesFromText(`${title} ${body} ${normalizedReports.join(' ')}`),
        status: 'new',
      } satisfies QueueItem;
    });
  } catch (error) {
    console.warn('Live queue ingestion unavailable; using Redis demo queue.', error);
    return [];
  }
}

function requiredVotes(settings: AppSettings): number {
  if (settings.consensusThresholdMode === 'fixed_count') return settings.consensusFixedCount;
  if (settings.consensusThresholdMode === 'two_thirds') return 4;
  return 3;
}

function roleFor(level: number): string {
  if (level >= 8) return 'Consensus Captain';
  if (level >= 6) return 'Senior Operator';
  if (level >= 4) return 'Rulekeeper';
  if (level >= 3) return 'Queue Cadet';
  if (level >= 2) return 'Apprentice';
  return 'Trainee';
}

function levelFromXp(xp: number): number {
  let level = 1;
  while (xp >= Math.floor(100 * Math.pow(level + 1, 1.5)) && level < 12) level += 1;
  return level;
}

function asRedditThingId(idValue: string): RedditThingId | undefined {
  if (idValue.startsWith('t1_') || idValue.startsWith('t3_')) return idValue as RedditThingId;
  return undefined;
}

function baseCapabilities(isModerator: boolean): SessionResponse['capabilities'] {
  const locked = {
    enabled: false,
    live: false,
    reason: 'NOT_MODERATOR' as const,
    detail: 'Install and open ModDesk as a moderator of this community.',
  };
  if (!isModerator) {
    return {
      queue: locked,
      modmail: locked,
      automod: locked,
      modlog: locked,
      users: locked,
      flairs: locked,
      insights: locked,
    };
  }
  return {
    queue: { enabled: true, live: true },
    modmail: { enabled: true, live: true },
    automod: { enabled: true, live: true },
    modlog: { enabled: true, live: true },
    users: { enabled: true, live: true },
    flairs: { enabled: true, live: true },
    insights: { enabled: true, live: false, detail: 'Uses live mod activity plus Redis-derived workspace telemetry.' },
  };
}

async function getModContext(): Promise<ModContextState> {
  const username = (await reddit.getCurrentUsername()) ?? null;
  const subredditName = context.subredditName ?? 'testsubreddit';
  let isModerator = false;
  let modPermissions: string[] = [];
  let subredditIconUrl: string | null = null;
  let subredditSubscribers: number | null = null;
  try {
    if (username) {
      const mods = await reddit.getModerators({ subredditName, limit: 100 }).all();
      const me = mods.find((mod) => mod.username.toLowerCase() === username.toLowerCase());
      isModerator = Boolean(me);
      if (me) {
        modPermissions = (me.modPermissions.get(subredditName) ?? []).map((permission) => String(permission));
      }
    }
  } catch {
    isModerator = false;
  }
  try {
    const subreddit = await reddit.getSubredditByName(subredditName);
    const subAny = subreddit as unknown as {
      numberOfSubscribers?: number;
      subscribersCount?: number;
      iconImg?: string;
      communityIcon?: string;
    };
    subredditSubscribers =
      typeof subAny.numberOfSubscribers === 'number'
        ? subAny.numberOfSubscribers
        : typeof subAny.subscribersCount === 'number'
          ? subAny.subscribersCount
          : null;
    subredditIconUrl = subAny.communityIcon || subAny.iconImg || null;
  } catch {
    /* leave defaults */
  }
  return {
    username,
    subredditName,
    isModerator,
    modPermissions,
    subredditIconUrl,
    subredditSubscribers,
    redisStatus: 'ok' as const,
  };
}

async function getSession(): Promise<SessionResponse> {
  const modContext = await getModContext();
  const errors: SessionResponse['errors'] = [];
  if (!modContext.username) {
    errors.push({ code: 'NOT_LOGGED_IN', message: 'Reddit did not provide a logged-in user for this Devvit session.' });
  }
  if (!modContext.isModerator) {
    errors.push({
      code: 'NOT_MODERATOR',
      message: `u/${modContext.username ?? 'unknown'} is not listed as a moderator of r/${modContext.subredditName}.`,
    });
  }

  let installs: SubredditInstall[] = [];
  if (modContext.username && modContext.isModerator) {
    const currentInstall: SubredditInstall = {
      subredditName: modContext.subredditName,
      iconUrl: modContext.subredditIconUrl,
      subscribers: modContext.subredditSubscribers,
      lastSeenAt: now(),
    };
    await touchInstall(modContext.username, currentInstall);
    installs = await getModeratedCommunities(modContext.username, currentInstall);
  }

  return {
    username: modContext.username,
    subredditName: modContext.subredditName,
    isModerator: modContext.isModerator,
    modPermissions: modContext.modPermissions,
    subredditIconUrl: modContext.subredditIconUrl,
    subredditSubscribers: modContext.subredditSubscribers,
    installs,
    errors,
    capabilities: baseCapabilities(modContext.isModerator),
  };
}

async function requireModerator(): Promise<ModContextState & { username: string }> {
  const modContext = await getModContext();
  if (!modContext.username) {
    throw new AuthError('NOT_LOGGED_IN', 'Open ModDesk from a logged-in Reddit account.', 401);
  }
  if (!modContext.isModerator) {
    throw new AuthError('NOT_MODERATOR', 'Moderator access required for ModDesk OS.', 403);
  }
  return { ...modContext, username: modContext.username };
}

function requireLiveConfirmation(confirmation: string | undefined): void {
  if (confirmation !== 'CONFIRM_LIVE_ACTION') {
    throw new AuthError(
      'MISSING_PERMISSION',
      'Live destructive Reddit actions require explicit confirmation.',
      403
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readAiRequest(value: unknown): AiChatRequest | undefined {
  if (!isRecord(value) || typeof value.prompt !== 'string') return undefined;
  const history: AiChatMessage[] = [];
  if (Array.isArray(value.history)) {
    for (const item of value.history) {
      if (!isRecord(item)) continue;
      if ((item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string') {
        history.push({ role: item.role, content: item.content.slice(0, 1400) });
      }
    }
  }
  return {
    prompt: value.prompt.slice(0, 1800),
    history: history.slice(-8),
  };
}

function extractGroqText(value: unknown): string {
  if (!isRecord(value)) return '';
  if (typeof value.output_text === 'string') return value.output_text;
  if (!Array.isArray(value.output)) return '';
  const parts: string[] = [];
  for (const item of value.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (isRecord(content) && typeof content.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

function sanitizeForAi(text: string): string {
  return text
    .replace(/\bu\/[A-Za-z0-9_-]+/g, 'u/[redacted]')
    .replace(/https?:\/\/\S+/g, '[link]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200);
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !['the', 'and', 'for', 'with', 'that', 'this', 'from', 'you'].includes(word));
}

function retrieveContext(prompt: string, docs: RagDocument[], limit = 7): AiContextSource[] {
  const terms = new Set(tokenize(prompt));
  return docs
    .map((doc) => {
      const searchable = tokenize(`${doc.title} ${doc.content}`);
      const score = searchable.reduce((sum, word) => sum + (terms.has(word) ? 2 : 0), 0) + (doc.type === 'queue' ? 1 : 0);
      return {
        id: doc.id,
        title: doc.title,
        type: doc.type,
        excerpt: sanitizeForAi(doc.content).slice(0, 280),
        score,
      };
    })
    .filter((source) => source.score > 0 || source.type === 'playbook')
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function buildAiCorpus(modContext: ModContextState & { username: string }): Promise<RagDocument[]> {
  await seedIfNeeded(modContext.username, modContext.subredditName);
  const [settings, queue, templates, audits, tickets, liveQueue] = await Promise.all([
    getSettings(modContext.subredditName),
    listIndexed<QueueItem>('queue', 'queue'),
    listIndexed<ResponseTemplate>('templates', 'template'),
    listIndexed<AuditEvent>('audit', 'audit'),
    listIndexed<ConsensusTicket>('tickets', 'ticket'),
    fetchLiveQueue(modContext.subredditName),
  ]);

  const docs: RagDocument[] = [
    {
      id: 'playbook:hackathon',
      title: 'Winning mod tool criteria',
      type: 'playbook',
      content:
        'Prioritize measurable moderator time savings, reliable UX, close-to-launch polish, broad community appeal, easy installation, and features that reduce moderation load without inventing unsupported Reddit data.',
    },
    {
      id: 'playbook:guardrails',
      title: 'Moderator safety guardrails',
      type: 'playbook',
      content:
        'Do not execute actions from chat. Recommend reversible steps first, ask for evidence on high-impact decisions, flag safety reports, and keep private modmail or user information minimized.',
    },
    {
      id: 'settings:current',
      title: `r/${settings.subredditName} workspace settings`,
      type: 'settings',
      content: `Consensus mode ${settings.consensusThresholdMode}, required fixed votes ${settings.consensusFixedCount}, percent ${settings.consensusPercent}, training level ${settings.trainingRequiredLevel}, high-impact actions ${settings.highImpactActions.join(', ')}, workspace mode ${settings.workspaceMode}.`,
    },
  ];

  const combinedQueue = [
    ...liveQueue,
    ...queue.filter((item) => !liveQueue.some((liveItem) => liveItem.itemId === item.itemId)),
  ];

  for (const item of combinedQueue.slice(0, 12)) {
    docs.push({
      id: `queue:${item.itemId}`,
      title: `${item.severity} ${item.itemType}: ${item.title}`,
      type: 'queue',
      content: `${item.reportCount} reports. Reasons: ${item.reports.join(', ')}. Suggested rules: ${item.suggestedRuleIds.join(', ')}. Body: ${item.bodyExcerpt}`,
    });
  }

  for (const template of templates.filter((item) => item.status !== 'archived').slice(0, 10)) {
    docs.push({
      id: `template:${template.templateId}`,
      title: template.title,
      type: 'template',
      content: `${template.tone} template linked to ${template.linkedRuleId}: ${template.markdown}`,
    });
  }

  for (const ticket of tickets.slice(0, 8)) {
    docs.push({
      id: `audit-ticket:${ticket.ticketId}`,
      title: `${ticket.status} consensus: ${ticket.actionType}`,
      type: 'audit',
      content: `${ticket.targetDisplay}. Severity ${ticket.severity}. Reason: ${ticket.reason}. Evidence: ${ticket.evidence.join(' ')}`,
    });
  }

  for (const auditEvent of audits.slice(0, 12)) {
    docs.push({
      id: `audit:${auditEvent.eventId}`,
      title: auditEvent.eventType,
      type: 'audit',
      content: `${auditEvent.actor}: ${auditEvent.summary}`,
    });
  }

  try {
    const subreddit = await reddit.getSubredditByName(modContext.subredditName);
    const rules = await subreddit.getRules();
    for (const rule of rules.slice(0, 12)) {
      docs.push({
        id: `rule:${rule.shortName}`,
        title: rule.shortName,
        type: 'rule',
        content: rule.description || `Subreddit rule ${rule.shortName}`,
      });
    }
  } catch {
    for (const rule of [
      ['Civility', 'Be respectful and avoid harassment or personal attacks.'],
      ['Stay on Topic', 'Keep content relevant to the community.'],
      ['Spam / Self-Promo', 'Remove unsolicited promotion, affiliate links, and spam.'],
      ['Duplicate / Megathread', 'Redirect duplicate submissions into active megathreads.'],
      ['Crisis or Safety Escalation', 'Escalate urgent safety and self-harm reports carefully.'],
    ]) {
      docs.push({ id: `rule:${rule[0]}`, title: rule[0] ?? 'Rule', type: 'rule', content: rule[1] ?? '' });
    }
  }

  try {
    const logs = await reddit.getModerationLog({ subredditName: modContext.subredditName, limit: 8 }).all();
    for (const log of logs) {
      docs.push({
        id: `modlog:${log.id}`,
        title: log.type || 'mod action',
        type: 'modlog',
        content: `${log.moderatorName || 'unknown mod'}: ${log.details || log.description || log.type || 'moderation event'}`,
      });
    }
  } catch {
    /* live modlog is optional in the RAG corpus */
  }

  try {
    const radar = await buildRadar(modContext);
    for (const item of radar.cases.slice(0, 6)) {
      docs.push({
        id: `radar:${item.id}`,
        title: `Crisis Radar: ${item.title}`,
        type: 'radar',
        content: `${item.severity} case. Signals: ${item.signals.join(', ')}. Recommended action: ${item.recommendedAction}. ${item.excerpt}`,
      });
    }
  } catch {
    /* radar context is optional */
  }

  try {
    const handoffs = await listHandoffs();
    for (const handoff of handoffs.slice(0, 3)) {
      docs.push({
        id: `handoff:${handoff.handoffId}`,
        title: `Shift handoff by ${handoff.createdBy}`,
        type: 'handoff',
        content: `${handoff.summary} Notes: ${handoff.notes}`,
      });
    }
  } catch {
    /* handoff context is optional */
  }

  return docs;
}

function composeAiPrompt(request: AiChatRequest, sources: AiContextSource[], modContext: ModContextState): string {
  const contextBlock = sources
    .map((source, index) => `${index + 1}. [${source.type}] ${source.title}: ${source.excerpt}`)
    .join('\n');
  const historyBlock = request.history
    .map((message) => `${message.role.toUpperCase()}: ${sanitizeForAi(message.content)}`)
    .join('\n');
  return [
    'You are Sentinel, the ModDesk OS AI assistant for Reddit moderators.',
    'Use only the supplied RAG context plus general moderation reasoning. Be concrete, calm, and launch-ready.',
    'Never claim you performed a Reddit action. For bans, removals, locks, mutes, automod edits, or public replies, recommend the next step and name the evidence needed.',
    'When suggesting policy or Automod changes, include a short rationale and a review checklist. Prefer time-saving workflows that match Devvit mod-tool hackathon judging: impact, polish, reliable UX, and ecosystem value.',
    `Current community: r/${modContext.subredditName}. Usernames and links may be sanitized before leaving Reddit.`,
    '',
    'RAG CONTEXT:',
    contextBlock || 'No matching context found. Ask for the missing detail and avoid guessing.',
    '',
    'RECENT CHAT:',
    historyBlock || 'No prior messages.',
    '',
    `MODERATOR QUESTION: ${sanitizeForAi(request.prompt)}`,
    '',
    'Answer in a ChatGPT-like style with concise sections. Include a Sources line naming the relevant RAG source titles.',
  ].join('\n');
}

function buildFallbackReply(request: AiChatRequest, sources: AiContextSource[]): string {
  return buildStructuredFallbackReply(request, sources);
}

export async function answerSentinelRequest(
  modContext: ModContextState & { username: string },
  request: AiChatRequest
): Promise<AiChatResponse> {
  const corpus = await buildAiCorpus(modContext);
  const sources = retrieveContext(request.prompt, corpus);
  const augmentedPrompt = composeAiPrompt(request, sources, modContext);
  const promptPreview = augmentedPrompt.slice(0, 900);
  const startedAt = Date.now();

  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch('https://api.groq.com/openai/v1/responses', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-20b',
          input: augmentedPrompt,
        }),
      });
      clearTimeout(timeout);
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        return {
          reply: buildFallbackReply(request, sources),
          model: 'Local RAG fallback',
          status: 'fallback',
          sources,
          promptPreview,
          modelStatus: {
            status: response.status === 429 ? 'error' : 'fallback',
            provider: 'local',
            model: 'local-rag',
            latencyMs: Date.now() - startedAt,
            lastError: `Groq returned ${response.status}${text ? `: ${text.slice(0, 140)}` : ''}`,
          },
        };
      }
      const payload = await response.json().catch(() => undefined);
      const reply = extractGroqText(payload);
      if (reply) {
        return {
          reply,
          model: 'openai/gpt-oss-20b',
          status: 'success',
          sources,
          promptPreview,
          modelStatus: {
            status: 'connected',
            provider: 'groq',
            model: 'openai/gpt-oss-20b',
            latencyMs: Date.now() - startedAt,
          },
        };
      }
      return {
        reply: buildFallbackReply(request, sources),
        model: 'Local RAG fallback',
        status: 'fallback',
        sources,
        promptPreview,
        modelStatus: {
          status: 'fallback',
          provider: 'local',
          model: 'local-rag',
          latencyMs: Date.now() - startedAt,
          lastError: 'Groq returned an empty or unsupported response shape.',
        },
      };
    } catch (error) {
      clearTimeout(timeout);
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      console.warn('Sentinel AI Groq upstream unavailable; using local RAG fallback.', error);
      return {
        reply: buildFallbackReply(request, sources),
        model: 'Local RAG fallback',
        status: 'fallback',
        sources,
        promptPreview,
        modelStatus: {
          status: isTimeout ? 'timeout' : 'fallback',
          provider: 'local',
          model: 'local-rag',
          latencyMs: Date.now() - startedAt,
          lastError: isTimeout ? 'Groq request timed out.' : 'Groq request failed.',
        },
      };
    }
  }

  console.warn('GROQ_API_KEY is not configured; using local RAG fallback.');
  return {
    reply: buildFallbackReply(request, sources),
    model: 'Local RAG fallback',
    status: 'fallback',
    sources,
    promptPreview,
    modelStatus: {
      status: 'disabled',
      provider: 'local',
      model: 'local-rag',
      latencyMs: Date.now() - startedAt,
      lastError: 'No Groq API key is configured.',
    },
  };
}

function detectCrisisSignals(item: QueueItem): CrisisSignal[] {
  const text = `${item.title} ${item.bodyExcerpt} ${item.reports.join(' ')}`.toLowerCase();
  const signals = new Set<CrisisSignal>();
  if (/self-harm|suicide|harm|safety|urgent|crisis/.test(text)) signals.add('safety');
  if (/dox|personal info|real name|address|workplace|phone/.test(text)) signals.add('doxxing');
  if (/brigad|raid|vote manipulation|external community/.test(text)) signals.add('brigade');
  if (/harass|abuse|threat|insult|slur/.test(text)) signals.add('harassment');
  if (/spam|promo|affiliate|crypto|shortener|bit\.ly/.test(text)) signals.add('spam-wave');
  if (/ban evasion|alt account|evad/.test(text)) signals.add('ban-evasion');
  if (/duplicate|repost|megathread/.test(text)) signals.add('duplicate-surge');
  if (signals.size === 0) signals.add('policy');
  return Array.from(signals);
}

function recommendRadarAction(item: QueueItem, signals: CrisisSignal[]): CrisisRadarCase['recommendedAction'] {
  if (signals.some((signal) => signal === 'safety' || signal === 'doxxing' || signal === 'brigade' || signal === 'ban-evasion')) return 'consensus';
  if (item.severity === 'critical' || item.severity === 'high') return 'review';
  if (signals.includes('harassment') || signals.includes('spam-wave')) return 'draft-response';
  return 'review';
}

async function readLiveEvents(modContext: ModContextState): Promise<LiveTriggerEvent[]> {
  try {
    const indexKey = `${NS}:${modContext.subredditName}:live-events:index`;
    const raw = await redis.get(indexKey);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    const events: LiveTriggerEvent[] = [];
    for (const eventId of ids.slice(0, 20)) {
      const value = await redis.get(`${NS}:${modContext.subredditName}:live-events:${eventId}`);
      if (!value) continue;
      try {
        events.push(JSON.parse(value) as LiveTriggerEvent);
      } catch {
        /* skip malformed */
      }
    }
    return events;
  } catch {
    return [];
  }
}

async function buildRadar(modContext: ModContextState & { username: string }): Promise<CrisisRadarResponse> {
  await seedIfNeeded(modContext.username, modContext.subredditName);
  const [settings, storedQueue, audits, tickets, events, insights] = await Promise.all([
    getSettings(modContext.subredditName),
    listIndexed<QueueItem>('queue', 'queue'),
    listIndexed<AuditEvent>('audit', 'audit'),
    listIndexed<ConsensusTicket>('tickets', 'ticket'),
    readLiveEvents(modContext),
    buildLiveInsights(modContext),
  ]);
  const liveQueue = await fetchLiveQueue(modContext.subredditName);
  const sourceQueue = settings.workspaceMode === 'training'
    ? storedQueue.filter((item) => !item.itemId.startsWith('live:'))
    : liveQueue;
  const activeQueue = sourceQueue.filter((item) => item.status === 'new' || item.status === 'reviewing');
  const cases = activeQueue
    .map((item): CrisisRadarCase => {
      const signals = detectCrisisSignals(item);
      return {
        id: item.itemId,
        title: item.title,
        itemType: item.itemType,
        author: item.author,
        excerpt: item.bodyExcerpt,
        reportCount: item.reportCount,
        ageSeconds: item.ageSeconds,
        severity: item.severity,
        severityScore: item.severityScore,
        signals,
        suggestedRuleIds: item.suggestedRuleIds,
        recommendedAction: recommendRadarAction(item, signals),
        source: item.itemId.startsWith('live:') ? 'live' : 'training',
      };
    })
    .sort((a, b) => b.severityScore - a.severityScore || b.reportCount - a.reportCount)
    .slice(0, 10);
  const pressureScore = Math.min(100, Math.round(
    (cases.reduce((sum, item) => sum + item.severityScore, 0) / Math.max(1, cases.length)) +
      events.length * 4 +
      tickets.filter((ticket) => ticket.status === 'pending' || ticket.status === 'needs_info').length * 6
  ));
  return {
    mode: settings.workspaceMode,
    generatedAt: now(),
    pressureScore,
    queueOpen: activeQueue.length,
    queueCritical: cases.filter((item) => item.severity === 'critical').length,
    cases,
    rulePressure: insights.rulesViolated,
    recentEvents: events.map((event) => ({
      id: event.id,
      kind: event.kind,
      createdAt: event.createdAt,
      actor: event.actor ?? null,
      summary: event.summary,
    })),
    recentAudits: audits.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8),
  };
}

function riskFromIntent(input: ComposerDraftRequest, contextText: string): Severity {
  const joined = `${input.actionIntent} ${input.targetType} ${contextText}`.toLowerCase();
  if (/dox|self-harm|suicide|brigad|ban evasion|permanent|safety/.test(joined)) return 'critical';
  if (input.actionIntent === 'remove' || input.actionIntent === 'create_consensus' || input.actionIntent === 'draft_automod') return 'high';
  if (input.actionIntent === 'archive' || input.actionIntent === 'reply' || /harass|spam/.test(joined)) return 'medium';
  return 'low';
}

function composerChecklist(input: ComposerDraftRequest, riskLevel: Severity): string[] {
  const base = [
    'Confirm the evidence matches a written subreddit or site-wide rule.',
    'Check whether the action is reversible before touching live Reddit state.',
  ];
  if (riskLevel === 'critical' || riskLevel === 'high') base.push('Route this through Consensus Desk before a high-impact user or thread action.');
  if (input.actionIntent === 'reply') base.push('Use a saved response tone and avoid debating the moderation decision.');
  if (input.actionIntent === 'draft_automod') base.push('Review Automod YAML in a small change and keep a rollback note.');
  return base;
}

async function buildComposerDraft(modContext: ModContextState & { username: string }, input: ComposerDraftRequest): Promise<ComposerDraftResponse> {
  const [templates, reasons] = await Promise.all([
    listIndexed<ResponseTemplate>('templates', 'template'),
    getRemovalReasonsSafe(modContext.subredditName),
  ]);
  const contextText = sanitizeForAi(input.context);
  const riskLevel = riskFromIntent(input, contextText);
  const matchedTemplates = templates
    .filter((template) => template.status !== 'archived')
    .slice(0, 4)
    .map((template) => ({
      templateId: template.templateId,
      title: template.title,
      tone: template.tone,
      markdown: template.markdown,
    }));
  const title = `${input.actionIntent.replace('_', ' ')} / ${input.targetType}`;
  const draft = [
    `Draft for ${input.targetType}${input.targetId ? ` ${input.targetId}` : ''}:`,
    '',
    input.actionIntent === 'create_consensus' || riskLevel === 'critical'
      ? 'Open a consensus ticket with the evidence below before taking a live action.'
      : 'Use this as a moderator-facing draft before applying the action.',
    '',
    `Context: ${contextText || 'No context supplied.'}`,
    `Recommended tone: ${riskLevel === 'low' ? 'brief and neutral' : 'careful, evidence-led, and non-escalatory'}.`,
  ].join('\n');
  return {
    draftId: id('draft'),
    riskLevel,
    title,
    draft,
    checklist: composerChecklist(input, riskLevel),
    matchedTemplates,
    removalReasons: reasons.slice(0, 5),
    shouldUseConsensus: riskLevel === 'critical' || riskLevel === 'high' || input.actionIntent === 'create_consensus',
    sentinelPrompt: `Improve this moderator ${input.actionIntent} draft using the available RAG context: ${contextText}`,
  };
}

async function getRemovalReasonsSafe(subredditName: string): Promise<Array<{ id: string; title: string; message: string }>> {
  try {
    const reasons = await reddit.getSubredditRemovalReasons(subredditName);
    return reasons.map((reason: { id?: string; title?: string; message?: string }) => ({
      id: reason.id ?? '',
      title: reason.title ?? '',
      message: reason.message ?? '',
    }));
  } catch {
    return [];
  }
}

async function buildHandoffCurrent(modContext: ModContextState & { username: string }): Promise<HandoffResponse['current']> {
  const [radar, tickets, insights] = await Promise.all([
    buildRadar(modContext),
    listIndexed<ConsensusTicket>('tickets', 'ticket'),
    buildLiveInsights(modContext),
  ]);
  return {
    pressureScore: radar.pressureScore,
    queueOpen: radar.queueOpen,
    modmailOpen: insights.modmailOpen,
    auditCount: radar.recentAudits.length,
    pendingConsensus: tickets.filter((ticket) => ticket.status === 'pending' || ticket.status === 'needs_info').length,
    nextModItems: radar.cases.slice(0, 5).map((item) => `${item.severity}: ${item.title}`),
    recentChanges: [
      ...radar.recentEvents.slice(0, 4).map((event) => `${event.kind}: ${event.summary}`),
      ...radar.recentAudits.slice(0, 4).map((event) => `${event.actor}: ${event.summary}`),
    ].slice(0, 6),
  };
}

async function listHandoffs(): Promise<HandoffRecord[]> {
  return (await json.get<HandoffRecord[]>(key('handoffs'))) ?? [];
}

async function buildLiveInsights(modContext: ModContextState & { username: string }): Promise<LiveInsightResponse> {
  const [storedQueue, auditEvents] = await Promise.all([
    listIndexed<QueueItem>('queue', 'queue'),
    listIndexed<AuditEvent>('audit', 'audit'),
  ]);
  const liveQueue = await fetchLiveQueue(modContext.subredditName);
  const combinedQueue = [
    ...liveQueue,
    ...storedQueue.filter((item) => !liveQueue.some((liveItem) => liveItem.itemId === item.itemId)),
  ];
  const activeQueue = combinedQueue.filter((item) => item.status === 'new' || item.status === 'reviewing');
  const ruleCounts = new Map<string, number>();
  for (const item of activeQueue) {
    const rules = item.suggestedRuleIds.length ? item.suggestedRuleIds : ['Unmapped reports'];
    for (const rule of rules) {
      const label = rule.startsWith('rule-') ? ruleTitle(rule) : rule;
      ruleCounts.set(label, (ruleCounts.get(label) ?? 0) + Math.max(1, item.reportCount));
    }
  }
  const totalRulePressure = Math.max(1, Array.from(ruleCounts.values()).reduce((sum, count) => sum + count, 0));
  const rulesViolated: LiveInsightRule[] = Array.from(ruleCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([rule, count]) => ({
      rule,
      count,
      percentage: Math.round((count / totalRulePressure) * 100),
    }));
  let modmailOpen: number | null = null;
  let automodState: LiveInsightResponse['automodState'] = 'unavailable';
  let liveModlogCount = 0;
  const telemetryLogs: LiveInsightResponse['telemetryLogs'] = [];
  try {
    const conversations = await reddit.modMail.getConversations({ subreddits: [modContext.subredditName], state: 'all', limit: 30 });
    modmailOpen = Object.values(conversations.conversations).filter((conversation) => conversation.state !== 'Archived').length;
    telemetryLogs.push({ timestamp: now(), message: `Modmail returned ${modmailOpen} open conversations for r/${modContext.subredditName}.` });
  } catch {
    telemetryLogs.push({ timestamp: now(), message: 'Modmail capability unavailable for this install or permission set.' });
  }
  try {
    const page = await reddit.getWikiPage(modContext.subredditName, 'config/automod');
    automodState = page.content.trim().length > 0 ? 'live' : 'empty';
    telemetryLogs.push({ timestamp: now(), message: `Automod wiki is ${automodState}.` });
  } catch {
    telemetryLogs.push({ timestamp: now(), message: 'Automod wiki could not be read by this Devvit session.' });
  }
  try {
    const logs = await reddit.getModerationLog({ subredditName: modContext.subredditName, limit: 30 }).all();
    liveModlogCount = logs.length;
    telemetryLogs.push({ timestamp: now(), message: `Modlog returned ${liveModlogCount} recent events.` });
  } catch {
    telemetryLogs.push({ timestamp: now(), message: 'Modlog capability unavailable for this install or permission set.' });
  }
  const byHour = new Map<string, number>();
  for (const event of auditEvents.slice(0, 80)) {
    const label = new Date(event.createdAt).toLocaleString('en-US', { weekday: 'short', hour: 'numeric' });
    byHour.set(label, (byHour.get(label) ?? 0) + 1);
  }
  return {
    source: liveQueue.length > 0 || liveModlogCount > 0 || modmailOpen !== null ? 'live' : 'derived',
    generatedAt: now(),
    queueOpen: activeQueue.length,
    queueCritical: activeQueue.filter((item) => item.severity === 'critical').length,
    modmailOpen,
    modlogEvents: liveModlogCount,
    auditEvents: auditEvents.length,
    automodState,
    rulesViolated,
    activityStats: Array.from(byHour.entries()).slice(0, 7).map(([label, count]) => ({ label, count })),
    telemetryLogs: [
      { timestamp: now(), message: `Queue pressure derived from ${activeQueue.length} open queue items.` },
      ...telemetryLogs,
      ...auditEvents.slice(0, 4).map((event) => ({ timestamp: event.createdAt, message: `${event.actor}: ${event.summary}` })),
    ],
  };
}

async function getIndex(indexName: string): Promise<string[]> {
  return (await json.get<string[]>(key(`index:${indexName}`))) ?? [];
}

async function setIndex(indexName: string, ids: string[]): Promise<void> {
  await json.set(key(`index:${indexName}`), Array.from(new Set(ids)));
}

async function putIndexed<T extends object>(
  indexName: string,
  itemKey: string,
  itemId: string,
  item: T
): Promise<void> {
  await json.set(key(`${itemKey}:${itemId}`), item);
  const ids = await getIndex(indexName);
  if (!ids.includes(itemId)) await setIndex(indexName, [itemId, ...ids]);
}

async function listIndexed<T>(indexName: string, itemKey: string): Promise<T[]> {
  const ids = await getIndex(indexName);
  const records: Array<T | undefined> = [];
  for (const itemId of ids) {
    records.push(await json.get<T>(key(`${itemKey}:${itemId}`)));
  }
  return records.filter((record): record is T => record !== undefined);
}

async function audit(actor: string, event: Omit<AuditEvent, 'eventId' | 'actor' | 'createdAt'>): Promise<AuditEvent> {
  const auditEvent: AuditEvent = {
    eventId: id('audit'),
    actor,
    createdAt: now(),
    ...event,
  };
  await putIndexed('audit', 'audit', auditEvent.eventId, auditEvent);
  const ids = (await getIndex('audit')).slice(0, 80);
  await setIndex('audit', ids);
  return auditEvent;
}

async function getSettings(subredditName: string): Promise<AppSettings> {
  const existing = await json.get<AppSettings>(key('settings'));
  if (existing) return existing;
  const settings = defaultSettings(subredditName);
  await json.set(key('settings'), settings);
  return settings;
}

async function getProfile(username: string): Promise<ModeratorProfile> {
  const existing = await json.get<ModeratorProfile>(key(`profile:${username.toLowerCase()}`));
  const profile = existing ?? profileFor(username);
  profile.lastActiveAt = now();
  await json.set(key(`profile:${username.toLowerCase()}`), profile);
  return profile;
}

async function seedIfNeeded(username: string, subredditName: string): Promise<void> {
  await getSettings(subredditName);
  if ((await getIndex('scenarios')).length === 0) {
    const scenarios = seedScenarios();
    await Promise.all(scenarios.map((scenario) => putIndexed('scenarios', 'scenario', scenario.scenarioId, scenario)));
  }
  if ((await getIndex('tickets')).length === 0) {
    const tickets = seedTickets(username);
    await Promise.all(tickets.map((ticket) => putIndexed('tickets', 'ticket', ticket.ticketId, ticket)));
  }
  if ((await getIndex('templates')).length === 0) {
    const templates = seedTemplates(username);
    await Promise.all(templates.map((template) => putIndexed('templates', 'template', template.templateId, template)));
  }
  if ((await getIndex('queue')).length === 0) {
    const items = seedQueue().sort((a, b) => b.severityScore - a.severityScore);
    await Promise.all(items.map((item) => putIndexed('queue', 'queue', item.itemId, item)));
  }
}

async function votesFor(ticketId: string): Promise<ConsensusVote[]> {
  const rawVotes = await redis.hGetAll(key(`votes:${ticketId}`));
  return Object.values(rawVotes).map((raw) => JSON.parse(raw) as ConsensusVote);
}

function tallyStatus(ticket: ConsensusTicket, votes: ConsensusVote[]): TicketStatus {
  const approvals = votes.filter((vote) => vote.vote === 'approve').length;
  const rejections = votes.filter((vote) => vote.vote === 'reject').length;
  if (approvals >= ticket.requiredVotes) return 'approved';
  if (rejections >= ticket.requiredVotes) return 'rejected';
  if (Date.now() > new Date(ticket.expiresAt).getTime()) return 'expired';
  return ticket.status === 'needs_info' ? 'needs_info' : 'pending';
}

function scoreAttempt(
  scenario: TrainingScenario,
  input: SubmitAttemptRequest
): Pick<TrainingAttempt, 'score' | 'xpAwarded' | 'feedback'> & { correct: boolean } {
  const correctAction = input.chosenAction === scenario.expectedAction;
  const correctRule = input.chosenRuleId === scenario.expectedRuleId;
  const edgeCaseEscalation = scenario.difficulty === 'hard' && input.chosenAction === 'escalate';
  const difficultyWeight = scenario.difficulty === 'hard' ? 1.35 : scenario.difficulty === 'medium' ? 1.15 : 1;
  const latencySeconds = Math.max(1, input.latencyMs / 1000);
  const patienceFactor = Math.max(0.82, Math.exp(-0.003 * Math.max(0, latencySeconds - 30)));
  const base = (correctAction ? 56 : 14) + (correctRule ? 28 : 0) + (edgeCaseEscalation ? 14 : 0);
  const confidencePenalty = !correctAction && input.confidence > 80 ? 0.88 : 1;
  const score = Math.round(Math.min(100, base * difficultyWeight * patienceFactor * confidencePenalty));
  const xpAwarded = Math.max(12, Math.round(score * difficultyWeight));
  const feedback = correctAction
    ? `Training scenario complete. Correct action matched ${ruleTitle(scenario.expectedRuleId)}.`
    : `Review ${ruleTitle(scenario.expectedRuleId)}. Expected ${scenario.expectedAction}; your choice was ${input.chosenAction}.`;
  return { score, xpAwarded, feedback, correct: correctAction && correctRule };
}

api.get('/health', async (c) => {
  const modContext = await getModContext();
  await redis.set(key('health:last'), now());
  return c.json({ status: 'ok', app: 'ModDesk OS', context: modContext }, 200);
});

api.get('/session', async (c) => {
  return c.json(await getSession());
});

api.get('/installs', async (c) => {
  const modContext = await getModContext();
  const username = modContext.username;
  if (!username) return c.json<{ installs: SubredditInstall[] }>({ installs: [] });
  const currentInstall: SubredditInstall = {
    subredditName: modContext.subredditName,
    iconUrl: modContext.subredditIconUrl,
    subscribers: modContext.subredditSubscribers,
    lastSeenAt: now(),
  };
  if (modContext.isModerator) {
    await touchInstall(username, currentInstall);
  }
  return c.json<{ installs: SubredditInstall[] }>({
    installs: await getModeratedCommunities(username, modContext.isModerator ? currentInstall : undefined),
  });
});

api.get('/dashboard', async (c) => {
  const modContext = await requireModerator();
  await seedIfNeeded(modContext.username, modContext.subredditName);
  const [settings, profile, scenarios, tickets, templates, queue, auditEvents] = await Promise.all([
    getSettings(modContext.subredditName),
    getProfile(modContext.username),
    listIndexed<TrainingScenario>('scenarios', 'scenario'),
    listIndexed<ConsensusTicket>('tickets', 'ticket'),
    listIndexed<ResponseTemplate>('templates', 'template'),
    listIndexed<QueueItem>('queue', 'queue'),
    listIndexed<AuditEvent>('audit', 'audit'),
  ]);
  const liveQueue = await fetchLiveQueue(modContext.subredditName);
  for (const liveItem of liveQueue) {
    const existing = await json.get<QueueItem>(key(`queue:${liveItem.itemId}`));
    if (!existing || existing.status === 'new' || existing.status === 'reviewing') {
      await putIndexed('queue', 'queue', liveItem.itemId, liveItem);
    }
  }
  const combinedQueue = [
    ...liveQueue,
    ...queue.filter((item) => !liveQueue.some((liveItem) => liveItem.itemId === item.itemId)),
  ];
  const ticketVotes = (await Promise.all(tickets.map((ticket) => votesFor(ticket.ticketId)))).flat();
  const summary = {
    pendingVotes: tickets.filter((ticket) => ticket.status === 'pending' || ticket.status === 'needs_info').length,
    trainingLevel: profile.trainingLevel,
    queueCritical: combinedQueue.filter((item) => item.severity === 'critical' && item.status === 'new').length,
    templatesCount: templates.filter((template) => template.status !== 'archived').length,
    teamCoverage: Math.round(
      (combinedQueue.filter((item) => item.status === 'cleared' || item.status === 'escalated').length / Math.max(1, combinedQueue.length)) *
        100
    ),
  };
  return c.json<DashboardResponse>({
    context: modContext,
    settings,
    profile,
    summary,
    scenarios,
    tickets: tickets.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    votes: ticketVotes,
    templates,
    queue: combinedQueue.sort((a, b) => b.severityScore - a.severityScore),
    audit: auditEvents.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 40),
  });
});

api.post('/ai/chat', async (c) => {
  const modContext = await requireModerator();
  const body = await c.req.json().catch(() => undefined);
  const request = readAiRequest(body);
  if (!request || request.prompt.trim().length < 2) {
    return c.json<ApiError>({ status: 'error', message: 'Ask Sentinel a moderation question first.' }, 400);
  }

  return c.json<AiChatResponse>(await answerSentinelRequest(modContext, request));
});

api.get('/ai/status', async (c) => {
  await requireModerator();
  const hasKey = Boolean(process.env.GROQ_API_KEY);
  return c.json({
    status: hasKey ? 'connected' : 'disabled',
    provider: hasKey ? 'groq' : 'local',
    model: hasKey ? 'openai/gpt-oss-20b' : 'local-rag',
    fallbackAvailable: true,
    detail: hasKey
      ? 'Groq key is configured. Sentinel will fall back safely if the upstream model fails.'
      : 'Groq is not configured. Sentinel will use deterministic local RAG fallback.',
  });
});

api.get('/radar', async (c) => {
  const modContext = await requireModerator();
  return c.json<CrisisRadarResponse>(await buildRadar(modContext));
});

api.post('/composer/draft', async (c) => {
  const modContext = await requireModerator();
  const input = await c.req.json<ComposerDraftRequest>();
  if (!input.targetType || !input.actionIntent) {
    return c.json<ApiError>({ status: 'error', message: 'Composer target and action intent are required.' }, 400);
  }
  return c.json<ComposerDraftResponse>(await buildComposerDraft(modContext, input));
});

api.get('/handoff', async (c) => {
  const modContext = await requireModerator();
  const current = await buildHandoffCurrent(modContext);
  const records = await listHandoffs();
  return c.json<HandoffResponse>({ current, records: records.slice(0, 12) });
});

api.post('/handoff', async (c) => {
  const modContext = await requireModerator();
  const input = await c.req.json<CreateHandoffRequest>();
  const notes = typeof input.notes === 'string' ? input.notes.slice(0, 2200) : '';
  const current = await buildHandoffCurrent(modContext);
  const record: HandoffRecord = {
    handoffId: id('handoff'),
    subredditName: modContext.subredditName,
    createdBy: modContext.username,
    createdAt: now(),
    notes,
    summary: [
      `r/${modContext.subredditName} handoff: pressure ${current.pressureScore}/100.`,
      `${current.queueOpen} queue items, ${current.modmailOpen ?? 0} open modmail threads, ${current.pendingConsensus} pending consensus cases.`,
      current.nextModItems.length ? `Next mod: ${current.nextModItems.join('; ')}` : 'Next mod: no urgent cases detected.',
      notes ? `Notes: ${notes}` : '',
    ].filter(Boolean).join('\n'),
    pressureScore: current.pressureScore,
    queueOpen: current.queueOpen,
    modmailOpen: current.modmailOpen,
    pendingConsensus: current.pendingConsensus,
    nextModItems: current.nextModItems,
    recentChanges: current.recentChanges,
  };
  const records = [record, ...(await listHandoffs())].slice(0, 20);
  await json.set(key('handoffs'), records);
  await audit(modContext.username, {
    eventType: 'handoff.created',
    entityType: 'handoff',
    entityId: record.handoffId,
    summary: `Created shift handoff with pressure ${record.pressureScore}/100.`,
  });
  return c.json<HandoffResponse>({ current, records });
});

api.post('/settings', async (c) => {
  const modContext = await requireModerator();
  const update = await c.req.json<UpdateSettingsRequest>();
  const before = await getSettings(modContext.subredditName);
  const after: AppSettings = {
    ...before,
    ...update,
    consensusFixedCount: Math.max(1, Math.min(12, update.consensusFixedCount ?? before.consensusFixedCount)),
    consensusPercent: Math.max(51, Math.min(100, update.consensusPercent ?? before.consensusPercent)),
    trainingRequiredLevel: Math.max(1, Math.min(12, update.trainingRequiredLevel ?? before.trainingRequiredLevel)),
  };
  await json.set(key('settings'), after);
  await audit(modContext.username, {
    eventType: 'settings.updated',
    entityType: 'settings',
    entityId: 'settings',
    summary: 'Control Panel settings updated.',
    before,
    after,
  });
  return c.json(after);
});

api.post('/reset', async (c) => {
  const modContext = await requireModerator();
  const knownIndexes = ['scenarios', 'tickets', 'templates', 'queue', 'audit'];
  const itemPrefixes: Record<string, string> = {
    scenarios: 'scenario',
    tickets: 'ticket',
    templates: 'template',
    queue: 'queue',
    audit: 'audit',
  };
  const ids = await Promise.all(knownIndexes.map((indexName) => getIndex(indexName)));
  const dataKeys = ids.flatMap((indexIds, indexPosition) => {
    const indexName = knownIndexes[indexPosition] ?? '';
    const itemPrefix = itemPrefixes[indexName] ?? indexName;
    return indexIds.map((itemId) => key(`${itemPrefix}:${itemId}`));
  });
  await redis.del(
    key('settings'),
    ...knownIndexes.map((indexName) => key(`index:${indexName}`)),
    ...dataKeys
  );
  await seedIfNeeded(modContext.username, modContext.subredditName);
  await audit(modContext.username, {
    eventType: 'data.reset',
    entityType: 'settings',
    entityId: 'demo-data',
    summary: 'Demo data reset for test install.',
  });
  return c.json({ status: 'ok' });
});

api.post('/training/attempt', async (c) => {
  const modContext = await requireModerator();
  const input = await c.req.json<SubmitAttemptRequest>();
  const scenario = await json.get<TrainingScenario>(key(`scenario:${input.scenarioId}`));
  if (!scenario) return c.json<ApiError>({ status: 'error', message: 'Scenario not found.' }, 404);
  const result = scoreAttempt(scenario, input);
  const attempt: TrainingAttempt = {
    attemptId: id('attempt'),
    scenarioId: scenario.scenarioId,
    username: modContext.username,
    chosenAction: input.chosenAction,
    chosenRuleId: input.chosenRuleId,
    confidence: input.confidence,
    latencyMs: input.latencyMs,
    score: result.score,
    xpAwarded: result.xpAwarded,
    feedback: `${result.feedback} ${scenario.explanation}`,
    createdAt: now(),
  };
  await putIndexed(`attempts:${modContext.username.toLowerCase()}`, 'attempt', attempt.attemptId, attempt);
  const profile = await getProfile(modContext.username);
  const nextXp = profile.xp + result.xpAwarded;
  const level = levelFromXp(nextXp);
  const missedConcepts = result.correct
    ? profile.missedConcepts
    : Array.from(new Set([ruleTitle(scenario.expectedRuleId), ...profile.missedConcepts])).slice(0, 5);
  const after: ModeratorProfile = {
    ...profile,
    xp: nextXp,
    trainingLevel: level,
    roleLabel: roleFor(level),
    totalScenarios: profile.totalScenarios + 1,
    correctScenarios: profile.correctScenarios + (result.correct ? 1 : 0),
    streak: result.correct ? profile.streak + 1 : 0,
    missedConcepts,
    lastActiveAt: now(),
  };
  await json.set(key(`profile:${modContext.username.toLowerCase()}`), after);
  await audit(modContext.username, {
    eventType: 'training.attempt',
    entityType: 'training_scenario',
    entityId: scenario.scenarioId,
    summary: `Training scenario complete: ${result.score}/100.`,
    after: attempt,
  });
  return c.json<SubmitAttemptResponse>({ attempt, profile: after, scenario });
});

api.post('/consensus/tickets', async (c) => {
  const modContext = await requireModerator();
  const input = await c.req.json<CreateTicketRequest>();
  const settings = await getSettings(modContext.subredditName);
  const ticket: ConsensusTicket = {
    ticketId: id('ticket'),
    actionType: input.actionType,
    targetType: input.targetType,
    targetId: input.targetId,
    targetDisplay: input.targetDisplay,
    proposedBy: modContext.username,
    reason: input.reason,
    severity: input.severity,
    evidence: input.evidence,
    thresholdType: settings.consensusThresholdMode,
    requiredVotes: requiredVotes(settings),
    status: 'pending',
    createdAt: now(),
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    notes: input.notes,
  };
  await putIndexed('tickets', 'ticket', ticket.ticketId, ticket);
  await audit(modContext.username, {
    eventType: 'ticket.created',
    entityType: 'consensus_ticket',
    entityId: ticket.ticketId,
    summary: `Consensus gate active for ${ticket.actionType} on ${ticket.targetDisplay}.`,
    after: ticket,
  });
  return c.json(ticket);
});

api.get('/consensus/tickets/:ticketId', async (c) => {
  await requireModerator();
  const ticketId = c.req.param('ticketId');
  const ticket = await json.get<ConsensusTicket>(key(`ticket:${ticketId}`));
  if (!ticket) return c.json<ApiError>({ status: 'error', message: 'Ticket not found.' }, 404);
  return c.json<TicketDetailResponse>({ ticket, votes: await votesFor(ticketId) });
});

api.post('/consensus/vote', async (c) => {
  const modContext = await requireModerator();
  const input = await c.req.json<VoteRequest>();
  const ticket = await json.get<ConsensusTicket>(key(`ticket:${input.ticketId}`));
  if (!ticket) return c.json<ApiError>({ status: 'error', message: 'Ticket not found.' }, 404);
  if (['approved', 'rejected', 'executed', 'expired'].includes(ticket.status)) {
    return c.json<ApiError>({ status: 'error', message: 'Closed tickets cannot receive new votes.' }, 400);
  }
  const voteKey = key(`votes:${ticket.ticketId}`);
  const existingRaw = await redis.hGet(voteKey, modContext.username.toLowerCase());
  const vote: ConsensusVote = {
    ticketId: ticket.ticketId,
    username: modContext.username,
    vote: input.vote,
    note: input.note,
    createdAt: existingRaw ? (JSON.parse(existingRaw) as ConsensusVote).createdAt : now(),
    updatedAt: now(),
  };
  await redis.hSet(voteKey, { [modContext.username.toLowerCase()]: JSON.stringify(vote) });
  const votes = await votesFor(ticket.ticketId);
  const status = tallyStatus(ticket, votes);
  const updatedTicket: ConsensusTicket = {
    ...ticket,
    status,
    finalizedAt: status === 'approved' || status === 'rejected' || status === 'expired' ? now() : ticket.finalizedAt,
    finalOutcome:
      status === 'approved'
        ? 'Approved. Manual execution confirmation required.'
        : status === 'rejected'
          ? 'Rejected by consensus vote.'
          : ticket.finalOutcome,
  };
  await putIndexed('tickets', 'ticket', ticket.ticketId, updatedTicket);
  const profile = await getProfile(modContext.username);
  await json.set(key(`profile:${modContext.username.toLowerCase()}`), {
    ...profile,
    consensusVotesCast: profile.consensusVotesCast + (existingRaw ? 0 : 1),
    lastActiveAt: now(),
  });
  await audit(modContext.username, {
    eventType: existingRaw ? 'vote.updated' : 'vote.recorded',
    entityType: 'consensus_ticket',
    entityId: ticket.ticketId,
    summary: `Vote recorded. Awaiting ${Math.max(0, ticket.requiredVotes - votes.filter((item) => item.vote === 'approve').length)} more operators.`,
    before: ticket,
    after: updatedTicket,
  });
  return c.json<TicketDetailResponse>({ ticket: updatedTicket, votes });
});

api.post('/consensus/executed', async (c) => {
  const modContext = await requireModerator();
  const input = (await c.req.json<{ ticketId: string; outcome: string }>()) as { ticketId: string; outcome: string };
  const ticket = await json.get<ConsensusTicket>(key(`ticket:${input.ticketId}`));
  if (!ticket) return c.json<ApiError>({ status: 'error', message: 'Ticket not found.' }, 404);
  if (ticket.status !== 'approved') {
    return c.json<ApiError>({ status: 'error', message: 'Only approved tickets can be marked executed.' }, 400);
  }
  const updatedTicket: ConsensusTicket = {
    ...ticket,
    status: 'executed',
    executedAt: now(),
    finalOutcome: input.outcome || 'Manual execution confirmed.',
  };
  await putIndexed('tickets', 'ticket', ticket.ticketId, updatedTicket);
  await audit(modContext.username, {
    eventType: 'ticket.executed',
    entityType: 'consensus_ticket',
    entityId: ticket.ticketId,
    summary: 'Approved ticket marked as manually executed.',
    before: ticket,
    after: updatedTicket,
  });
  return c.json(updatedTicket);
});

api.post('/templates', async (c) => {
  const modContext = await requireModerator();
  const input = await c.req.json<SaveTemplateRequest>();
  const existing = input.templateId ? await json.get<ResponseTemplate>(key(`template:${input.templateId}`)) : undefined;
  const template: ResponseTemplate = {
    templateId: existing?.templateId ?? id('tpl'),
    title: input.title,
    linkedRuleId: input.linkedRuleId,
    tone: input.tone,
    markdown: input.markdown,
    macrosUsed: macrosIn(input.markdown),
    status: input.status,
    createdBy: existing?.createdBy ?? modContext.username,
    createdAt: existing?.createdAt ?? now(),
    updatedBy: modContext.username,
    updatedAt: now(),
    version: (existing?.version ?? 0) + 1,
  };
  await putIndexed('templates', 'template', template.templateId, template);
  await audit(modContext.username, {
    eventType: existing ? 'template.updated' : 'template.created',
    entityType: 'response_template',
    entityId: template.templateId,
    summary: `Template saved to Response Disk: ${template.title}.`,
    before: existing,
    after: template,
  });
  return c.json(template);
});

api.post('/templates/:templateId/archive', async (c) => {
  const modContext = await requireModerator();
  const templateId = c.req.param('templateId');
  const existing = await json.get<ResponseTemplate>(key(`template:${templateId}`));
  if (!existing) return c.json<ApiError>({ status: 'error', message: 'Template not found.' }, 404);
  const archived: ResponseTemplate = {
    ...existing,
    status: 'archived' satisfies TemplateStatus,
    updatedAt: now(),
    updatedBy: modContext.username,
    version: existing.version + 1,
  };
  await putIndexed('templates', 'template', archived.templateId, archived);
  await audit(modContext.username, {
    eventType: 'template.archived',
    entityType: 'response_template',
    entityId: archived.templateId,
    summary: `Template archived: ${archived.title}.`,
    before: existing,
    after: archived,
  });
  return c.json(archived);
});

api.post('/queue/action', async (c) => {
  const modContext = await requireModerator();
  const input = await c.req.json<QueueActionRequest>();

  if (input.itemId.startsWith('live:')) {
    const realId = input.itemId.replace('live:', '');
    const thingId = asRedditThingId(realId);
    try {
      if (input.action === 'approve') {
        requireLiveConfirmation(input.confirmation);
        if (!thingId) throw new AuthError('REDDIT_API_UNAVAILABLE', 'Live queue item ID is not a supported post/comment ID.', 503);
        await reddit.approve(thingId);
        await audit(modContext.username, {
          eventType: 'live.approved',
          entityType: thingId.startsWith('t1_') ? 'comment' : 'post',
          entityId: realId,
          summary: `Approved live item ${realId} on r/${modContext.subredditName}`,
        });
      } else if (input.action === 'remove') {
        requireLiveConfirmation(input.confirmation);
        if (!thingId) throw new AuthError('REDDIT_API_UNAVAILABLE', 'Live queue item ID is not a supported post/comment ID.', 503);
        await reddit.remove(thingId, false);
        await audit(modContext.username, {
          eventType: 'live.removed',
          entityType: thingId.startsWith('t1_') ? 'comment' : 'post',
          entityId: realId,
          summary: `Removed live item ${realId} on r/${modContext.subredditName}`,
        });
      } else if (input.action === 'escalate') {
        const ticketInput: CreateTicketRequest = {
          actionType: 'Queue escalation',
          targetType: thingId?.startsWith('t1_') ? 'comment' : 'post',
          targetId: input.itemId,
          targetDisplay: `Live Item: ${realId}`,
          reason: `Live item escalated: ${input.note || 'None'}`,
          severity: 'medium',
          evidence: [input.note],
          notes: input.note,
        };
        const settings = await getSettings(modContext.subredditName);
        const ticket: ConsensusTicket = {
          ticketId: id('ticket'),
          actionType: ticketInput.actionType,
          targetType: ticketInput.targetType,
          targetId: ticketInput.targetId,
          targetDisplay: ticketInput.targetDisplay,
          proposedBy: modContext.username,
          reason: ticketInput.reason,
          severity: ticketInput.severity,
          evidence: ticketInput.evidence,
          thresholdType: settings.consensusThresholdMode,
          requiredVotes: requiredVotes(settings),
          status: 'pending',
          createdAt: now(),
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
          notes: ticketInput.notes,
        };
        await putIndexed('tickets', 'ticket', ticket.ticketId, ticket);
        await audit(modContext.username, {
          eventType: 'live.escalated',
          entityType: thingId?.startsWith('t1_') ? 'comment' : 'post',
          entityId: realId,
          summary: `Escalated live item ${realId} to Governance Desk.`,
        });
      }

      const profile = await getProfile(modContext.username);
      await json.set(key(`profile:${modContext.username.toLowerCase()}`), {
        ...profile,
        queueReviewed: profile.queueReviewed + 1,
        xp: profile.xp + 8,
        lastActiveAt: now(),
      });

      return c.json({
        itemId: input.itemId,
        itemType: 'post',
        title: 'Live Content Actioned',
        bodyExcerpt: 'Live item has been actioned directly via Devvit API.',
        author: 'unknown',
        reports: [],
        reportCount: 0,
        ageSeconds: 0,
        severityScore: 0,
        severity: 'low',
        suggestedRuleIds: [],
        status: 'cleared',
        assignedTo: null,
        reviewedBy: modContext.username,
        reviewedAt: now(),
        outcome: input.action,
        note: input.note
      });
    } catch (err: unknown) {
      if (err instanceof AuthError) throw err;
      console.error('Failed live action', err);
      const message = err instanceof Error ? err.message : 'Live action failed';
      return c.json<ApiError>({ status: 'error', code: 'REDDIT_API_UNAVAILABLE', message }, 500);
    }
  }

  const item = await json.get<QueueItem>(key(`queue:${input.itemId}`));
  if (!item) return c.json<ApiError>({ status: 'error', message: 'Queue item not found.' }, 404);
  if (input.action === 'escalate') {
    const ticketInput: CreateTicketRequest = {
      actionType: 'Queue escalation',
      targetType: item.itemType === 'thread' ? 'thread' : item.itemType,
      targetId: item.itemId,
      targetDisplay: item.title,
      reason: `Queue packet escalated: ${item.reports.join(', ')}`,
      severity: item.severity,
      evidence: [item.bodyExcerpt, ...item.reports],
      notes: input.note,
    };
    const settings = await getSettings(modContext.subredditName);
    const ticket: ConsensusTicket = {
      ticketId: id('ticket'),
      actionType: ticketInput.actionType,
      targetType: ticketInput.targetType,
      targetId: ticketInput.targetId,
      targetDisplay: ticketInput.targetDisplay,
      proposedBy: modContext.username,
      reason: ticketInput.reason,
      severity: ticketInput.severity,
      evidence: ticketInput.evidence,
      thresholdType: settings.consensusThresholdMode,
      requiredVotes: requiredVotes(settings),
      status: 'pending',
      createdAt: now(),
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      notes: ticketInput.notes,
    };
    await putIndexed('tickets', 'ticket', ticket.ticketId, ticket);
  }
  const updated: QueueItem = {
    ...item,
    status:
      input.action === 'escalate'
        ? 'consensus_required'
        : input.action === 'snooze'
          ? 'snoozed'
          : 'cleared',
    reviewedBy: modContext.username,
    reviewedAt: now(),
    outcome: input.action,
    note: input.note,
  };
  await putIndexed('queue', 'queue', updated.itemId, updated);
  const profile = await getProfile(modContext.username);
  await json.set(key(`profile:${modContext.username.toLowerCase()}`), {
    ...profile,
    queueReviewed: profile.queueReviewed + 1,
    xp: profile.xp + 8,
    lastActiveAt: now(),
  });
  await audit(modContext.username, {
    eventType: input.action === 'escalate' ? 'queue.escalated' : 'queue.reviewed',
    entityType: 'queue_item',
    entityId: item.itemId,
    summary:
      input.action === 'escalate'
        ? 'Queue packet escalated to Governance Desk.'
        : `Queue item marked ${input.action}.`,
    before: item,
    after: updated,
  });
  return c.json(updated);
});

api.get('/wiki/automod', async (c) => {
  const modContext = await requireModerator();
  try {
    const wikiPage = await reddit.getWikiPage(modContext.subredditName, 'config/automod');
    return c.json({ content: wikiPage.content });
  } catch (err) {
    const defaultAutomod = `
# ModyOS Default Automoderator Ruleset
# Fully editable sandbox and production YAML rules

---
# Rule 1: Auto-Filter Spam Domains
type: submission
domain: [bit.ly, adf.ly, discountmirror.xyz]
action: filter
action_reason: "Matches high-risk spam domain blacklist"

---
# Rule 2: Minimum Account Age gate for posts
type: submission
author:
    account_age: "< 3 days"
action: filter
action_reason: "New account post protection"

---
# Rule 3: Toxicity & Profanity cleanup
type: comment
body (regex): ["fraud", "dishonest", "scammer", "fuck", "shit"]
action: filter
action_reason: "Potential toxicity warning triggers"
`.trim();
    return c.json({ content: defaultAutomod });
  }
});

api.post('/wiki/automod', async (c) => {
  const modContext = await requireModerator();
  const { content, reason } = await c.req.json<{ content: string; reason: string }>();
  try {
    await reddit.updateWikiPage({
      subredditName: modContext.subredditName,
      page: 'config/automod',
      content,
      reason: reason || 'ModyOS Automod Editor Commit'
    });
    await audit(modContext.username, {
      eventType: 'automod.updated',
      entityType: 'wiki',
      entityId: 'config/automod',
      summary: `Updated Automod YAML ruleset. Reason: ${reason || 'ModyOS Editor Commit'}`,
    });
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Failed to update wiki page.' }, 500);
  }
});

api.get('/live/modlog', async (c) => {
  const modContext = await requireModerator();
  try {
    const logListing = await reddit.getModerationLog({
      subredditName: modContext.subredditName,
      limit: 30
    }).all();
    return c.json({
      logs: logListing.map(log => ({
        eventId: log.id,
        actor: log.moderatorName || 'unknown_mod',
        eventType: log.type || 'moderation',
        entityType: log.target?.id?.startsWith('t1_') ? 'comment' : log.target?.id?.startsWith('t3_') ? 'post' : 'item',
        entityId: log.target?.id || '',
        summary: `${log.details || log.description || log.type} on ${log.target?.title || log.target?.author || 'item'}`,
        createdAt: log.createdAt ? log.createdAt.toISOString() : now(),
      }))
    });
  } catch (err) {
    console.warn('Failed to fetch live modlog, returning seed actions', err);
    return c.json({
      logs: [
        { eventId: 'seed-1', actor: 'AutoModerator', eventType: 'remove', entityType: 'post', entityId: 't3_123', summary: 'Rule 3: Spam filter on u/SpamWave post', createdAt: now() },
        { eventId: 'seed-2', actor: modContext.username, eventType: 'approve', entityType: 'comment', entityId: 't1_456', summary: 'Approved civil discourse comments', createdAt: now() },
      ]
    });
  }
});

api.get('/live/rules', async (c) => {
  const modContext = await requireModerator();
  try {
    const subreddit = await reddit.getSubredditByName(modContext.subredditName);
    const rules = await subreddit.getRules();
    return c.json({
      rules: rules.map((r) => ({
        id: r.shortName,
        shortName: r.shortName,
        description: r.description || '',
        kind: r.kind,
      }))
    });
  } catch (err) {
    console.warn('Failed to fetch live rules, using fallbacks', err);
    return c.json({
      rules: [
        { id: 'rule-1', shortName: 'Civility', description: 'Be respectful and polite to other users.' },
        { id: 'rule-2', shortName: 'Stay on Topic', description: 'Ensure all content is relevant to the subreddit topic.' },
        { id: 'rule-3', shortName: 'Spam / Self-Promo', description: 'No unsolicited promotion or affiliate spam.' },
        { id: 'rule-4', shortName: 'Duplicate / Megathread', description: 'Check for active duplicate discussions.' },
        { id: 'rule-5', shortName: 'Crisis or Safety Escalation', description: 'Report severe distress or emergency safety issues.' },
      ]
    });
  }
});

api.get('/live/users', async (c) => {
  const modContext = await requireModerator();
  const type = c.req.query('type') || 'banned';
  try {
    const subredditName = modContext.subredditName;
    if (type === 'moderators') {
      const mods = await reddit.getModerators({ subredditName, limit: 50 }).all();
      return c.json({
        users: mods.map(m => ({
          username: m.username,
          role: 'Moderator',
          date: now()
        }))
      });
    } else if (type === 'banned') {
      let banned: any[] = [];
      try {
        banned = await reddit.getBannedUsers({ subredditName, limit: 50 }).all();
      } catch {
        banned = [];
      }
      return c.json({
        users: banned.map(b => ({
          username: b.username,
          reason: b.note || 'No reason specified',
          duration: b.days || 'Permanent',
          date: b.date || now()
        }))
      });
    } else if (type === 'muted') {
      let muted: any[] = [];
      try {
        muted = await reddit.getMutedUsers({ subredditName, limit: 50 }).all();
      } catch {
        muted = [];
      }
      return c.json({
        users: muted.map(m => ({
          username: m.username,
          reason: m.note || 'Muted from contacting modmail',
          date: m.date || now()
        }))
      });
    } else if (type === 'approved') {
      let approved: any[] = [];
      try {
        approved = await reddit.getApprovedUsers({ subredditName, limit: 50 }).all();
      } catch {
        approved = [];
      }
      return c.json({
        users: approved.map(a => ({
          username: a.username,
          date: a.date || now()
        }))
      });
    }
    return c.json({ users: [] });
  } catch (err) {
    console.warn(`Failed to fetch live users of type ${type}`, err);
    return c.json({ users: [] });
  }
});

api.post('/live/users/action', async (c) => {
  const modContext = await requireModerator();
  const { type, username, action, duration, reason, note, confirmation } = await c.req.json<{
    type: 'banned' | 'muted' | 'approved';
    username: string;
    action: 'add' | 'remove';
    duration?: number;
    reason?: string;
    note?: string;
    confirmation?: 'CONFIRM_LIVE_ACTION';
  }>();

  const subredditName = modContext.subredditName;
  try {
    requireLiveConfirmation(confirmation);
    if (type === 'banned') {
      if (action === 'add') {
        await reddit.banUser({
          subredditName,
          username,
          duration: duration || 0,
          reason: reason || 'Banned via ModyOS',
          note: note || 'Banned via ModyOS Control panel',
          message: `You have been banned from r/${subredditName}. Reason: ${reason || 'Rule violation'}`
        });
        await audit(modContext.username, {
          eventType: 'user.banned',
          entityType: 'user',
          entityId: username,
          summary: `Banned u/${username}. Reason: ${reason || 'None'}. Duration: ${duration || 'Permanent'}`,
        });
      } else {
        await reddit.unbanUser(username, subredditName);
        await audit(modContext.username, {
          eventType: 'user.unbanned',
          entityType: 'user',
          entityId: username,
          summary: `Unbanned u/${username}`,
        });
      }
    } else if (type === 'muted') {
      if (action === 'add') {
        await reddit.muteUser({
          subredditName,
          username,
          note: note || reason || 'Muted via ModyOS'
        });
        await audit(modContext.username, {
          eventType: 'user.muted',
          entityType: 'user',
          entityId: username,
          summary: `Muted u/${username} from modmail. Note: ${note || 'None'}`,
        });
      } else {
        await reddit.unmuteUser(username, subredditName);
        await audit(modContext.username, {
          eventType: 'user.unmuted',
          entityType: 'user',
          entityId: username,
          summary: `Unmuted u/${username} from modmail`,
        });
      }
    } else if (type === 'approved') {
      if (action === 'add') {
        await reddit.approveUser(username, subredditName);
        await audit(modContext.username, {
          eventType: 'user.approved',
          entityType: 'user',
          entityId: username,
          summary: `Added u/${username} to approved users list`,
        });
      } else {
        await reddit.removeUser(username, subredditName);
        await audit(modContext.username, {
          eventType: 'user.unapproved',
          entityType: 'user',
          entityId: username,
          summary: `Removed u/${username} from approved users list`,
        });
      }
    }
    return c.json({ success: true });
  } catch (err: unknown) {
    if (err instanceof AuthError) throw err;
    console.error(`Failed live user action: ${type} ${action}`, err);
    return c.json({ success: false, error: err instanceof Error ? err.message : 'Operation failed.' }, 500);
  }
});

// =================================================
// 5. RETROMODMAIL HUB ENDPOINTS
// =================================================

api.get('/live/modmail', async (c) => {
  const modContext = await requireModerator();
  const subredditName = modContext.subredditName;
  
  try {
    let conversations: any[] = [];
    try {
      const liveConvs = await reddit.modMail.getConversations({
        subreddits: [subredditName],
        state: 'all',
        limit: 20
      });
      conversations = Object.values(liveConvs.conversations).map((conv) => {
        return {
          id: conv.id,
          subject: conv.subject || 'No Subject',
          user: conv.participant?.name || 'anonymous',
          userKarma: 1250,
          userAge: '1y 3m',
          userBanned: false,
          folder: conv.state === 'Archived' ? 'archived' : conv.state === 'InProgress' ? 'progress' : conv.isInternal ? 'discussion' : 'inbox',
          date: conv.lastUpdated || now(),
          messages: Object.values(conv.messages).map((m) => ({
            id: m.id,
            author: m.author?.name || 'system',
            body: m.bodyMarkdown || m.body || '',
            date: m.date || now(),
            isInternal: m.isInternal || false
          }))
        };
      });
    } catch (e) {
      const mockKey = key('modmail:threads');
      let cached = await json.get<any[]>(mockKey);
      if (!cached) {
        cached = [
          {
            id: 'demo-abuse',
            subject: 'Ban appeal - why was I banned?',
            user: 'AngryMailbox',
            userKarma: 45,
            userAge: '14d',
            userBanned: true,
            folder: 'inbox',
            date: now(),
            messages: [
              {
                id: 'm1',
                author: 'AngryMailbox',
                body: 'Why was my awesome post about crypto removed? You mods are power tripping! Unban me right now!',
                date: new Date(Date.now() - 3600000 * 2).toISOString(),
                isInternal: false
              }
            ]
          },
          {
            id: 'demo-question',
            subject: 'Request to host gaming AMA next Tuesday',
            user: 'HelpfulPanda',
            userKarma: 8900,
            userAge: '3y 8m',
            userBanned: false,
            folder: 'inbox',
            date: now(),
            messages: [
              {
                id: 'm2',
                author: 'HelpfulPanda',
                body: 'Hello, I wanted to ask if we can hold an AMA next Tuesday on retro gaming history? We have 3 guest speakers lined up. They are all certified collectors.',
                date: new Date(Date.now() - 3600000 * 5).toISOString(),
                isInternal: false
              }
            ]
          },
          {
            id: 'demo-spam',
            subject: 'Paid collaboration / Guest post proposal',
            user: 'TokenShill',
            userKarma: 1,
            userAge: '1d',
            userBanned: false,
            folder: 'inbox',
            date: now(),
            messages: [
              {
                id: 'm3',
                author: 'TokenShill',
                body: 'Hello mod team! We would love to pay you to pin our retro-token article on the front page of the subreddit. We can offer $500 per week in USDT.',
                date: new Date(Date.now() - 3600000 * 12).toISOString(),
                isInternal: false
              }
            ]
          },
          {
            id: 'demo-discussion',
            subject: 'Internal: Megathread rules update',
            user: 'ModAlpha',
            userKarma: 12400,
            userAge: '5y',
            userBanned: false,
            folder: 'discussion',
            date: now(),
            messages: [
              {
                id: 'm4',
                author: 'ModAlpha',
                body: 'Hey team, I think we should relax the megathread posting rules for weekends. We get a lot of memes that users love but technically violate the weekday restriction.',
                date: new Date(Date.now() - 3600000 * 24).toISOString(),
                isInternal: true
              }
            ]
          }
        ];
        await json.set(mockKey, cached);
      }
      conversations = cached;
    }
    return c.json({ conversations });
  } catch (err: any) {
    console.error('Failed to get modmail', err);
    return c.json({ conversations: [] });
  }
});

api.post('/live/modmail/reply', async (c) => {
  const modContext = await requireModerator();
  const { threadId, body, isInternal } = await c.req.json<{
    threadId: string;
    body: string;
    isInternal?: boolean;
  }>();

  try {
    if (!threadId.startsWith('demo-')) {
      try {
        await reddit.modMail.reply({
          conversationId: threadId,
          body,
          isInternal: !!isInternal
        });
        return c.json({ success: true });
      } catch (err) {
        console.warn('Failed to reply to live modmail, attempting simulation fallback', err);
      }
    }

    const mockKey = key('modmail:threads');
    const cached = await json.get<any[]>(mockKey) || [];
    const thread = cached.find(t => t.id === threadId);
    if (thread) {
      const newMsg = {
        id: id('msg'),
        author: modContext.username,
        body,
        date: now(),
        isInternal: !!isInternal
      };
      thread.messages.push(newMsg);
      thread.date = now();
      await json.set(mockKey, cached);

      await audit(modContext.username, {
        eventType: isInternal ? 'modmail.note' : 'modmail.reply',
        entityType: 'modmail',
        entityId: threadId,
        summary: `${isInternal ? 'Added private note' : 'Replied'} to u/${thread.user} in modmail: "${body.slice(0, 40)}..."`,
      });
      return c.json({ success: true, thread });
    }
    return c.json({ success: false, error: 'Modmail thread not found.' }, 404);
  } catch (err: any) {
    console.error('Failed to reply to modmail', err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

api.post('/live/modmail/action', async (c) => {
  const modContext = await requireModerator();
  const { threadId, action } = await c.req.json<{
    threadId: string;
    action: 'archive' | 'unarchive' | 'highlight' | 'delete';
  }>();

  try {
    if (!threadId.startsWith('demo-')) {
      try {
        if (action === 'archive') {
          await reddit.modMail.archiveConversation(threadId);
        } else if (action === 'unarchive') {
          await reddit.modMail.unarchiveConversation(threadId);
        }
        return c.json({ success: true });
      } catch (err) {
        console.warn('Failed live modmail action, falling back to mock', err);
      }
    }

    const mockKey = key('modmail:threads');
    const cached = await json.get<any[]>(mockKey) || [];
    const thread = cached.find(t => t.id === threadId);
    if (thread) {
      if (action === 'archive') {
        thread.folder = 'archived';
      } else if (action === 'unarchive') {
        thread.folder = 'inbox';
      } else if (action === 'delete') {
        const index = cached.indexOf(thread);
        if (index > -1) cached.splice(index, 1);
      }
      await json.set(mockKey, cached);

      await audit(modContext.username, {
        eventType: `modmail.${action}`,
        entityType: 'modmail',
        entityId: threadId,
        summary: `${action.toUpperCase()} modmail conversation with u/${thread.user}`,
      });
      return c.json({ success: true });
    }
    return c.json({ success: false, error: 'Thread not found.' }, 404);
  } catch (err: any) {
    console.error('Failed modmail action', err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

// =================================================
// 6. FLAIR & SUBREDDIT STYLING ENDPOINTS
// =================================================

api.get('/live/flairs', async (c) => {
  const modContext = await requireModerator();
  const subredditName = modContext.subredditName;

  try {
    let postFlairs: any[] = [];
    let userFlairs: any[] = [];
    try {
      const sub = await reddit.getSubredditByName(subredditName);
      postFlairs = await sub.getPostFlairTemplates();
      userFlairs = await sub.getUserFlairTemplates();
    } catch {
      const pfKey = key('flair:post');
      const ufKey = key('flair:user');
      postFlairs = await json.get<any[]>(pfKey) || [
        { id: 'pf-1', text: 'Discussion', backgroundColor: '#3b82f6', textColor: 'light', modOnly: false },
        { id: 'pf-2', text: 'Megathread', backgroundColor: '#f97316', textColor: 'light', modOnly: true },
        { id: 'pf-3', text: 'Gaming AMA', backgroundColor: '#10b981', textColor: 'light', modOnly: false },
        { id: 'pf-4', text: 'Question / Help', backgroundColor: '#ef4444', textColor: 'light', modOnly: false }
      ];
      userFlairs = await json.get<any[]>(ufKey) || [
        { id: 'uf-1', text: 'Retro Veteran', backgroundColor: '#d97706', textColor: 'light', modOnly: false },
        { id: 'uf-2', text: 'Mod Squad', backgroundColor: '#8b5cf6', textColor: 'light', modOnly: true },
        { id: 'uf-3', text: 'Casual Gamer', backgroundColor: '#6b7280', textColor: 'light', modOnly: false }
      ];
      await json.set(pfKey, postFlairs);
      await json.set(ufKey, userFlairs);
    }
    return c.json({ postFlairs, userFlairs });
  } catch (err: any) {
    console.error('Failed to get flairs', err);
    return c.json({ postFlairs: [], userFlairs: [] });
  }
});

api.post('/live/flairs/action', async (c) => {
  const modContext = await requireModerator();
  const { type, text, backgroundColor, textColor, modOnly, flairId } = await c.req.json<{
    type: 'post' | 'user';
    text: string;
    backgroundColor: string;
    textColor: 'light' | 'dark';
    modOnly: boolean;
    flairId?: string;
  }>();

  try {
    const dbKey = key(`flair:${type}`);
    const cached = await json.get<any[]>(dbKey) || [];
    
    if (flairId) {
      const idx = cached.findIndex(f => f.id === flairId);
      if (idx > -1) {
        cached[idx] = { id: flairId, text, backgroundColor, textColor, modOnly };
      }
    } else {
      cached.push({
        id: id(`flair-${type}`),
        text,
        backgroundColor,
        textColor,
        modOnly
      });
    }
    await json.set(dbKey, cached);

    await audit(modContext.username, {
      eventType: `flair.${flairId ? 'edit' : 'create'}`,
      entityType: 'flair',
      entityId: text,
      summary: `${flairId ? 'Updated' : 'Created'} ${type} flair template: "${text}"`,
    });

    return c.json({ success: true, flairs: cached });
  } catch (err: any) {
    console.error('Failed to save flair', err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

// =================================================
// 7. DIAGNOSTIC TRAFFIC TELEMETRY ENDPOINT
// =================================================

api.get('/live/insights', async (c) => {
  const modContext = await requireModerator();

  const [storedQueue, auditEvents] = await Promise.all([
    listIndexed<QueueItem>('queue', 'queue'),
    listIndexed<AuditEvent>('audit', 'audit'),
  ]);

  const liveQueue = await fetchLiveQueue(modContext.subredditName);
  const combinedQueue = [
    ...liveQueue,
    ...storedQueue.filter((item) => !liveQueue.some((liveItem) => liveItem.itemId === item.itemId)),
  ];
  const activeQueue = combinedQueue.filter((item) => item.status === 'new' || item.status === 'reviewing');
  const ruleCounts = new Map<string, number>();
  for (const item of activeQueue) {
    const rules = item.suggestedRuleIds.length ? item.suggestedRuleIds : ['Unmapped reports'];
    for (const rule of rules) {
      const label = rule.startsWith('rule-') ? ruleTitle(rule) : rule;
      ruleCounts.set(label, (ruleCounts.get(label) ?? 0) + Math.max(1, item.reportCount));
    }
  }
  const totalRulePressure = Math.max(1, Array.from(ruleCounts.values()).reduce((sum, count) => sum + count, 0));
  const rulesViolated = Array.from(ruleCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([rule, count]) => ({
      rule,
      count,
      percentage: Math.round((count / totalRulePressure) * 100),
    }));

  let modmailOpen: number | null = null;
  let automodState: LiveInsightResponse['automodState'] = 'unavailable';
  let liveModlogCount = 0;
  const telemetryLogs: LiveInsightResponse['telemetryLogs'] = [];

  try {
    const conversations = await reddit.modMail.getConversations({
      subreddits: [modContext.subredditName],
      state: 'all',
      limit: 30,
    });
    modmailOpen = Object.values(conversations.conversations).filter((conversation) => conversation.state !== 'Archived').length;
    telemetryLogs.push({ timestamp: now(), message: `Modmail returned ${modmailOpen} open conversations for r/${modContext.subredditName}.` });
  } catch (error) {
    console.warn('Modmail insights unavailable', error);
    telemetryLogs.push({ timestamp: now(), message: 'Modmail capability unavailable for this install or permission set.' });
  }

  try {
    const page = await reddit.getWikiPage(modContext.subredditName, 'config/automod');
    const content = page.content;
    automodState = content.trim().length > 0 ? 'live' : 'empty';
    telemetryLogs.push({ timestamp: now(), message: `Automod wiki is ${automodState}.` });
  } catch (error) {
    console.warn('Automod insights unavailable', error);
    telemetryLogs.push({ timestamp: now(), message: 'Automod wiki could not be read by this Devvit session.' });
  }

  try {
    const logs = await reddit.getModerationLog({
      subredditName: modContext.subredditName,
      limit: 30,
    }).all();
    liveModlogCount = logs.length;
    telemetryLogs.push({ timestamp: now(), message: `Modlog returned ${liveModlogCount} recent events.` });
  } catch (error) {
    console.warn('Modlog insights unavailable', error);
    telemetryLogs.push({ timestamp: now(), message: 'Modlog capability unavailable for this install or permission set.' });
  }

  const byHour = new Map<string, number>();
  for (const event of auditEvents.slice(0, 80)) {
    const label = new Date(event.createdAt).toLocaleString('en-US', { weekday: 'short', hour: 'numeric' });
    byHour.set(label, (byHour.get(label) ?? 0) + 1);
  }
  const activityStats = Array.from(byHour.entries())
    .slice(0, 7)
    .map(([label, count]) => ({ label, count }));

  const response: LiveInsightResponse = {
    source: liveQueue.length > 0 || liveModlogCount > 0 || modmailOpen !== null ? 'live' : 'derived',
    generatedAt: now(),
    queueOpen: activeQueue.length,
    queueCritical: activeQueue.filter((item) => item.severity === 'critical').length,
    modmailOpen,
    modlogEvents: liveModlogCount,
    auditEvents: auditEvents.length,
    automodState,
    rulesViolated,
    activityStats,
    telemetryLogs: [
      { timestamp: now(), message: `Queue pressure derived from ${activeQueue.length} open queue items.` },
      ...telemetryLogs,
      ...auditEvents.slice(0, 4).map((event) => ({ timestamp: event.createdAt, message: `${event.actor}: ${event.summary}` })),
    ],
  };

  return c.json<LiveInsightResponse>(response);
});

// ----- Live trigger events (written by /internal/triggers/* handlers) -----

api.get('/live/events', async (c) => {
  const modContext = await requireModerator();
  try {
    const indexKey = `${NS}:${modContext.subredditName}:live-events:index`;
    const raw = await redis.get(indexKey);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    const slice = ids.slice(0, 20);
    const events: LiveTriggerEvent[] = [];
    for (const eventId of slice) {
      const value = await redis.get(`${NS}:${modContext.subredditName}:live-events:${eventId}`);
      if (!value) continue;
      try {
        events.push(JSON.parse(value) as LiveTriggerEvent);
      } catch {
        /* skip malformed */
      }
    }
    return c.json({ events });
  } catch (error) {
    console.error('GET /api/live/events failed', error);
    return c.json({ events: [] satisfies LiveTriggerEvent[] });
  }
});

// ----- Removal reasons (subreddit.getRemovalReasons) -----

api.get('/live/removal-reasons', async (c) => {
  const modContext = await requireModerator();
  try {
    const reasons = await reddit.getSubredditRemovalReasons(modContext.subredditName);
    return c.json({
      reasons: reasons.map((reason: { id?: string; title?: string; message?: string }) => ({
        id: reason.id ?? '',
        title: reason.title ?? '',
        message: reason.message ?? '',
      })),
    });
  } catch (error) {
    console.error('GET /api/live/removal-reasons failed', error);
    return c.json({ reasons: [] });
  }
});

// ----- User profile lookup (reddit.getUserByUsername) -----

api.get('/live/user/:username', async (c) => {
  await requireModerator();
  const username = c.req.param('username');
  if (!username) {
    return c.json({ status: 'error', message: 'Missing username' } satisfies ApiError, 400);
  }
  try {
    const user = await reddit.getUserByUsername(username);
    if (!user) {
      return c.json({ user: null, status: 'not-found' });
    }
    return c.json({
      user: {
        username: user.username,
        id: user.id,
        createdAt: user.createdAt.toISOString(),
        linkKarma: user.linkKarma,
        commentKarma: user.commentKarma,
        isAdmin: user.isAdmin,
        nsfw: user.nsfw,
        hasVerifiedEmail: user.hasVerifiedEmail,
        permalink: user.permalink,
      },
    });
  } catch (error) {
    console.error(`GET /api/live/user/${username} failed`, error);
    return c.json({ user: null, status: 'error', message: String(error) }, 500);
  }
});
