export type Severity = 'low' | 'medium' | 'high' | 'critical';

export type TrainingAction = 'approve' | 'remove' | 'filter' | 'escalate' | 'skip';

export type TicketStatus =
  | 'draft'
  | 'pending'
  | 'needs_info'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'executed';

export type VoteChoice = 'approve' | 'reject' | 'abstain';

export type QueueStatus =
  | 'new'
  | 'reviewing'
  | 'escalated'
  | 'cleared'
  | 'consensus_required'
  | 'snoozed';

export type TemplateTone = 'neutral' | 'strict' | 'friendly' | 'educational';

export type TemplateStatus = 'draft' | 'active' | 'archived';

export type ThresholdMode = 'simple_majority' | 'fixed_count' | 'two_thirds';

export type ThemeMode = 'authentic' | 'modern' | 'high_contrast';

export type WorkspaceMode = 'live' | 'training';

export type WallpaperId = 'dotted' | 'wall1' | 'office-party' | 'plain';

export type AppMode = 'live' | 'demo';

export type ModDeskRole = 'owner' | 'admin' | 'moderator' | 'trainee' | 'observer';

export type ModContext = {
  username: string | null;
  subredditName: string;
  isModerator: boolean;
  redisStatus: 'ok' | 'degraded';
};

export type AuthErrorCode =
  | 'NOT_LOGGED_IN'
  | 'NOT_MODERATOR'
  | 'NOT_APPROVED'
  | 'MISSING_PERMISSION'
  | 'LIVE_MODE_REQUIRED'
  | 'DEMO_MODE_ONLY'
  | 'REDDIT_API_UNAVAILABLE';

export type ModuleCapability = {
  enabled: boolean;
  live: boolean;
  reason?: AuthErrorCode;
  detail?: string;
};

export type SubredditInstall = {
  subredditName: string;
  lastSeenAt: string;
  iconUrl: string | null;
  subscribers: number | null;
};

export type SessionResponse = {
  username: string | null;
  subredditName: string;
  isModerator: boolean;
  modPermissions: string[];
  modDeskRole: ModDeskRole;
  workspaceMode: WorkspaceMode;
  liveWritesEnabled: boolean;
  subredditIconUrl: string | null;
  subredditSubscribers: number | null;
  installs: SubredditInstall[];
  errors: Array<{ code: AuthErrorCode; message: string }>;
  capabilities: {
    queue: ModuleCapability;
    modmail: ModuleCapability;
    automod: ModuleCapability;
    modlog: ModuleCapability;
    users: ModuleCapability;
    flairs: ModuleCapability;
    insights: ModuleCapability;
  };
};

export type AIStatus = 'connected' | 'disabled' | 'error' | 'timeout';
export type AiChatStatus = 'success' | 'not_configured' | 'error';

export type CommunityStatus = 'installed' | 'not_installed' | 'missing_permissions' | 'unknown';

export type ActionState = 'draft' | 'pending_confirmation' | 'executed' | 'failed' | 'cancelled';

export type RiskLevel = 'low' | 'medium' | 'high';

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export type AppSettings = {
  subredditName: string;
  initializedAt: string;
  consensusThresholdMode: ThresholdMode;
  consensusFixedCount: number;
  consensusPercent: number;
  highImpactActions: string[];
  trainingRequiredLevel: number;
  themeMode: ThemeMode;
  mobileCompactMode: boolean;
  anonymousVotesUntilClosed: boolean;
  templateApprovalRequired: boolean;
  scenarioDifficultyMix: string;
  /** 'live' = real Reddit data only. 'training' = unlocks Mod Academy + safe sandbox scenarios. Defaults to 'live'. */
  workspaceMode: WorkspaceMode;
  /** Desktop wallpaper preset id — see public/wallpaper/* for matching image files. */
  wallpaperId: WallpaperId;
  liveWritesEnabled: boolean;
  liveModeEnabledBy: string | null;
  liveModeEnabledAt: string | null;
  auditRetentionDays: number;
  sentinelModel: string;
  sentinelTemperature: number;
  sentinelMaxTokens: number;
  sentinelRagEnabled: boolean;
  sentinelAllowedTools: string[];
  sentinelAutomationEnabled: boolean;
};

