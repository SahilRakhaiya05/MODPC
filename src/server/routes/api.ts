/* eslint-disable @typescript-eslint/no-explicit-any */
import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
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
  CommentCopCase,
  CommentCopResponse,
  CommentCopSettings,
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
  ModDeskRole,
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
  TestGroqResponse,
  TrainingAttempt,
  TrainingScenario,
  UpdateSettingsRequest,
  UpdateSentinelSettingsRequest,
  VoteRequest,
} from '../../shared/api';

export const api = new Hono();

const NS = 'moddesk-os:v1';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const DEFAULT_SENTINEL_TOOLS = [
  'get_current_user_role',
  'get_subreddit_rules',
  'search_workspace_context',
  'summarize_queue',
  'draft_modmail_reply',
  'create_saved_response_draft',
  'create_consensus_ticket_draft',
  'create_consensus_ticket',
  'analyze_automod_yaml',
  'prepare_automod_patch',
  'prepare_automod_diff',
  'summarize_queue',
  'create_saved_response',
  'prepare_ban_recommendation',
  'generate_shift_handoff',
  'check_live_action_permission',
  'create_live_action_confirmation',
  'write_audit_log',
];
const DEFAULT_COMMENTCOP_SETTINGS: CommentCopSettings = {
  enabled: true,
  threshold: 0.85,
  action: 'log_only',
  minTokenCount: 8,
  rollingWindowSize: 250,
  supabaseVerificationEnabled: false,
  supabaseUrlConfigured: Boolean(process.env.SUPABASE_COMMENTCOP_URL),
};
const currentSubredditName = () => context.subredditName ?? 'testsubreddit';
const keyFor = (subredditName: string, mode: 'live' | 'demo' | 'shared', name: string) =>
  `${NS}:${subredditName}:${mode}:${name}`;
const key = (name: string, mode: 'live' | 'demo' | 'shared' = 'live') =>
  keyFor(currentSubredditName(), mode, name);
const now = () => new Date().toISOString();
const id = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

type ModContextState = {
  username: string | null;
  subredditName: string;
  isModerator: boolean;
  modPermissions: string[];
  modDeskRole: ModDeskRole;
  subredditIconUrl: string | null;
  subredditSubscribers: number | null;
  redisStatus: 'ok' | 'degraded';
};

