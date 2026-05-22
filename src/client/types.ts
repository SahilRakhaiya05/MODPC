export interface AppSettings {
  subredditName: string;
  initializedAt: string;
  consensusThresholdMode: 'fixed' | 'percent';
  consensusFixedCount: number;
  consensusPercent: number;
  highImpactActions: string[];
  trainingRequiredLevel: number;
  themeMode: 'authentic' | 'modern' | 'high-contrast';
  queueScoringConfig: {
    reportWeight: number;
    ageWeight: number;
    keyWeight: number;
  };
  mobileCompactMode?: boolean;
  anonymousVotesUntilClosed?: boolean;
  templateApprovalRequired?: boolean;
  scenarioDifficultyMix?: string;
  workspaceMode?: 'live' | 'training';
}

export interface ModeratorProfile {
  username: string;
  firstSeenAt: string;
  roleLabel: string;
  trainingLevel: number;
  xp: number;
  totalScenarios: number;
  correctScenarios: number;
  queueReviewed: number;
  consensusVotesCast: number;
  lastActiveAt: string;
  streak?: number;
  missedConcepts?: string[];
}

export interface TrainingScenario {
  scenarioId: string;
  sourceType: 'post' | 'comment' | 'modmail';
  title: string;
  bodyExcerpt: string;
  authorNameHash: string;
  reportReasons: string[];
  expectedAction: 'approve' | 'remove' | 'filter' | 'escalate' | 'skip';
  expectedRuleId: string;
  difficulty: 'easy' | 'medium' | 'hard';
  explanation: string;
  tags: string[];
  status: 'active' | 'archived';
}

export interface TrainingAttempt {
  attemptId: string;
  scenarioId: string;
  username: string;
  chosenAction: string;
  chosenRuleId: string;
  confidence: number;
  latencyMs: number;
  score: number;
  xpAwarded: number;
  isCorrect: boolean;
  feedback: string;
  createdAt: string;
}

export interface ConsensusVote {
  ticketId?: string;
  username: string;
  vote: 'approve' | 'reject' | 'abstain';
  note: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ConsensusTicket {
  ticketId: string;
  actionType: 'ban_permanent' | 'mute_long' | 'mass_remove' | 'thread_lock_cascade' | 'settings_change' | 'comment_removal' | string;
  targetType: 'user' | 'post' | 'comment' | 'subreddit' | 'thread' | 'announcement' | string;
  targetId: string;
  targetDisplay: string;
  proposedBy: string;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  evidence: string;
  thresholdType: 'fixed' | 'percent' | string;
  requiredVotes: number;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'expired' | 'draft' | 'needs_info';
  createdAt: string;
  expiresAt: string;
  finalizedAt: string | null;
  executedAt: string | null;
  finalOutcome: string | null;
  votes: ConsensusVote[];
  notes?: string;
}

export interface ResponseTemplate {
  templateId: string;
  title: string;
  linkedRuleId: string;
  tone: 'neutral' | 'strict' | 'friendly' | 'educational';
  markdown: string;
  macrosUsed: string[];
  status: 'active' | 'archived' | 'draft';
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  version: number;
}

export interface QueueItem {
  itemId: string;
  itemType: 'post' | 'comment' | 'thread';
  title: string;
  bodyExcerpt: string;
  author: string;
  reports: { reason: string; count: number }[];
  reportCount: number;
  ageSeconds: number;
  severityScore: number;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  suggestedRuleIds: string[];
  status: 'new' | 'reviewing' | 'escalated' | 'cleared' | 'consensus_required' | 'snoozed';
  assignedTo: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  outcome: string | null;
}

export interface AuditEvent {
  eventId: string;
  actor: string;
  eventType: string;
  entityType: string;
  entityId: string;
  summary: string;
  before: string | null;
  after: string | null;
  createdAt: string;
}

export interface SystemStatus {
  status: string;
  redisStatus: string;
  moderatorProfile: ModeratorProfile;
  settings: AppSettings;
  recentAudits: AuditEvent[];
}
