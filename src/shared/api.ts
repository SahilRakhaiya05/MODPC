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

export type ModContext = {
  username: string;
  subredditName: string;
  isModerator: boolean;
  redisStatus: 'ok' | 'degraded';
};

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
  eventType: string;
  entityType: string;
  entityId: string;
  summary: string;
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
  >
>;

export type ApiError = {
  status: 'error';
  message: string;
};

export const RULES = [
  { id: 'rule-1', label: 'Rule 1: Civility' },
  { id: 'rule-2', label: 'Rule 2: Stay on Topic' },
  { id: 'rule-3', label: 'Rule 3: Spam / Self-Promo' },
  { id: 'rule-4', label: 'Rule 4: Duplicate / Megathread' },
  { id: 'rule-5', label: 'Rule 5: Crisis or Safety Escalation' },
] as const;