type RagDocument = {
  id: string;
  title: string;
  type: AiContextSource['type'];
  content: string;
  sensitive?: boolean;
  sourceRef?: string;
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
  wallpaperId: 'wall1',
  liveWritesEnabled: true,
  liveModeEnabledBy: null,
  liveModeEnabledAt: null,
  auditRetentionDays: 180,
  sentinelModel: GROQ_MODEL,
  sentinelTemperature: 0.2,
  sentinelMaxTokens: 900,
    sentinelRagEnabled: true,
  sentinelAllowedTools: DEFAULT_SENTINEL_TOOLS,
  sentinelAutomationEnabled: false,
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
    source: 'mock',
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
    source: 'mock',
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
    source: 'mock',
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
    source: 'mock',
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
    source: 'mock',
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
    source: 'mock',
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
    source: 'mock',
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
    source: 'mock',
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
    source: 'mock',
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
    source: 'mock',
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
    source: 'mock',
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

function hasRedditPermission(modContext: ModContextState, permission: string): boolean {
  const permissions = modContext.modPermissions.map((item) => item.toLowerCase());
  return permissions.includes('all') || permissions.includes(permission.toLowerCase());
}

function inferModDeskRole(isTopMod: boolean, modPermissions: string[]): ModDeskRole {
  const normalized = modPermissions.map((item) => item.toLowerCase());
  if (isTopMod || normalized.includes('all')) return 'owner';
  if (['access', 'config', 'wiki', 'mail', 'posts'].some((permission) => normalized.includes(permission))) return 'admin';
  return 'moderator';
}

function roleCan(role: ModDeskRole, capability: 'read' | 'live_write' | 'manage_roles' | 'settings'): boolean {
  if (capability === 'read') return role !== 'observer' || role === 'observer';
  if (capability === 'live_write') return role === 'owner' || role === 'admin' || role === 'moderator';
  if (capability === 'manage_roles' || capability === 'settings') return role === 'owner' || role === 'admin';
  return false;
}

async function getModContext(): Promise<ModContextState> {
  const username = (await reddit.getCurrentUsername()) ?? null;
  const subredditName = context.subredditName ?? 'testsubreddit';
  let isModerator = false;
  let modPermissions: string[] = [];
  let modDeskRole: ModDeskRole = 'observer';
  let subredditIconUrl: string | null = null;
  let subredditSubscribers: number | null = null;
  try {
    if (username) {
      const mods = await reddit.getModerators({ subredditName, limit: 100 }).all();
      const me = mods.find((mod) => mod.username.toLowerCase() === username.toLowerCase());
      isModerator = Boolean(me);
      if (me) {
        modPermissions = (me.modPermissions.get(subredditName) ?? []).map((permission) => String(permission));
        modDeskRole = inferModDeskRole(mods[0]?.username?.toLowerCase() === username.toLowerCase(), modPermissions);
      }
    }
  } catch {
    isModerator = false;
    modDeskRole = 'observer';
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
    modDeskRole,
    subredditIconUrl,
    subredditSubscribers,
    redisStatus: 'ok' as const,
  };
}

async function getSession(): Promise<SessionResponse> {
  const modContext = await getModContext();
  const settings = await getSettings(modContext.subredditName);
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
    modDeskRole: modContext.modDeskRole,
    workspaceMode: settings.workspaceMode,
    liveWritesEnabled: settings.liveWritesEnabled,
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

async function requireRole(capability: 'read' | 'live_write' | 'manage_roles' | 'settings'): Promise<ModContextState & { username: string }> {
  const modContext = await requireModerator();
  if (!roleCan(modContext.modDeskRole, capability)) {
    throw new AuthError('NOT_APPROVED', 'Your ModDesk role does not allow this action.', 403);
  }
  return modContext;
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

function assertNeverLiveWriteInDemo(route: string): void {
  if (route.startsWith('/demo/')) return;
  throw new AuthError('DEMO_MODE_ONLY', 'Demo service guard was invoked from a non-demo route.', 403);
}

async function requireLiveWrite(
  modContext: ModContextState & { username: string },
  confirmation: string | undefined,
  permission: string
): Promise<AppSettings> {
  const settings = await getSettings(modContext.subredditName);
  if (settings.workspaceMode !== 'live') {
    throw new AuthError('LIVE_MODE_REQUIRED', 'Demo / Training Mode cannot perform Reddit write actions.', 403);
  }
  if (!settings.liveWritesEnabled) {
    throw new AuthError('MISSING_PERMISSION', 'Live Reddit Mode writes are locked until an owner/admin enables them.', 403);
  }
  if (!roleCan(modContext.modDeskRole, 'live_write')) {
    throw new AuthError('NOT_APPROVED', 'Your ModDesk role cannot perform live Reddit writes.', 403);
  }
  if (!hasRedditPermission(modContext, permission)) {
    throw new AuthError('MISSING_PERMISSION', `Reddit moderator permission "${permission}" is required.`, 403);
  }
  requireLiveConfirmation(confirmation);
  return settings;
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
  if (Array.isArray(value.choices)) {
    const parts: string[] = [];
    for (const choice of value.choices) {
      if (!isRecord(choice) || !isRecord(choice.message)) continue;
      if (typeof choice.message.content === 'string') parts.push(choice.message.content);
    }
    return parts.join('\n').trim();
  }
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

function chunkDocument(doc: RagDocument): RagDocument[] {
  const content = doc.content.trim();
  if (content.length <= 900) return [doc];
  const chunks: RagDocument[] = [];
  for (let start = 0; start < content.length; start += 700) {
    chunks.push({
      ...doc,
      id: `${doc.id}:chunk-${chunks.length + 1}`,
      title: `${doc.title} (${chunks.length + 1})`,
      content: content.slice(start, start + 900),
    });
  }
  return chunks;
}

async function saveRagIndex(subredditName: string, docs: RagDocument[]): Promise<void> {
  const chunks = docs.flatMap(chunkDocument).slice(0, 120);
  await json.set(keyFor(subredditName, 'shared', 'sentinel:rag:index'), {
    rebuiltAt: now(),
    count: chunks.length,
    docs: chunks,
  });
}

async function readRagIndex(subredditName: string): Promise<{ rebuiltAt: string; count: number; docs: RagDocument[] } | undefined> {
  return await json.get<{ rebuiltAt: string; count: number; docs: RagDocument[] }>(keyFor(subredditName, 'shared', 'sentinel:rag:index'));
}

async function getSentinelApiKey(subredditName: string): Promise<string | undefined> {
  const stored = await redis.get(keyFor(subredditName, 'shared', 'sentinel:groq:key'));
  return stored || process.env.GROQ_API_KEY || undefined;
}

async function getSentinelMeta(subredditName: string): Promise<{ lastSuccessAt: string | null; lastLatencyMs: number | null; lastError: string | null }> {
  return (
    (await json.get<{ lastSuccessAt: string | null; lastLatencyMs: number | null; lastError: string | null }>(
      keyFor(subredditName, 'shared', 'sentinel:groq:meta')
    )) ?? { lastSuccessAt: null, lastLatencyMs: null, lastError: null }
  );
}

async function setSentinelMeta(
  subredditName: string,
  meta: { lastSuccessAt?: string | null; lastLatencyMs?: number | null; lastError?: string | null }
): Promise<void> {
  const current = await getSentinelMeta(subredditName);
  await json.set(keyFor(subredditName, 'shared', 'sentinel:groq:meta'), { ...current, ...meta });
}

function getApiUrlAndProvider(model: string): { url: string; provider: 'openai' | 'gemini' | 'groq' } {
  if (/^gpt-|^o1-/i.test(model)) {
    return { url: 'https://api.openai.com/v1/chat/completions', provider: 'openai' };
  }
  if (/^gemini-/i.test(model)) {
    return { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', provider: 'gemini' };
  }
  return { url: 'https://api.groq.com/openai/v1/chat/completions', provider: 'groq' };
}

function groqFailureCauseForStatus(status: number, text: string, provider: string): string {
  if (status === 401 || status === 403) return 'invalid API key';
  if (status === 404 || /model/i.test(text)) return 'unsupported model';
  if (status === 429) return 'rate limit';
  if (status >= 500) return `${provider} service error`;
  return `${provider} returned HTTP ${status}`;
}

function groqNetworkRecovery(reason: string, provider: 'openai' | 'gemini' | 'groq'): string {
  const blockedByDevvit =
    /domain:\s*(api\.groq\.com|api\.openai\.com|generativelanguage\.googleapis\.com)\s+is not allowed/i.test(reason) ||
    /PERMISSION_DENIED|status 7|HTTP request to domain/i.test(reason);
  if (blockedByDevvit) {
    if (provider === 'groq') {
      return [
        'Devvit blocked the server-side fetch before it reached Groq.',
        'Confirm devvit.json contains permissions.http.domains: ["api.groq.com"], then run devvit playtest or devvit upload so Reddit can approve that exact host in Developer Settings.',
        'If Reddit rejects Groq for current LLM policy reasons, Sentinel cannot call Groq from Devvit until the host/provider is approved.',
      ].join(' ');
    } else if (provider === 'openai') {
      return 'Devvit blocked the OpenAI fetch request. Note: api.openai.com is globally allowlisted by Devvit, so this should not happen. Please check your Devvit app settings or contact support.';
    } else {
      return 'Devvit blocked the Gemini fetch request. Note: generativelanguage.googleapis.com is globally allowlisted by Devvit, so this should not happen. Please check your Devvit app settings or contact support.';
    }
  }
  return `Check Devvit HTTP domain permissions, network status, API key, and selected model for ${provider}.`;
}

async function buildAiCorpus(modContext: ModContextState & { username: string }): Promise<RagDocument[]> {
  await seedIfNeeded(modContext.username, modContext.subredditName);
  const [settings, queue, templates, audits, tickets, scenarios, liveQueue] = await Promise.all([
    getSettings(modContext.subredditName),
    listIndexed<QueueItem>('queue', 'queue'),
    listIndexed<ResponseTemplate>('templates', 'template'),
    listIndexed<AuditEvent>('audit', 'audit'),
    listIndexed<ConsensusTicket>('tickets', 'ticket'),
    listIndexed<TrainingScenario>('scenarios', 'scenario'),
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
      content: `Consensus mode ${settings.consensusThresholdMode}, required fixed votes ${settings.consensusFixedCount}, percent ${settings.consensusPercent}, training level ${settings.trainingRequiredLevel}, high-impact actions ${settings.highImpactActions.join(', ')}, workspace mode ${settings.workspaceMode}, ModDesk role ${modContext.modDeskRole}, Reddit permissions ${modContext.modPermissions.join(', ') || 'unknown'}.`,
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
      content: `${item.reportCount} reports. Reasons: ${item.reports.join(', ')}. Suggested rules: ${item.suggestedRuleIds.join(', ')}. Body: ${settings.workspaceMode === 'training' ? sanitizeForAi(item.bodyExcerpt) : item.bodyExcerpt}`,
      sourceRef: item.itemId,
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

  for (const scenario of scenarios.slice(0, 10)) {
    docs.push({
      id: `training:${scenario.scenarioId}`,
      title: `Training case: ${scenario.title}`,
      type: 'playbook',
      content: `Expected action ${scenario.expectedAction}, rule ${scenario.expectedRuleId}, difficulty ${scenario.difficulty}. ${scenario.explanation}. Tags: ${scenario.tags.join(', ')}.`,
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
    const automod = await reddit.getWikiPage(modContext.subredditName, 'config/automod');
    docs.push({
      id: 'wiki:config/automod',
      title: 'Automod wiki config',
      type: 'settings',
      content: automod.content.slice(0, 5000),
      sensitive: true,
    });
  } catch {
    /* automod read depends on wiki permissions */
  }

  try {
    const reasons = await reddit.getSubredditRemovalReasons(modContext.subredditName);
    for (const reason of reasons.slice(0, 12)) {
      docs.push({
        id: `removal-reason:${reason.id ?? reason.title}`,
        title: `Removal reason: ${reason.title ?? 'Untitled'}`,
        type: 'template',
        content: reason.message ?? '',
      });
    }
  } catch {
    /* removal reasons are optional */
  }

  if (settings.workspaceMode === 'live' && hasRedditPermission(modContext, 'mail')) {
    try {
      const conversations = await reddit.modMail.getConversations({
        subreddits: [modContext.subredditName],
        state: 'all',
        limit: 6,
      });
      for (const conversation of Object.values(conversations.conversations)) {
        docs.push({
          id: `modmail:${conversation.id}`,
          title: `Modmail: ${conversation.subject || 'No subject'}`,
          type: 'handoff',
          content: Object.values(conversation.messages)
            .slice(-4)
            .map((message) => `${message.author?.name || 'system'}: ${message.bodyMarkdown || message.body || ''}`)
            .join('\n'),
          sensitive: true,
        });
      }
    } catch {
      /* modmail context is optional and permission-gated */
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
    /* live modlog is optional in the workspace context corpus */
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

  const visibleDocs = settings.workspaceMode === 'training'
    ? docs.map((doc) => ({ ...doc, content: sanitizeForAi(doc.content) }))
    : docs;
  await saveRagIndex(modContext.subredditName, visibleDocs);
  return visibleDocs.flatMap(chunkDocument);
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
    'Behave like a high-quality Groq-powered assistant built specifically for Reddit moderator teams. Be conversational, useful, and concrete.',
    'Use supplied ModDesk workspace context when it helps, but do not sound like a retrieval system. If context is missing, say what you need or answer generally.',
    'If the user says hi, introduce yourself as a Reddit moderation operations assistant, not a generic chatbot.',
    'Never claim you performed a Reddit action. For bans, removals, locks, mutes, automod edits, or public replies, recommend the next step and name the evidence needed.',
    'When suggesting policy or Automod changes, include a short rationale, risk level, permission requirement, and review checklist.',
    'Always include these sections: Answer, Reasoning summary, Recommended action, Risk level, Related rule/policy, Confidence, Source references, Mode boundary, Next safe step.',
    'You may propose task drafts only. Never execute destructive live Reddit actions from chat.',
    `Current community: r/${modContext.subredditName}. ModDesk role: ${modContext.modDeskRole}. Usernames and links may be sanitized before leaving Reddit.`,
    '',
    'MODDESK WORKSPACE CONTEXT:',
    contextBlock || 'No matching context found. Ask for the missing detail and avoid guessing.',
    '',
    'RECENT CHAT:',
    historyBlock || 'No prior messages.',
    '',
    `MODERATOR QUESTION: ${sanitizeForAi(request.prompt)}`,
    '',
    'Answer like a polished AI assistant with concise sections. Include a Sources line naming relevant ModDesk context titles, or say "Sources: general moderation guidance" when no context was used.',
  ].join('\n');
}

function buildSuggestedTasks(prompt: string, settings: AppSettings, modContext: ModContextState): AiChatResponse['suggestedTasks'] {
  const lower = prompt.toLowerCase();
  const mode = settings.workspaceMode;
  const status = mode === 'training' ? 'simulated' : 'draft';
  const tasks: AiChatResponse['suggestedTasks'] = [];
  const add = (type: AiChatResponse['suggestedTasks'][number]['type'], title: string, summary: string, permissionRequired?: string) => {
    if (!settings.sentinelAllowedTools.includes(type) && !settings.sentinelAllowedTools.includes(type.replace(/_/g, '-'))) return;
    tasks.push({
      taskId: id('sentinel-task'),
      type,
      title,
      summary,
      mode,
      status: permissionRequired && mode === 'live' ? 'live_confirmation_required' : status,
      permissionRequired,
    });
  };
  if (/modmail|reply|tone/.test(lower)) add('draft_modmail_reply', 'Draft a modmail reply', 'Prepare a calm moderator reply using saved responses and retrieved context.', 'mail');
  if (/consensus|vote|ticket|escalat/.test(lower)) add('create_consensus_ticket', 'Create a consensus ticket draft', 'Package target, evidence, reason, deadline, and threshold for senior review.');
  if (/automod|yaml|rule/.test(lower)) add('prepare_automod_patch', 'Prepare Automod patch', 'Draft and explain an Automod YAML change with risk notes.', 'wiki');
  if (/queue|report|pressure|urgent/.test(lower)) add('summarize_queue', 'Summarize queue pressure', 'Summarize urgent reports, severity, and recommended next actions.');
  if (/training|trainee|scenario/.test(lower)) add('create_training_case', 'Create training case', 'Convert safe/redacted context into a trainee scenario.');
  if (/saved response|template|removal reason/.test(lower)) add('create_saved_response', 'Suggest saved response template', 'Draft a reusable response with approved macros.');
  if (/ban|mute/.test(lower)) add('prepare_ban_recommendation', 'Prepare ban/mute recommendation', 'Draft evidence and permission requirements for senior review.', 'access');
  if (tasks.length === 0) add('summarize_queue', 'Summarize moderator context', 'Prepare a low-risk summary from available workspace context.');
  if (!roleCan(modContext.modDeskRole, 'live_write')) {
    return tasks.map((task) => ({ ...task, status: mode === 'training' ? 'simulated' : 'draft', permissionRequired: task.permissionRequired ? `${task.permissionRequired} (proposal only for ${modContext.modDeskRole})` : undefined }));
  }
  return tasks.slice(0, 4);
}

function inferRisk(prompt: string): Severity {
  const lower = prompt.toLowerCase();
  if (/self-harm|suicide|dox|personal info|brigad|ban evasion|permanent ban|automod|wiki/.test(lower)) return 'critical';
  if (/ban|mute|remove|lock|mass|modmail/.test(lower)) return 'high';
  if (/queue|report|template|training/.test(lower)) return 'medium';
  return 'low';
}

function notConfiguredReply(
  request: AiChatRequest,
  sources: AiContextSource[],
  modContext: ModContextState,
  settings: AppSettings
): AiChatResponse {
  const activeModel = settings.sentinelModel || GROQ_MODEL;
  const { provider } = getApiUrlAndProvider(activeModel);
  const capitalizedProvider = provider.charAt(0).toUpperCase() + provider.slice(1);
  return {
    reply: `Sentinel AI is not configured. Owner/admin must add an API key in Settings.`,
    model: 'none',
    status: 'not_configured',
    sources,
    promptPreview: 'API key missing; no AI call was made.',
    reasoningSummary: `No server-side API key is configured for r/${modContext.subredditName}.`,
    recommendedAction: `Owner/admin should open Settings > AI Setup, save a ${capitalizedProvider} API key, choose a model, and test the connection.`,
    riskLevel: inferRisk(request.prompt),
    relatedPolicy: 'Sentinel AI configuration',
    confidence: 'high',
    nextSuggestedAction: 'Configure your API key in Settings and test connection.',
    modeLabel: settings.workspaceMode === 'training' ? 'demo-only' : 'live-capable',
    suggestedTasks: [],
    errorReason: 'missing API key',
    modelStatus: {
      status: 'disabled',
      provider: provider,
      model: settings.sentinelModel,
      lastError: 'Missing API key.',
    },
  };
}

export async function answerSentinelRequest(
  modContext: ModContextState & { username: string },
  request: AiChatRequest
): Promise<AiChatResponse> {
  const settings = await getSettings(modContext.subredditName);
  let sources: AiContextSource[];
  try {
    const corpus = settings.sentinelRagEnabled
      ? await buildAiCorpus(modContext)
      : [
          {
            id: 'playbook:workspace-context-disabled',
            title: 'Workspace context disabled by owner/admin settings',
            type: 'playbook' as const,
            content: 'Owner/admin disabled Sentinel workspace context. Answers should behave like a direct AI assistant and avoid claiming retrieved live context.',
          },
        ];
    sources = retrieveContext(request.prompt, corpus);
  } catch (error) {
    await setSentinelMeta(modContext.subredditName, {
      lastError: `Workspace context retrieval failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    });
    sources = [];
  }

  const augmentedPrompt = composeAiPrompt(request, sources, modContext);
  const promptPreview = augmentedPrompt.slice(0, 900);
  const startedAt = Date.now();

  const activeModel = settings.sentinelModel || GROQ_MODEL;
  const { url, provider } = getApiUrlAndProvider(activeModel);
  const capitalizedProvider = provider.charAt(0).toUpperCase() + provider.slice(1);

  const groqKey = await getSentinelApiKey(modContext.subredditName);
  if (groqKey) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: activeModel,
          messages: [
            { role: 'system', content: `You are Sentinel, a Reddit moderation operations assistant. If the user greets you, introduce yourself with: "I'm Sentinel, your Reddit moderation assistant. I can help triage reports, explain subreddit rules, draft modmail replies, summarize queue pressure, review Automod changes, prepare consensus tickets, and investigate repeated bot patterns." Return structured, cited moderation help.` },
            { role: 'user', content: augmentedPrompt },
          ],
          temperature: settings.sentinelTemperature,
          max_tokens: settings.sentinelMaxTokens,
        }),
      });
      clearTimeout(timeout);
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const reason = `${groqFailureCauseForStatus(response.status, text, capitalizedProvider)}${text ? `: ${text.slice(0, 180)}` : ''}`;
        await setSentinelMeta(modContext.subredditName, { lastError: reason });
        return {
          reply: `Sentinel AI could not reach ${capitalizedProvider}.\n\nCause: ${reason}\nRecovery action: Owner/admin should verify the API key, selected model, and Devvit HTTP domain permissions, then use Test Connection.`,
          model: settings.sentinelModel,
          status: 'error',
          sources,
          promptPreview,
          reasoningSummary: reason,
          recommendedAction: `Fix ${capitalizedProvider} settings before using Sentinel AI.`,
          riskLevel: inferRisk(request.prompt),
          relatedPolicy: sources[0]?.title ?? 'Sentinel AI configuration',
          confidence: 'high',
          nextSuggestedAction: 'Open Settings > Sentinel setup and test connection.',
          modeLabel: settings.workspaceMode === 'training' ? 'demo-only' : 'live-capable',
          suggestedTasks: [],
          errorReason: reason,
          modelStatus: {
            status: response.status === 429 ? 'error' : 'error',
            provider: provider,
            model: settings.sentinelModel,
            latencyMs: Date.now() - startedAt,
            lastError: reason,
          },
        };
      }
      const payload = await response.json().catch(() => undefined);
      const reply = extractGroqText(payload);
      if (reply) {
        const latencyMs = Date.now() - startedAt;
        await setSentinelMeta(modContext.subredditName, { lastSuccessAt: now(), lastLatencyMs: latencyMs, lastError: null });
        return {
          reply,
          model: settings.sentinelModel,
          status: 'success',
          sources,
          promptPreview,
          reasoningSummary: sources.length > 0 ? `${capitalizedProvider} answered with ModDesk workspace context.` : `${capitalizedProvider} answered without retrieved workspace context.`,
          recommendedAction: 'Review the suggested action and use the appropriate ModDesk module to continue.',
          riskLevel: inferRisk(request.prompt),
          relatedPolicy: sources[0]?.title ?? 'Retrieved moderation context',
          confidence: sources.length > 0 ? 'high' : 'medium',
          nextSuggestedAction: 'Use a suggested task button or open the relevant module.',
          modeLabel: settings.workspaceMode === 'training' ? 'demo-only' : 'live-capable',
          suggestedTasks: buildSuggestedTasks(request.prompt, settings, modContext),
          modelStatus: {
            status: 'connected',
            provider: provider,
            model: settings.sentinelModel,
            latencyMs,
          },
        };
      }
      const reason = `malformed response: ${capitalizedProvider} returned an empty or unsupported response shape`;
      await setSentinelMeta(modContext.subredditName, { lastError: reason });
      return {
        reply: `Sentinel AI could not parse ${capitalizedProvider}'s response.\n\nCause: ${reason}\nRecovery action: Try Test Connection or choose a supported chat-completions model.`,
        model: settings.sentinelModel,
        status: 'error',
        sources,
        promptPreview,
        reasoningSummary: reason,
        recommendedAction: `Fix ${capitalizedProvider} model/response settings.`,
        riskLevel: inferRisk(request.prompt),
        relatedPolicy: 'Sentinel AI configuration',
        confidence: 'low',
        nextSuggestedAction: 'Owner/admin should test AI connection.',
        modeLabel: settings.workspaceMode === 'training' ? 'demo-only' : 'live-capable',
        suggestedTasks: [],
        errorReason: reason,
        modelStatus: { status: 'error', provider: provider, model: settings.sentinelModel, latencyMs: Date.now() - startedAt, lastError: reason },
      };
    } catch (error) {
      clearTimeout(timeout);
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      const reason = isTimeout ? `${capitalizedProvider} timeout` : `network error: ${error instanceof Error ? error.message : `${capitalizedProvider} request failed`}`;
      const recovery = groqNetworkRecovery(reason, provider);
      console.warn(`Sentinel AI ${capitalizedProvider} upstream unavailable.`, error);
      await setSentinelMeta(modContext.subredditName, { lastError: reason });
      return {
        reply: `Sentinel AI could not reach ${capitalizedProvider}.\n\nCause: ${reason}\nRecovery action: ${recovery}`,
        model: settings.sentinelModel,
        status: 'error',
        sources,
        promptPreview,
        reasoningSummary: reason,
        recommendedAction: 'Retry after fixing connectivity.',
        riskLevel: inferRisk(request.prompt),
        relatedPolicy: 'Sentinel AI configuration',
        confidence: 'low',
        nextSuggestedAction: 'Run Test Connection in Settings.',
        modeLabel: settings.workspaceMode === 'training' ? 'demo-only' : 'live-capable',
        suggestedTasks: [],
        errorReason: reason,
        modelStatus: {
          status: isTimeout ? 'timeout' : 'error',
          provider: provider,
          model: settings.sentinelModel,
          latencyMs: Date.now() - startedAt,
          lastError: reason,
        },
      };
    }
  }

  const reason = 'missing API key';
  await setSentinelMeta(modContext.subredditName, { lastError: reason });
  return notConfiguredReply(request, sources, modContext, settings);
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
    sentinelPrompt: `Improve this moderator ${input.actionIntent} draft using the available workspace context: ${contextText}`,
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
  const modContext = await getModContext().catch(() => undefined);
  const settings = await getSettings(modContext?.subredditName ?? currentSubredditName()).catch(() => undefined);
  const auditEvent: AuditEvent = {
    eventId: id('audit'),
    actor,
    createdAt: now(),
    actorRole: event.actorRole ?? modContext?.modDeskRole,
    mode: event.mode ?? settings?.workspaceMode,
    subreddit: event.subreddit ?? modContext?.subredditName ?? currentSubredditName(),
    result: event.result ?? 'success',
    ...event,
  };
  await putIndexed('audit', 'audit', auditEvent.eventId, auditEvent);
  const ids = (await getIndex('audit')).slice(0, 80);
  await setIndex('audit', ids);
  return auditEvent;
}

async function getSettings(subredditName: string): Promise<AppSettings> {
  const existing = await json.get<AppSettings>(key('settings'));
  if (existing) {
    const migrated: AppSettings = {
      ...existing,
      liveWritesEnabled: existing.liveWritesEnabled ?? true,
      liveModeEnabledBy: existing.liveModeEnabledBy ?? null,
      liveModeEnabledAt: existing.liveModeEnabledAt ?? null,
      auditRetentionDays: existing.auditRetentionDays ?? 180,
      workspaceMode: 'live',
      wallpaperId: existing.wallpaperId ?? 'wall1',
      sentinelModel: existing.sentinelModel ?? GROQ_MODEL,
      sentinelTemperature: existing.sentinelTemperature ?? 0.2,
      sentinelMaxTokens: existing.sentinelMaxTokens ?? 900,
      sentinelRagEnabled: existing.sentinelRagEnabled ?? true,
      sentinelAllowedTools: (existing.sentinelAllowedTools ?? DEFAULT_SENTINEL_TOOLS).filter((tool) => tool !== 'create_training_case'),
      sentinelAutomationEnabled: existing.sentinelAutomationEnabled ?? false,
    };
    if (JSON.stringify(migrated) !== JSON.stringify(existing)) await json.set(key('settings'), migrated);
    return migrated;
  }
  const settings = defaultSettings(subredditName);
  await json.set(key('settings'), settings);
  return settings;
}

async function getCommentCopSettings(subredditName: string): Promise<CommentCopSettings> {
  const existing = await json.get<CommentCopSettings>(keyFor(subredditName, 'live', 'commentcop:settings'));
  const settings: CommentCopSettings = {
    ...DEFAULT_COMMENTCOP_SETTINGS,
    ...existing,
    supabaseUrlConfigured: Boolean(process.env.SUPABASE_COMMENTCOP_URL),
  };
  if (!existing || JSON.stringify(existing) !== JSON.stringify(settings)) {
    await json.set(keyFor(subredditName, 'live', 'commentcop:settings'), settings);
  }
  return settings;
}

async function getCommentCopCases(subredditName: string): Promise<CommentCopCase[]> {
  const indexKey = keyFor(subredditName, 'live', 'commentcop:cases:index');
  const raw = await redis.get(indexKey);
  const ids: string[] = raw ? JSON.parse(raw) : [];
  const cases: CommentCopCase[] = [];
  for (const caseId of ids.slice(0, 30)) {
    const value = await redis.get(keyFor(subredditName, 'live', `commentcop:case:${caseId}`));
    if (!value) continue;
    try {
      cases.push(JSON.parse(value) as CommentCopCase);
    } catch {
      /* skip malformed case */
    }
  }
  return cases;
}

async function getCommentCopStats(subredditName: string): Promise<CommentCopResponse['stats']> {
  const raw = await redis.hGetAll(keyFor(subredditName, 'live', 'commentcop:stats'));
  const read = (name: string) => Number(raw[name] ?? 0);
  return {
    scanned: read('scanned'),
    flagged: read('flagged'),
    removed: read('removed'),
    duplicateTriggersBlocked: read('duplicateTriggersBlocked'),
  };
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
  const modContext = await requireModerator();
  const settings = await getSettings(modContext.subredditName);
  const hasKey = Boolean(await getSentinelApiKey(modContext.subredditName));
  const meta = await getSentinelMeta(modContext.subredditName);
  return c.json({
    status: hasKey ? 'connected' : 'disabled',
    provider: hasKey ? 'groq' : 'none',
    model: settings.sentinelModel,
    ragEnabled: settings.sentinelRagEnabled,
    lastSuccessAt: meta.lastSuccessAt,
    lastLatencyMs: meta.lastLatencyMs,
    lastError: meta.lastError,
    detail: hasKey
      ? 'Groq key is configured server-side. Use Test Groq Connection to verify the selected model.'
      : 'Sentinel AI is not configured. Owner/admin must add a Groq API key in Settings.',
  });
});

api.get('/ai/settings', async (c) => {
  const modContext = await requireRole('settings');
  const settings = await getSettings(modContext.subredditName);
  const meta = await getSentinelMeta(modContext.subredditName);
  const storedKey = await redis.get(keyFor(modContext.subredditName, 'shared', 'sentinel:groq:key'));
  return c.json({
    hasApiKey: Boolean(storedKey || process.env.GROQ_API_KEY),
    model: settings.sentinelModel,
    envModel: process.env.GROQ_MODEL ?? null,
    temperature: settings.sentinelTemperature,
    maxTokens: settings.sentinelMaxTokens,
    ragEnabled: settings.sentinelRagEnabled,
    allowedTools: settings.sentinelAllowedTools,
    automationEnabled: settings.sentinelAutomationEnabled,
    lastSuccessAt: meta.lastSuccessAt,
    lastLatencyMs: meta.lastLatencyMs,
    lastError: meta.lastError,
  });
});

api.post('/ai/settings', async (c) => {
  const modContext = await requireRole('settings');
  const input = await c.req.json<UpdateSentinelSettingsRequest>();
  const before = await getSettings(modContext.subredditName);
  if (input.clearApiKey) {
    await redis.del(keyFor(modContext.subredditName, 'shared', 'sentinel:groq:key'));
  } else if (typeof input.apiKey === 'string' && input.apiKey.trim()) {
    await redis.set(keyFor(modContext.subredditName, 'shared', 'sentinel:groq:key'), input.apiKey.trim());
  }
  const after: AppSettings = {
    ...before,
    sentinelModel: input.model?.trim() || before.sentinelModel,
    sentinelTemperature: Math.max(0, Math.min(1, input.temperature ?? before.sentinelTemperature)),
    sentinelMaxTokens: Math.max(256, Math.min(4096, input.maxTokens ?? before.sentinelMaxTokens)),
    sentinelRagEnabled: input.ragEnabled ?? before.sentinelRagEnabled,
    sentinelAllowedTools: input.allowedTools?.length ? input.allowedTools : before.sentinelAllowedTools,
    sentinelAutomationEnabled: input.automationEnabled ?? before.sentinelAutomationEnabled,
  };
  await json.set(key('settings'), after);
  await audit(modContext.username, {
    eventType: 'sentinel.settings.updated',
    entityType: 'settings',
    entityId: 'sentinel',
    summary: `Updated Sentinel AI settings. API key ${input.apiKey ? 'saved server-side' : input.clearApiKey ? 'cleared' : 'unchanged'}.`,
    sourceModule: 'sentinel',
    before: { ...before, apiKey: before ? '[not exposed]' : undefined },
    after: { ...after, apiKey: input.apiKey ? '[saved server-side]' : '[not exposed]' },
  });
  return c.json(await (async () => {
    const meta = await getSentinelMeta(modContext.subredditName);
    return {
      hasApiKey: Boolean(await getSentinelApiKey(modContext.subredditName)),
      model: after.sentinelModel,
      envModel: process.env.GROQ_MODEL ?? null,
      temperature: after.sentinelTemperature,
      maxTokens: after.sentinelMaxTokens,
      ragEnabled: after.sentinelRagEnabled,
      allowedTools: after.sentinelAllowedTools,
      automationEnabled: after.sentinelAutomationEnabled,
      lastSuccessAt: meta.lastSuccessAt,
      lastLatencyMs: meta.lastLatencyMs,
      lastError: meta.lastError,
    };
  })());
});

api.post('/ai/test', async (c) => {
  const modContext = await requireRole('settings');
  const settings = await getSettings(modContext.subredditName);
  const apiKey = await getSentinelApiKey(modContext.subredditName);
  const startedAt = Date.now();
  const activeModel = settings.sentinelModel || GROQ_MODEL;
  const { url, provider } = getApiUrlAndProvider(activeModel);
  const capitalizedProvider = provider.charAt(0).toUpperCase() + provider.slice(1);

  if (!apiKey) {
    return c.json<TestGroqResponse>({
      ok: false,
      status: 'disabled',
      model: activeModel,
      latencyMs: null,
      message: `Sentinel AI is not configured. Owner/admin must add an API key in Settings.`,
    });
  }
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: activeModel,
        messages: [{ role: 'user', content: `Reply with exactly: ModDesk Sentinel ${capitalizedProvider} test ok.` }],
        temperature: 0,
        max_tokens: 32,
      }),
    });
    const latencyMs = Date.now() - startedAt;
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const message = `${groqFailureCauseForStatus(response.status, text, capitalizedProvider)}${text ? `: ${text.slice(0, 160)}` : ''}`;
      await setSentinelMeta(modContext.subredditName, { lastError: message });
      return c.json<TestGroqResponse>({ ok: false, status: 'error', model: activeModel, latencyMs, message }, 200);
    }
    const payload = await response.json().catch(() => undefined);
    const reply = extractGroqText(payload);
    if (!reply) {
      const message = `malformed response: ${capitalizedProvider} returned no chat completion text`;
      await setSentinelMeta(modContext.subredditName, { lastError: message });
      return c.json<TestGroqResponse>({ ok: false, status: 'error', model: activeModel, latencyMs, message }, 200);
    }
    await setSentinelMeta(modContext.subredditName, { lastSuccessAt: now(), lastLatencyMs: latencyMs, lastError: null });
    await audit(modContext.username, {
      eventType: `sentinel.${provider}.tested`,
      entityType: 'settings',
      entityId: 'sentinel',
      summary: `Tested ${capitalizedProvider} model ${activeModel} successfully in ${latencyMs}ms.`,
      sourceModule: 'sentinel',
    });
    return c.json<TestGroqResponse>({
      ok: true,
      status: 'connected',
      model: activeModel,
      latencyMs,
      message: `${capitalizedProvider} connection succeeded! verified in ${latencyMs}ms.`,
    });
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    const reason = isTimeout ? `${capitalizedProvider} timeout` : `network error: ${error instanceof Error ? error.message : `${capitalizedProvider} test failed`}`;
    const recovery = groqNetworkRecovery(reason, provider);
    const message = `${reason}. Recovery: ${recovery}`;
    await setSentinelMeta(modContext.subredditName, { lastError: reason });
    return c.json<TestGroqResponse>({ ok: false, status: isTimeout ? 'timeout' : 'error', model: activeModel, latencyMs, message }, 200);
  }
});

api.post('/ai/rag/rebuild', async (c) => {
  const modContext = await requireRole('settings');
  const docs = await buildAiCorpus(modContext);
  const index = await readRagIndex(modContext.subredditName);
  await audit(modContext.username, {
    eventType: 'sentinel.context.rebuilt',
    entityType: 'workspace_context',
    entityId: 'sentinel',
    summary: `Refreshed Sentinel workspace context with ${index?.count ?? docs.length} chunks.`,
    sourceModule: 'sentinel',
  });
  return c.json({ ok: true, rebuiltAt: index?.rebuiltAt ?? now(), count: index?.count ?? docs.length });
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
  const modContext = await requireRole('settings');
  const update = await c.req.json<UpdateSettingsRequest>();
  const before = await getSettings(modContext.subredditName);
  const enablingLiveWrites = update.liveWritesEnabled === true && !before.liveWritesEnabled;
  const after: AppSettings = {
    ...before,
    ...update,
    consensusFixedCount: Math.max(1, Math.min(12, update.consensusFixedCount ?? before.consensusFixedCount)),
    consensusPercent: Math.max(51, Math.min(100, update.consensusPercent ?? before.consensusPercent)),
    trainingRequiredLevel: Math.max(1, Math.min(12, update.trainingRequiredLevel ?? before.trainingRequiredLevel)),
    auditRetentionDays: Math.max(30, Math.min(3650, update.auditRetentionDays ?? before.auditRetentionDays)),
    liveModeEnabledBy: enablingLiveWrites ? modContext.username : before.liveModeEnabledBy,
    liveModeEnabledAt: enablingLiveWrites ? now() : before.liveModeEnabledAt,
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

api.post('/demo/queue/action', async (c) => {
  assertNeverLiveWriteInDemo('/demo/queue/action');
  const modContext = await requireModerator();
  const input = await c.req.json<QueueActionRequest>();
  const realId = input.itemId.startsWith('live:') ? input.itemId.replace('live:', '') : input.itemId;
  const thingId = asRedditThingId(realId);
  const item = input.itemId.startsWith('live:')
    ? undefined
    : await json.get<QueueItem>(key(`queue:${input.itemId}`));
  const simulated: QueueItem = {
    ...(item ?? {
      itemId: input.itemId,
      itemType: thingId?.startsWith('t1_') ? 'comment' : 'post',
      title: 'Redacted Reddit Training Case',
      bodyExcerpt: 'Demo / Training Mode simulated this action. Reddit was not modified.',
      author: 'redacted-user',
      reports: [],
      reportCount: 0,
      ageSeconds: 0,
      severityScore: 0,
      severity: 'low' satisfies Severity,
      suggestedRuleIds: [],
    }),
    status:
      input.action === 'escalate'
        ? 'consensus_required'
        : input.action === 'snooze'
          ? 'snoozed'
          : 'cleared',
    reviewedBy: modContext.username,
    reviewedAt: now(),
    outcome: `simulated:${input.action}`,
    note: input.note,
  };
  if (item) await putIndexed('queue', 'queue', simulated.itemId, simulated);
  await json.set(key(`queue-sim:${id('action')}`, 'demo'), simulated);
  await audit(modContext.username, {
    mode: 'training',
    eventType: `demo.queue.${input.action}`,
    entityType: thingId?.startsWith('t1_') ? 'comment' : 'queue_item',
    entityId: realId,
    summary: `Simulated ${input.action}. Reddit write APIs were not reachable from the demo route.`,
    sourceModule: 'queue',
    result: 'simulated',
    before: item,
    after: simulated,
  });
  return c.json(simulated);
});

api.post('/live/queue/action', async (c) => {
  const modContext = await requireModerator();
  const input = await c.req.json<QueueActionRequest>();
  if (!input.itemId.startsWith('live:')) {
    return c.json<ApiError>({
      status: 'error',
      code: 'LIVE_MODE_REQUIRED',
      message: 'Live queue writes only accept live_reddit item IDs from /api/live/*.',
    }, 403);
  }
  const realId = input.itemId.replace('live:', '');
  const thingId = asRedditThingId(realId);
  if (input.action === 'escalate') {
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
      mode: 'live',
      eventType: 'live.escalated',
      entityType: thingId?.startsWith('t1_') ? 'comment' : 'post',
      entityId: realId,
      summary: `Escalated live item ${realId} to Consensus Desk.`,
      sourceModule: 'queue',
    });
    return c.json({ success: true, ticket });
  }
  await requireLiveWrite(modContext, input.confirmation, 'posts');
  if (!thingId) throw new AuthError('REDDIT_API_UNAVAILABLE', 'Live queue item ID is not a supported post/comment ID.', 503);
  if (input.action === 'approve') {
    await reddit.approve(thingId);
  } else if (input.action === 'remove') {
    await reddit.remove(thingId, false);
  } else {
    return c.json<ApiError>({ status: 'error', message: 'Unsupported live queue action.' }, 400);
  }
  await audit(modContext.username, {
    mode: 'live',
    eventType: `live.queue.${input.action}`,
    entityType: thingId.startsWith('t1_') ? 'comment' : 'post',
    entityId: realId,
    summary: `${input.action === 'approve' ? 'Approved' : 'Removed'} live item ${realId} on r/${modContext.subredditName}.`,
    sourceModule: 'queue',
    redditResponse: `reddit.${input.action} completed`,
  });
  return c.json({
    itemId: input.itemId,
    itemType: thingId.startsWith('t1_') ? 'comment' : 'post',
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
    note: input.note,
  });
});

api.get('/demo/automod', async (c) => {
  assertNeverLiveWriteInDemo('/demo/automod');
  await requireModerator();
  const sandbox = await json.get<{ content: string }>(key('wiki:automod', 'demo'));
  return c.json({
    content: sandbox?.content ?? '# Demo Automod Sandbox\n---\ntype: submission\naction: filter\naction_reason: "Demo-only training rule"',
    mode: 'demo',
  });
});

api.post('/demo/automod', async (c) => {
  assertNeverLiveWriteInDemo('/demo/automod');
  const modContext = await requireModerator();
  const { content, reason } = await c.req.json<{ content: string; reason: string }>();
  const before = await json.get<{ content: string; updatedAt: string }>(key('wiki:automod', 'demo'));
  const after = { content, updatedAt: now(), reason: reason || 'Demo Automod sandbox save' };
  await json.set(key('wiki:automod', 'demo'), after);
  await audit(modContext.username, {
    mode: 'training',
    eventType: 'demo.automod.saved',
    entityType: 'wiki',
    entityId: 'config/automod',
    summary: 'Simulated Automod save in Demo / Training Mode. Reddit wiki was not modified.',
    sourceModule: 'automod',
    result: 'simulated',
    before,
    after,
  });
  return c.json({ success: true, mode: 'demo' });
});

api.get('/live/automod', async (c) => {
  const modContext = await requireModerator();
  try {
    const wikiPage = await reddit.getWikiPage(modContext.subredditName, 'config/automod');
    return c.json({ content: wikiPage.content, mode: 'live' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('404') || message.includes('Not Found')) {
      return c.json({
        content: '# config/automod does not exist yet for this subreddit.\n# Add Automod YAML here, validate it, then publish with confirmation.\n',
        mode: 'live',
        missing: true,
      });
    }
    throw error;
  }
});

api.post('/live/automod', async (c) => {
  const modContext = await requireModerator();
  const { content, reason, confirmation } = await c.req.json<{ content: string; reason: string; confirmation?: 'CONFIRM_LIVE_ACTION' }>();
  await requireLiveWrite(modContext, confirmation, 'wiki');
  await reddit.updateWikiPage({
    subredditName: modContext.subredditName,
    page: 'config/automod',
    content,
    reason: reason || 'ModDesk OS live Automod commit',
  });
  await audit(modContext.username, {
    mode: 'live',
    eventType: 'live.automod.updated',
    entityType: 'wiki',
    entityId: 'config/automod',
    summary: `Updated live Automod YAML. Reason: ${reason || 'ModDesk OS live Automod commit'}`,
    sourceModule: 'automod',
    redditResponse: 'reddit.updateWikiPage completed',
  });
  return c.json({ success: true, mode: 'live' });
});

api.post('/demo/modmail/reply', async (c) => {
  assertNeverLiveWriteInDemo('/demo/modmail/reply');
  const modContext = await requireModerator();
  const { threadId, body, isInternal } = await c.req.json<{ threadId: string; body: string; isInternal?: boolean }>();
  const simulated = { id: id('msg'), threadId, author: modContext.username, body, isInternal: !!isInternal, date: now() };
  await json.set(key(`modmail-sim:${simulated.id}`, 'demo'), simulated);
  await audit(modContext.username, {
    mode: 'training',
    eventType: isInternal ? 'demo.modmail.note' : 'demo.modmail.reply',
    entityType: 'modmail',
    entityId: threadId,
    summary: 'Simulated modmail message. Reddit modmail was not modified.',
    sourceModule: 'modmail',
    result: 'simulated',
    after: simulated,
  });
  return c.json({ success: true, thread: simulated, mode: 'demo' });
});

api.post('/demo/modmail/action', async (c) => {
  assertNeverLiveWriteInDemo('/demo/modmail/action');
  const modContext = await requireModerator();
  const { threadId, action } = await c.req.json<{ threadId: string; action: 'archive' | 'unarchive' | 'highlight' | 'delete' }>();
  const simulated = { id: id('modmail-action'), threadId, action, createdAt: now() };
  await json.set(key(`modmail-action-sim:${simulated.id}`, 'demo'), simulated);
  await audit(modContext.username, {
    mode: 'training',
    eventType: `demo.modmail.${action}`,
    entityType: 'modmail',
    entityId: threadId,
    summary: `Simulated ${action} for modmail. Reddit modmail was not modified.`,
    sourceModule: 'modmail',
    result: 'simulated',
    after: simulated,
  });
  return c.json({ success: true, mode: 'demo' });
});

api.post('/queue/action', async (c) => {
  const modContext = await requireModerator();
  const input = await c.req.json<QueueActionRequest>();
  const settings = await getSettings(modContext.subredditName);

  if (input.itemId.startsWith('live:')) {
    const realId = input.itemId.replace('live:', '');
    const thingId = asRedditThingId(realId);
    if (settings.workspaceMode !== 'live') {
      const simulated: QueueItem = {
        itemId: input.itemId,
        itemType: thingId?.startsWith('t1_') ? 'comment' : 'post',
        title: 'Simulated Reddit Content Action',
        bodyExcerpt: 'Demo / Training Mode simulated this action. Reddit was not modified.',
        author: 'redacted-user',
        reports: [],
        reportCount: 0,
        ageSeconds: 0,
        severityScore: 0,
        severity: 'low',
        suggestedRuleIds: [],
        status: input.action === 'escalate' ? 'consensus_required' : 'cleared',
        reviewedBy: modContext.username,
        reviewedAt: now(),
        outcome: `simulated:${input.action}`,
        note: input.note,
      };
      await json.set(key(`queue-sim:${id('action')}`, 'demo'), simulated);
      await audit(modContext.username, {
        eventType: `demo.queue.${input.action}`,
        entityType: thingId?.startsWith('t1_') ? 'comment' : 'post',
        entityId: realId,
        summary: `Simulated ${input.action} for live-derived training item ${realId}. Reddit was not modified.`,
        sourceModule: 'queue',
        result: 'simulated',
        after: simulated,
      });
      return c.json(simulated);
    }
    try {
      if (input.action === 'approve') {
        await requireLiveWrite(modContext, input.confirmation, 'posts');
        if (!thingId) throw new AuthError('REDDIT_API_UNAVAILABLE', 'Live queue item ID is not a supported post/comment ID.', 503);
        await reddit.approve(thingId);
        await audit(modContext.username, {
          eventType: 'live.approved',
          entityType: thingId.startsWith('t1_') ? 'comment' : 'post',
          entityId: realId,
          summary: `Approved live item ${realId} on r/${modContext.subredditName}`,
          sourceModule: 'queue',
          redditResponse: 'reddit.approve completed',
        });
      } else if (input.action === 'remove') {
        await requireLiveWrite(modContext, input.confirmation, 'posts');
        if (!thingId) throw new AuthError('REDDIT_API_UNAVAILABLE', 'Live queue item ID is not a supported post/comment ID.', 503);
        await reddit.remove(thingId, false);
        await audit(modContext.username, {
          eventType: 'live.removed',
          entityType: thingId.startsWith('t1_') ? 'comment' : 'post',
          entityId: realId,
          summary: `Removed live item ${realId} on r/${modContext.subredditName}`,
          sourceModule: 'queue',
          redditResponse: 'reddit.remove completed',
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
  const settings = await getSettings(modContext.subredditName);
  if (settings.workspaceMode !== 'live') {
    const sandbox = await json.get<{ content: string }>(key('wiki:automod', 'demo'));
    if (sandbox?.content) return c.json({ content: sandbox.content, mode: 'demo' });
  }
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
  const { content, reason, confirmation } = await c.req.json<{ content: string; reason: string; confirmation?: 'CONFIRM_LIVE_ACTION' }>();
  const settings = await getSettings(modContext.subredditName);
  if (settings.workspaceMode !== 'live') {
    const before = await json.get<{ content: string; updatedAt: string }>(key('wiki:automod', 'demo'));
    const after = { content, updatedAt: now(), reason: reason || 'Demo / Training Mode Automod sandbox save' };
    await json.set(key('wiki:automod', 'demo'), after);
    await audit(modContext.username, {
      eventType: 'demo.automod.saved',
      entityType: 'wiki',
      entityId: 'config/automod',
      summary: 'Simulated Automod save in Demo / Training Mode. Reddit wiki was not modified.',
      sourceModule: 'automod',
      result: 'simulated',
      before,
      after,
    });
    return c.json({ success: true, mode: 'demo' });
  }
  try {
    await requireLiveWrite(modContext, confirmation, 'wiki');
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
      sourceModule: 'automod',
      redditResponse: 'reddit.updateWikiPage completed',
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
    const settings = await getSettings(subredditName);
    if (settings.workspaceMode !== 'live') {
      await json.set(key(`user-sim:${id('action')}`, 'demo'), { type, username, action, duration, reason, note, createdAt: now() });
      await audit(modContext.username, {
        eventType: `demo.user.${type}.${action}`,
        entityType: 'user',
        entityId: username,
        summary: `Simulated ${action} for ${type} user u/${username}. Reddit was not modified.`,
        sourceModule: 'users',
        result: 'simulated',
      });
      return c.json({ success: true, mode: 'demo' });
    }
    await requireLiveWrite(modContext, confirmation, 'access');
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
  const { threadId, body, isInternal, confirmation } = await c.req.json<{
    threadId: string;
    body: string;
    isInternal?: boolean;
    confirmation?: 'CONFIRM_LIVE_ACTION';
  }>();
  const settings = await getSettings(modContext.subredditName);

  try {
    if (settings.workspaceMode === 'live' && !threadId.startsWith('demo-')) {
      await requireLiveWrite(modContext, confirmation, 'mail');
      try {
        await reddit.modMail.reply({
          conversationId: threadId,
          body,
          isInternal: !!isInternal
        });
        await audit(modContext.username, {
          eventType: isInternal ? 'live.modmail.note' : 'live.modmail.reply',
          entityType: 'modmail',
          entityId: threadId,
          summary: `${isInternal ? 'Added internal note' : 'Replied'} to live modmail conversation.`,
          sourceModule: 'modmail',
          redditResponse: 'reddit.modMail.reply completed',
        });
        return c.json({ success: true });
      } catch (err) {
        console.warn('Failed to reply to live modmail', err);
        throw err;
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
        eventType: isInternal ? 'demo.modmail.note' : 'demo.modmail.reply',
        entityType: 'modmail',
        entityId: threadId,
        summary: `${isInternal ? 'Simulated private note' : 'Simulated reply'} to u/${thread.user} in modmail: "${body.slice(0, 40)}..."`,
        sourceModule: 'modmail',
        result: 'simulated',
      });
      return c.json({ success: true, thread });
    }
    if (settings.workspaceMode !== 'live') {
      const simulated = { id: id('msg'), threadId, author: modContext.username, body, isInternal: !!isInternal, date: now() };
      await json.set(key(`modmail-sim:${simulated.id}`, 'demo'), simulated);
      await audit(modContext.username, {
        eventType: isInternal ? 'demo.modmail.note' : 'demo.modmail.reply',
        entityType: 'modmail',
        entityId: threadId,
        summary: 'Simulated modmail message for a live-derived training conversation. Reddit was not modified.',
        sourceModule: 'modmail',
        result: 'simulated',
        after: simulated,
      });
      return c.json({ success: true, thread: simulated });
    }
    return c.json({ success: false, error: 'Modmail thread not found.' }, 404);
  } catch (err: any) {
    console.error('Failed to reply to modmail', err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

api.post('/live/modmail/action', async (c) => {
  const modContext = await requireModerator();
  const { threadId, action, confirmation } = await c.req.json<{
    threadId: string;
    action: 'archive' | 'unarchive' | 'highlight' | 'delete';
    confirmation?: 'CONFIRM_LIVE_ACTION';
  }>();
  const settings = await getSettings(modContext.subredditName);

  try {
    if (settings.workspaceMode === 'live' && !threadId.startsWith('demo-')) {
      await requireLiveWrite(modContext, confirmation, 'mail');
      try {
        if (action === 'archive') {
          await reddit.modMail.archiveConversation(threadId);
        } else if (action === 'unarchive') {
          await reddit.modMail.unarchiveConversation(threadId);
        }
        await audit(modContext.username, {
          eventType: `live.modmail.${action}`,
          entityType: 'modmail',
          entityId: threadId,
          summary: `${action.toUpperCase()} live modmail conversation.`,
          sourceModule: 'modmail',
          redditResponse: `reddit.modMail.${action} completed`,
        });
        return c.json({ success: true });
      } catch (err) {
        console.warn('Failed live modmail action', err);
        throw err;
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
        eventType: `demo.modmail.${action}`,
        entityType: 'modmail',
        entityId: threadId,
        summary: `Simulated ${action.toUpperCase()} modmail conversation with u/${thread.user}`,
        sourceModule: 'modmail',
        result: 'simulated',
      });
      return c.json({ success: true });
    }
    if (settings.workspaceMode !== 'live') {
      await json.set(key(`modmail-action-sim:${id('action')}`, 'demo'), { threadId, action, createdAt: now() });
      await audit(modContext.username, {
        eventType: `demo.modmail.${action}`,
        entityType: 'modmail',
        entityId: threadId,
        summary: `Simulated ${action} for live-derived modmail. Reddit was not modified.`,
        sourceModule: 'modmail',
        result: 'simulated',
      });
      return c.json({ success: true, mode: 'demo' });
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

api.get('/live/commentcop', async (c) => {
  const modContext = await requireModerator();
  const [settings, cases, stats] = await Promise.all([
    getCommentCopSettings(modContext.subredditName),
    getCommentCopCases(modContext.subredditName),
    getCommentCopStats(modContext.subredditName),
  ]);
  return c.json<CommentCopResponse>({ settings, cases, stats });
});

api.post('/live/commentcop/settings', async (c) => {
  const modContext = await requireRole('settings');
  const input = await c.req.json<Partial<CommentCopSettings>>();
  const current = await getCommentCopSettings(modContext.subredditName);
  const next: CommentCopSettings = {
    ...current,
    ...(typeof input.enabled === 'boolean' ? { enabled: input.enabled } : {}),
    ...(typeof input.threshold === 'number' ? { threshold: Math.min(1, Math.max(0.5, input.threshold)) } : {}),
    ...(input.action === 'remove' || input.action === 'log_only' ? { action: input.action } : {}),
    ...(typeof input.minTokenCount === 'number' ? { minTokenCount: Math.min(40, Math.max(4, Math.round(input.minTokenCount))) } : {}),
    ...(typeof input.rollingWindowSize === 'number' ? { rollingWindowSize: Math.min(1000, Math.max(50, Math.round(input.rollingWindowSize))) } : {}),
    ...(typeof input.supabaseVerificationEnabled === 'boolean'
      ? { supabaseVerificationEnabled: input.supabaseVerificationEnabled && Boolean(process.env.SUPABASE_COMMENTCOP_URL) }
      : {}),
    supabaseUrlConfigured: Boolean(process.env.SUPABASE_COMMENTCOP_URL),
  };
  await json.set(keyFor(modContext.subredditName, 'live', 'commentcop:settings'), next);
  await audit(modContext.username, {
    mode: 'live',
    eventType: 'commentcop.settings.updated',
    entityType: 'settings',
    entityId: 'commentcop',
    summary: 'Updated CommentCop anti-bot similarity settings.',
    sourceModule: 'commentcop',
    before: current,
    after: next,
  });
  const [cases, stats] = await Promise.all([
    getCommentCopCases(modContext.subredditName),
    getCommentCopStats(modContext.subredditName),
  ]);
  return c.json<CommentCopResponse>({ settings: next, cases, stats });
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

// ── Per-mod scoped storage (Phase 1) ──────────────────────────────────
type ModPrefsType = import('../../shared/api').ModPrefs;
type ChatMessageType = import('../../shared/api').ChatMessage;
type OwnerWorkspaceConfigType = import('../../shared/api').OwnerWorkspaceConfig;
type FirstRunStatusType = import('../../shared/api').FirstRunStatus;
type TeamMemberType = import('../../shared/api').TeamMember;

const DEFAULT_MOD_PREFS = (): ModPrefsType => ({
  themeMode: 'modern',
  wallpaperId: 'wall1',
  notificationsEnabled: true,
  notificationSound: false,
  pinnedModules: [],
  dashboardLayout: 'grid',
  compactWindows: false,
  lastSeenChatAt: null,
  updatedAt: new Date().toISOString(),
});

const DEFAULT_OWNER_CONFIG = (): OwnerWorkspaceConfigType => ({
  defaultWorkspaceMode: 'live',
  requireConfirmationOnLive: true,
  allowTraineeAccess: true,
  defaultThemeMode: 'modern',
  welcomeMessage: 'Welcome to ModDesk. Pick your queue from the dock and keep good notes.',
  updatedAt: new Date().toISOString(),
  updatedBy: null,
});

const modKey = (sub: string, user: string, name: string) =>
  `${NS}:${sub}:mod:${user.toLowerCase()}:${name}`;
const teamKey = (sub: string, name: string) => `${NS}:${sub}:team:${name}`;
const ownerKey = (sub: string, name: string) => `${NS}:${sub}:owner:${name}`;

async function requireOwner(): Promise<ModContextState & { username: string }> {
  const mc = await requireModerator();
  if (mc.modDeskRole !== 'owner' && mc.modDeskRole !== 'admin') {
    throw new AuthError('NOT_APPROVED', 'Owner or admin role required.', 403);
  }
  return mc;
}

api.get('/mod/prefs', async (c) => {
  const mc = await requireModerator();
  const raw = await redis.get(modKey(mc.subredditName, mc.username, 'prefs'));
  let prefs = DEFAULT_MOD_PREFS();
  if (raw) {
    try { prefs = { ...prefs, ...(JSON.parse(raw) as Partial<ModPrefsType>) }; }
    catch { /* fall through to defaults */ }
  }
  return c.json({ prefs });
});

api.post('/mod/prefs', async (c) => {
  const mc = await requireModerator();
  const body = (await c.req.json().catch(() => ({}))) as Partial<ModPrefsType>;
  const existingRaw = await redis.get(modKey(mc.subredditName, mc.username, 'prefs'));
  let existing = DEFAULT_MOD_PREFS();
  if (existingRaw) {
    try { existing = { ...existing, ...(JSON.parse(existingRaw) as Partial<ModPrefsType>) }; }
    catch { /* ignore */ }
  }
  const next: ModPrefsType = { ...existing, ...body, updatedAt: now() };
  await redis.set(modKey(mc.subredditName, mc.username, 'prefs'), JSON.stringify(next));
  return c.json({ prefs: next });
});

api.get('/mod/notifications', async (c) => {
  const mc = await requireModerator();
  const prefsRaw = await redis.get(modKey(mc.subredditName, mc.username, 'prefs'));
  let lastSeen = 0;
  if (prefsRaw) {
    try {
      const p = JSON.parse(prefsRaw) as Partial<ModPrefsType>;
      if (p.lastSeenChatAt) lastSeen = new Date(p.lastSeenChatAt).getTime();
    } catch { /* ignore */ }
  }
  const allRaw = await redis.get(teamKey(mc.subredditName, 'messages'));
  let chatUnread = 0;
  let mentionUnread = 0;
  if (allRaw) {
    try {
      const messages = JSON.parse(allRaw) as ChatMessageType[];
      for (const m of messages) {
        const t = new Date(m.createdAt).getTime();
        if (t > lastSeen && m.author.toLowerCase() !== mc.username.toLowerCase()) {
          chatUnread += 1;
          if (m.mentions.some((u) => u.toLowerCase() === mc.username.toLowerCase())) mentionUnread += 1;
        }
      }
    } catch { /* ignore */ }
  }
  return c.json({ chatUnread, mentionUnread, totalUnread: chatUnread });
});

api.post('/mod/notifications/read', async (c) => {
  const mc = await requireModerator();
  const prefsRaw = await redis.get(modKey(mc.subredditName, mc.username, 'prefs'));
  let prefs = DEFAULT_MOD_PREFS();
  if (prefsRaw) {
    try { prefs = { ...prefs, ...(JSON.parse(prefsRaw) as Partial<ModPrefsType>) }; }
    catch { /* ignore */ }
  }
  prefs.lastSeenChatAt = now();
  prefs.updatedAt = prefs.lastSeenChatAt;
  await redis.set(modKey(mc.subredditName, mc.username, 'prefs'), JSON.stringify(prefs));
  return c.json({ ok: true, lastSeenChatAt: prefs.lastSeenChatAt });
});

// ── Team chat (Phase 2) ───────────────────────────────────────────────
const MAX_CHAT_MESSAGES = 200;
const parseMentions = (body: string): string[] => {
  const out = new Set<string>();
  const re = /(?:^|\s)@([a-z0-9_-]{3,30})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const name = m[1];
    if (name) out.add(name.toLowerCase());
  }
  return [...out];
};

api.get('/team/chat', async (c) => {
  const mc = await requireModerator();
  const sinceParam = c.req.query('since');
  const since = sinceParam ? new Date(sinceParam).getTime() : 0;
  const raw = await redis.get(teamKey(mc.subredditName, 'messages'));
  let messages: ChatMessageType[] = [];
  if (raw) {
    try { messages = JSON.parse(raw) as ChatMessageType[]; }
    catch { messages = []; }
  }
  if (since > 0) messages = messages.filter((m) => new Date(m.createdAt).getTime() > since);
  messages = messages.slice(-100);
  const pinned = messages.filter((m) => m.pinned);
  const participants = [...new Set(messages.map((m) => m.author))];
  return c.json({ messages, pinned, participants });
});

api.post('/team/chat', async (c) => {
  const mc = await requireModerator();
  const body = (await c.req.json().catch(() => ({}))) as { body?: string };
  const text = (body.body ?? '').trim();
  if (!text) {
    return c.json({ status: 'error', message: 'Empty message.' } satisfies ApiError, 400);
  }
  if (text.length > 2000) {
    return c.json({ status: 'error', message: 'Message exceeds 2000 chars.' } satisfies ApiError, 400);
  }
  const raw = await redis.get(teamKey(mc.subredditName, 'messages'));
  let messages: ChatMessageType[] = [];
  if (raw) {
    try { messages = JSON.parse(raw) as ChatMessageType[]; }
    catch { messages = []; }
  }
  const message: ChatMessageType = {
    id: id('msg'),
    author: mc.username,
    authorRole: mc.modDeskRole,
    body: text,
    mentions: parseMentions(text),
    pinned: false,
    createdAt: now(),
  };
  messages.push(message);
  if (messages.length > MAX_CHAT_MESSAGES) messages = messages.slice(-MAX_CHAT_MESSAGES);
  await redis.set(teamKey(mc.subredditName, 'messages'), JSON.stringify(messages));
  return c.json({ message });
});

api.post('/team/chat/pin', async (c) => {
  const mc = await requireOwner();
  const body = (await c.req.json().catch(() => ({}))) as { messageId?: string; pinned?: boolean };
  if (!body.messageId) {
    return c.json({ status: 'error', message: 'messageId required.' } satisfies ApiError, 400);
  }
  const raw = await redis.get(teamKey(mc.subredditName, 'messages'));
  if (!raw) {
    return c.json({ status: 'error', message: 'No chat history.' } satisfies ApiError, 404);
  }
  let messages: ChatMessageType[];
  try { messages = JSON.parse(raw) as ChatMessageType[]; }
  catch { messages = []; }
  const target = messages.find((m) => m.id === body.messageId);
  if (!target) {
    return c.json({ status: 'error', message: 'Message not found.' } satisfies ApiError, 404);
  }
  target.pinned = body.pinned ?? !target.pinned;
  await redis.set(teamKey(mc.subredditName, 'messages'), JSON.stringify(messages));
  return c.json({ message: target });
});

api.delete('/team/chat/:messageId', async (c) => {
  const mc = await requireModerator();
  const messageId = c.req.param('messageId');
  const raw = await redis.get(teamKey(mc.subredditName, 'messages'));
  if (!raw) return c.json({ status: 'error', message: 'No chat history.' } satisfies ApiError, 404);
  let messages: ChatMessageType[];
  try { messages = JSON.parse(raw) as ChatMessageType[]; }
  catch { messages = []; }
  const target = messages.find((m) => m.id === messageId);
  if (!target) return c.json({ status: 'error', message: 'Not found.' } satisfies ApiError, 404);
  const canDelete = target.author.toLowerCase() === mc.username.toLowerCase() ||
    mc.modDeskRole === 'owner' || mc.modDeskRole === 'admin';
  if (!canDelete) {
    return c.json({ status: 'error', message: 'Only author, owner, or admin can delete.' } satisfies ApiError, 403);
  }
  messages = messages.filter((m) => m.id !== messageId);
  await redis.set(teamKey(mc.subredditName, 'messages'), JSON.stringify(messages));
  return c.json({ ok: true });
});

// ── Owner admin + first-run (Phase 3) ─────────────────────────────────
api.get('/owner/team', async (c) => {
  const mc = await requireModerator();
  let mods: Array<{ username: string; modPermissions?: Map<string, unknown> }>;
  try {
    const rawMods = await reddit.getModerators({ subredditName: mc.subredditName, limit: 100 }).all();
    mods = rawMods as unknown as Array<{ username: string; modPermissions?: Map<string, unknown> }>;
  } catch {
    mods = [];
  }
  const ownerUsername = mods[0]?.username ?? null;
  const lastActiveRaw = await redis.get(teamKey(mc.subredditName, 'last-active'));
  let lastActive: Record<string, string> = {};
  if (lastActiveRaw) {
    try { lastActive = JSON.parse(lastActiveRaw) as Record<string, string>; }
    catch { /* ignore */ }
  }
  lastActive[mc.username.toLowerCase()] = now();
  await redis.set(teamKey(mc.subredditName, 'last-active'), JSON.stringify(lastActive));

  const members: TeamMemberType[] = mods.map((mod, idx) => {
    const perms = mod.modPermissions ? ((mod.modPermissions.get(mc.subredditName) ?? []) as string[]).map(String) : [];
    const isTop = idx === 0;
    const role = inferModDeskRole(isTop, perms);
    return {
      username: mod.username,
      role,
      isYou: mod.username.toLowerCase() === mc.username.toLowerCase(),
      isTopMod: isTop,
      lastActiveAt: lastActive[mod.username.toLowerCase()] ?? null,
      permissions: perms,
    };
  });
  return c.json({ members, ownerUsername, subredditName: mc.subredditName });
});

api.get('/owner/config', async (c) => {
  const mc = await requireModerator();
  const raw = await redis.get(ownerKey(mc.subredditName, 'config'));
  let cfg = DEFAULT_OWNER_CONFIG();
  if (raw) {
    try { cfg = { ...cfg, ...(JSON.parse(raw) as Partial<OwnerWorkspaceConfigType>) }; }
    catch { /* ignore */ }
  }
  return c.json({ config: cfg });
});

api.post('/owner/config', async (c) => {
  const mc = await requireOwner();
  const body = (await c.req.json().catch(() => ({}))) as Partial<OwnerWorkspaceConfigType>;
  const raw = await redis.get(ownerKey(mc.subredditName, 'config'));
  let cfg = DEFAULT_OWNER_CONFIG();
  if (raw) {
    try { cfg = { ...cfg, ...(JSON.parse(raw) as Partial<OwnerWorkspaceConfigType>) }; }
    catch { /* ignore */ }
  }
  const next: OwnerWorkspaceConfigType = { ...cfg, ...body, updatedAt: now(), updatedBy: mc.username };
  await redis.set(ownerKey(mc.subredditName, 'config'), JSON.stringify(next));
  return c.json({ config: next });
});

api.get('/setup/status', async (c) => {
  const mc = await requireModerator();
  const raw = await redis.get(ownerKey(mc.subredditName, 'first-run'));
  if (!raw) {
    return c.json({ completed: false, completedAt: null, completedBy: null } satisfies FirstRunStatusType);
  }
  try {
    const status = JSON.parse(raw) as FirstRunStatusType;
    return c.json(status);
  } catch {
    return c.json({ completed: false, completedAt: null, completedBy: null } satisfies FirstRunStatusType);
  }
});

api.post('/setup/complete', async (c) => {
  const mc = await requireOwner();
  const status: FirstRunStatusType = { completed: true, completedAt: now(), completedBy: mc.username };
  await redis.set(ownerKey(mc.subredditName, 'first-run'), JSON.stringify(status));
  return c.json(status);
});

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