export type ModeratorProfile = {
  username: string;
  firstSeenAt: string;
  roleLabel: string;
  trainingLevel: number;
  xp: number;
  totalScenarios: number;
  correctScenarios: number;
  queueReviewed: number;
  consensusVotesCast: number;
  streak: number;
  lastActiveAt: string;
  missedConcepts: string[];
};

export type TrainingScenario = {
  scenarioId: string;
  sourceType: 'post' | 'comment' | 'modmail';
  title: string;
  bodyExcerpt: string;
  authorNameHash: string;
  reportReasons: string[];
  expectedAction: TrainingAction;
  expectedRuleId: string;
  difficulty: 'easy' | 'medium' | 'hard';
  explanation: string;
  tags: string[];
  source: 'mock' | 'reddit_read_only' | 'live_shadow';
  sourceRef?: string;
  createdBy: string;
  createdAt: string;
  status: 'active' | 'archived';
};

export type TrainingAttempt = {
  attemptId: string;
  scenarioId: string;
  username: string;
  chosenAction: TrainingAction;
  chosenRuleId: string;
  confidence: number;
  latencyMs: number;
  score: number;
  xpAwarded: number;
  feedback: string;
  createdAt: string;
};

export type ConsensusTicket = {
  ticketId: string;
  actionType: string;
  targetType: 'user' | 'post' | 'comment' | 'thread' | 'announcement';
  targetId: string;
  targetDisplay: string;
  proposedBy: string;
  reason: string;
  severity: Severity;
  evidence: string[];
  thresholdType: ThresholdMode;
  requiredVotes: number;
  status: TicketStatus;
  createdAt: string;
  expiresAt: string;
  finalizedAt?: string;
  executedAt?: string;
  finalOutcome?: string;
  notes: string;
};

export type ConsensusVote = {
  ticketId: string;
  username: string;
  vote: VoteChoice;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type ResponseTemplate = {
  templateId: string;
  title: string;
  linkedRuleId: string;
  tone: TemplateTone;
  markdown: string;
  macrosUsed: string[];
  status: TemplateStatus;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  version: number;
};

export type QueueItem = {
  itemId: string;
  itemType: 'post' | 'comment' | 'thread';
  title: string;
  bodyExcerpt: string;
  author: string;
  reports: string[];
  reportCount: number;
  ageSeconds: number;
  severityScore: number;
  severity: Severity;
  suggestedRuleIds: string[];
  status: QueueStatus;
  assignedTo?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  outcome?: string;
  note?: string;
};

export type AuditEvent = {
  eventId: string;
  actor: string;
  actorRole?: ModDeskRole;
  mode?: WorkspaceMode;
  subreddit?: string;
  eventType: string;
  entityType: string;
  entityId: string;
  summary: string;
  sourceModule?: string;
  result?: 'success' | 'failure' | 'simulated';
  redditResponse?: string;
  before?: unknown;
  after?: unknown;
  createdAt: string;
};

export type DashboardSummary = {
  pendingVotes: number;
  trainingLevel: number;
  queueCritical: number;
  templatesCount: number;
  teamCoverage: number;
};

export type DashboardResponse = {
  context: ModContext;
  settings: AppSettings;
  profile: ModeratorProfile;
  summary: DashboardSummary;
  scenarios: TrainingScenario[];
  tickets: ConsensusTicket[];
  votes: ConsensusVote[];
  templates: ResponseTemplate[];
  queue: QueueItem[];
  audit: AuditEvent[];
};

export type SubmitAttemptRequest = {
  scenarioId: string;
  chosenAction: TrainingAction;
  chosenRuleId: string;
  confidence: number;
  latencyMs: number;
};

export type SubmitAttemptResponse = {
  attempt: TrainingAttempt;
  profile: ModeratorProfile;
  scenario: TrainingScenario;
};

export type CreateTicketRequest = {
  actionType: string;
  targetType: ConsensusTicket['targetType'];
  targetId: string;
  targetDisplay: string;
  reason: string;
  severity: Severity;
  evidence: string[];
  notes: string;
};

export type VoteRequest = {
  ticketId: string;
  vote: VoteChoice;
  note: string;
};

export type TicketDetailResponse = {
  ticket: ConsensusTicket;
  votes: ConsensusVote[];
};

export type SaveTemplateRequest = {
  templateId?: string;
  title: string;
  linkedRuleId: string;
  tone: TemplateTone;
  markdown: string;
  status: TemplateStatus;
};

export type QueueActionRequest = {
  itemId: string;
  action: 'reviewed' | 'approve' | 'remove' | 'escalate' | 'snooze';
  note: string;
  confirmation?: 'CONFIRM_LIVE_ACTION';
};

export type LiveInsightRule = {
  rule: string;
  count: number;
  percentage: number;
};

export type LiveInsightPoint = {
  label: string;
  count: number;
};

export type LiveInsightResponse = {
  source: 'live' | 'derived' | 'unavailable';
  generatedAt: string;
  queueOpen: number;
  queueCritical: number;
  modmailOpen: number | null;
  modlogEvents: number;
  auditEvents: number;
  automodState: 'live' | 'empty' | 'unavailable';
  rulesViolated: LiveInsightRule[];
  activityStats: LiveInsightPoint[];
  telemetryLogs: Array<{ timestamp: string; message: string }>;
};

export type AiChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type AiContextSource = {
  id: string;
  title: string;
  type: 'rule' | 'queue' | 'template' | 'audit' | 'playbook' | 'settings' | 'modlog' | 'radar' | 'handoff';
  excerpt: string;
  score: number;
};

export type AiChatRequest = {
  prompt: string;
  history: AiChatMessage[];
};

export type AiChatResponse = {
  reply: string;
  model: string;
  status: AiChatStatus;
  sources: AiContextSource[];
  promptPreview: string;
  reasoningSummary: string;
  recommendedAction: string;
  riskLevel: Severity;
  relatedPolicy: string;
  confidence: ConfidenceLevel;
  nextSuggestedAction: string;
  modeLabel: 'demo-only' | 'live-capable';
  suggestedTasks: SentinelTaskDraft[];
  errorReason?: string;
  modelStatus: {
    status: AIStatus;
    provider: 'groq' | 'none';
    model?: string;
    lastError?: string;
    latencyMs?: number;
  };
};

export type SentinelTaskDraft = {
  taskId: string;
  title: string;
  type:
    | 'draft_modmail_reply'
    | 'create_consensus_ticket'
    | 'generate_shift_handoff'
    | 'prepare_automod_patch'
    | 'summarize_queue'
    | 'create_training_case'
    | 'create_saved_response'
    | 'prepare_ban_recommendation'
    | 'open_live_confirmation';
  status: 'draft' | 'simulated' | 'live_confirmation_required' | 'executed';
  mode: WorkspaceMode;
  permissionRequired?: string;
  summary: string;
};

export type SentinelSettingsResponse = {
  hasApiKey: boolean;
  model: string;
  envModel: string | null;
  temperature: number;
  maxTokens: number;
  ragEnabled: boolean;
  allowedTools: string[];
  automationEnabled: boolean;
  lastSuccessAt: string | null;
  lastLatencyMs: number | null;
  lastError: string | null;
};

export type UpdateSentinelSettingsRequest = {
  apiKey?: string;
  clearApiKey?: boolean;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  ragEnabled?: boolean;
  allowedTools?: string[];
  automationEnabled?: boolean;
};

export type TestGroqResponse = {
  ok: boolean;
  status: AIStatus;
  model: string;
  latencyMs: number | null;
  message: string;
};

export type CapabilityStatus = 'available' | 'limited' | 'unavailable' | 'needs_permission' | 'demo_only' | 'error';

export type CapabilityMatrixItem = {
  id: string;
  label: string;
  status: CapabilityStatus;
  detail: string;
};

export type SessionState = {
  user: {
    id: string;
    name: string;
    isModerator: boolean;
  } | null;
  mode: AppMode;
  activeCommunity: {
    name: string;
    displayName: string;
    status: CommunityStatus;
  } | null;
  capabilities: CapabilityMatrixItem[];
  ai: {
    status: AIStatus;
    provider: 'groq' | 'local' | 'none';
    model?: string;
    lastError?: string;
  };
};

export type CrisisSignal =
  | 'safety'
  | 'doxxing'
  | 'brigade'
  | 'harassment'
  | 'spam-wave'
  | 'ban-evasion'
  | 'duplicate-surge'
  | 'policy';

export type CrisisRadarCase = {
  id: string;
  title: string;
  itemType: QueueItem['itemType'];
  author: string;
  excerpt: string;
  reportCount: number;
  ageSeconds: number;
  severity: Severity;
  severityScore: number;
  signals: CrisisSignal[];
  suggestedRuleIds: string[];
  recommendedAction: 'review' | 'consensus' | 'draft-response' | 'ask-sentinel' | 'check-user';
  source: 'live' | 'training';
};

export type CrisisRadarResponse = {
  mode: WorkspaceMode;
  generatedAt: string;
  pressureScore: number;
  queueOpen: number;
  queueCritical: number;
  cases: CrisisRadarCase[];
  rulePressure: LiveInsightRule[];
  recentEvents: Array<{ id: string; kind: string; createdAt: string; actor?: string | null; summary: string }>;
  recentAudits: AuditEvent[];
};

export type ComposerDraftRequest = {
  targetType: 'post' | 'comment' | 'user' | 'modmail' | 'automod' | 'announcement';
  actionIntent: 'approve' | 'remove' | 'escalate' | 'reply' | 'archive' | 'draft_automod' | 'create_consensus';
  targetId?: string;
  context: string;
};

export type ComposerDraftResponse = {
  draftId: string;
  riskLevel: Severity;
  title: string;
  draft: string;
  checklist: string[];
  matchedTemplates: Array<{ templateId: string; title: string; tone: TemplateTone; markdown: string }>;
  removalReasons: Array<{ id: string; title: string; message: string }>;
  shouldUseConsensus: boolean;
  sentinelPrompt: string;
};

export type HandoffRecord = {
  handoffId: string;
  subredditName: string;
  createdBy: string;
  createdAt: string;
  notes: string;
  summary: string;
  pressureScore: number;
  queueOpen: number;
  modmailOpen: number | null;
  pendingConsensus: number;
  nextModItems: string[];
  recentChanges: string[];
};

export type HandoffResponse = {
  current: {
    pressureScore: number;
    queueOpen: number;
    modmailOpen: number | null;
    auditCount: number;
    pendingConsensus: number;
    nextModItems: string[];
    recentChanges: string[];
  };
  records: HandoffRecord[];
};

export type CreateHandoffRequest = {
  notes: string;
};

export type UpdateSettingsRequest = Partial<
  Pick<
    AppSettings,
    | 'consensusThresholdMode'
    | 'consensusFixedCount'
    | 'consensusPercent'
    | 'highImpactActions'
    | 'trainingRequiredLevel'
    | 'themeMode'
    | 'mobileCompactMode'
    | 'anonymousVotesUntilClosed'
    | 'templateApprovalRequired'
    | 'scenarioDifficultyMix'
    | 'workspaceMode'
    | 'wallpaperId'
    | 'liveWritesEnabled'
    | 'auditRetentionDays'
    | 'sentinelModel'
    | 'sentinelTemperature'
    | 'sentinelMaxTokens'
    | 'sentinelRagEnabled'
    | 'sentinelAllowedTools'
    | 'sentinelAutomationEnabled'
  >
>;

export type ApiError = {
  status: 'error';
  code?: AuthErrorCode;
  message: string;
};

export const RULES = [
  { id: 'rule-1', label: 'Rule 1: Civility' },
  { id: 'rule-2', label: 'Rule 2: Stay on Topic' },
  { id: 'rule-3', label: 'Rule 3: Spam / Self-Promo' },
  { id: 'rule-4', label: 'Rule 4: Duplicate / Megathread' },
  { id: 'rule-5', label: 'Rule 5: Crisis or Safety Escalation' },
] as const;
