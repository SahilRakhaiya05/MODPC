/* eslint-disable @typescript-eslint/no-explicit-any */
import { 
  SystemStatus, AppSettings, ModeratorProfile, TrainingScenario, 
  TrainingAttempt, ConsensusTicket, ResponseTemplate, QueueItem, AuditEvent 
} from '../types';
import type {
  AiChatRequest,
  AiChatResponse,
  ComposerDraftRequest,
  ComposerDraftResponse,
  CrisisRadarResponse,
  CreateHandoffRequest,
  DashboardResponse,
  HandoffResponse,
  LiveInsightResponse,
  SentinelSettingsResponse,
  SessionResponse,
  SubmitAttemptResponse,
  SubredditInstall,
  TestGroqResponse,
  TicketDetailResponse,
  UpdateSentinelSettingsRequest
} from '../../shared/api';

export type LiveModmailThread = {
  id: string;
  subject: string;
  user: string;
  userKarma: number;
  userAge: string;
  userBanned: boolean;
  folder: 'inbox' | 'progress' | 'archived' | 'discussion';
  date: string;
  messages: Array<{
    id: string;
    author: string;
    body: string;
    date: string;
    isInternal: boolean;
  }>;
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => ({ message: response.statusText }))) as { message?: string };
    throw new Error(error.message ?? 'ModDesk OS request failed.');
  }
  return (await response.json()) as T;
}

export const api = {
  async getSession(): Promise<SessionResponse> {
    return await apiFetch<SessionResponse>('/session');
  },

  async getInstalls(): Promise<{ installs: SubredditInstall[] }> {
    return await apiFetch<{ installs: SubredditInstall[] }>('/installs');
  },

  async getStatus(): Promise<SystemStatus> {
    const data = await apiFetch<DashboardResponse>('/dashboard');
    
    // Map theme modes cleanly
    const rawTheme = data.settings.themeMode;
    const themeMode: 'authentic' | 'modern' | 'high-contrast' = 
      rawTheme === 'high_contrast' ? 'high-contrast' : 
      rawTheme === 'modern' ? 'modern' : 'authentic';

    const settings: AppSettings = {
      subredditName: data.settings.subredditName,
      initializedAt: data.settings.initializedAt,
      consensusThresholdMode: data.settings.consensusThresholdMode === 'fixed_count' ? 'fixed' : 'percent',
      consensusFixedCount: data.settings.consensusFixedCount,
      consensusPercent: data.settings.consensusPercent,
      highImpactActions: data.settings.highImpactActions,
      trainingRequiredLevel: data.settings.trainingRequiredLevel,
      themeMode,
      queueScoringConfig: { reportWeight: 1.5, ageWeight: 0.1, keyWeight: 5.0 },
      mobileCompactMode: data.settings.mobileCompactMode,
      anonymousVotesUntilClosed: data.settings.anonymousVotesUntilClosed,
      templateApprovalRequired: data.settings.templateApprovalRequired,
      scenarioDifficultyMix: data.settings.scenarioDifficultyMix,
      workspaceMode: data.settings.workspaceMode,
      liveWritesEnabled: data.settings.liveWritesEnabled,
      liveModeEnabledBy: data.settings.liveModeEnabledBy,
      liveModeEnabledAt: data.settings.liveModeEnabledAt,
      auditRetentionDays: data.settings.auditRetentionDays,
      sentinelModel: data.settings.sentinelModel,
      sentinelTemperature: data.settings.sentinelTemperature,
      sentinelMaxTokens: data.settings.sentinelMaxTokens,
      sentinelRagEnabled: data.settings.sentinelRagEnabled,
      sentinelAllowedTools: data.settings.sentinelAllowedTools,
      sentinelAutomationEnabled: data.settings.sentinelAutomationEnabled,
    };

    const moderatorProfile: ModeratorProfile = {
      username: data.profile.username,
      firstSeenAt: data.profile.firstSeenAt,
      roleLabel: data.profile.roleLabel,
      trainingLevel: data.profile.trainingLevel,
      xp: data.profile.xp,
      totalScenarios: data.profile.totalScenarios,
      correctScenarios: data.profile.correctScenarios,
      queueReviewed: data.profile.queueReviewed,
      consensusVotesCast: data.profile.consensusVotesCast,
      lastActiveAt: data.profile.lastActiveAt,
      streak: data.profile.streak,
      missedConcepts: data.profile.missedConcepts,
    };

    const recentAudits: AuditEvent[] = data.audit.map(a => ({
      eventId: a.eventId,
      actor: a.actor,
      eventType: a.eventType,
      entityType: a.entityType,
      entityId: a.entityId,
      summary: a.summary,
      before: a.before ? (typeof a.before === 'string' ? a.before : JSON.stringify(a.before)) : null,
      after: a.after ? (typeof a.after === 'string' ? a.after : JSON.stringify(a.after)) : null,
      createdAt: a.createdAt,
    }));

    return {
      status: 'online',
      redisStatus: data.context.redisStatus,
      moderatorProfile,
      settings,
      recentAudits,
    };
  },

  async resetDb(): Promise<{ success: boolean; message: string }> {
    await apiFetch<{ status: string }>('/reset', { method: 'POST' });
    return { success: true, message: 'ModDesk configuration reseeded successfully.' };
  },

  async updateSettings(settings: Partial<AppSettings>): Promise<{ success: boolean; settings: AppSettings }> {
    // Translate settings threshold mode from client to server expected format
    const updatePayload: any = { ...settings };
    if (settings.consensusThresholdMode) {
      updatePayload.consensusThresholdMode = 
        settings.consensusThresholdMode === 'fixed' ? 'fixed_count' : 'simple_majority';
    }
    if (settings.themeMode) {
      updatePayload.themeMode = 
        settings.themeMode === 'high-contrast' ? 'high_contrast' : settings.themeMode;
    }

    const updated = await apiFetch<any>('/settings', {
      method: 'POST',
      body: JSON.stringify(updatePayload),
    });

    const mappedSettings: AppSettings = {
      subredditName: updated.subredditName,
      initializedAt: updated.initializedAt,
      consensusThresholdMode: updated.consensusThresholdMode === 'fixed_count' ? 'fixed' : 'percent',
      consensusFixedCount: updated.consensusFixedCount,
      consensusPercent: updated.consensusPercent,
      highImpactActions: updated.highImpactActions,
      trainingRequiredLevel: updated.trainingRequiredLevel,
      themeMode: updated.themeMode === 'high_contrast' ? 'high-contrast' : updated.themeMode,
      queueScoringConfig: { reportWeight: 1.5, ageWeight: 0.1, keyWeight: 5.0 },
      mobileCompactMode: updated.mobileCompactMode,
      anonymousVotesUntilClosed: updated.anonymousVotesUntilClosed,
      templateApprovalRequired: updated.templateApprovalRequired,
      scenarioDifficultyMix: updated.scenarioDifficultyMix,
      workspaceMode: updated.workspaceMode,
      liveWritesEnabled: updated.liveWritesEnabled,
      liveModeEnabledBy: updated.liveModeEnabledBy,
      liveModeEnabledAt: updated.liveModeEnabledAt,
      auditRetentionDays: updated.auditRetentionDays,
      sentinelModel: updated.sentinelModel,
      sentinelTemperature: updated.sentinelTemperature,
      sentinelMaxTokens: updated.sentinelMaxTokens,
      sentinelRagEnabled: updated.sentinelRagEnabled,
      sentinelAllowedTools: updated.sentinelAllowedTools,
      sentinelAutomationEnabled: updated.sentinelAutomationEnabled,
    };

    return { success: true, settings: mappedSettings };
  },

  async getNextScenario(): Promise<{ scenario: TrainingScenario | null }> {
    let data: DashboardResponse;
    try {
      data = await apiFetch<DashboardResponse>('/dashboard');
    } catch (error) {
      if (!import.meta.env.DEV) throw error;
      return {
        scenario: {
          scenarioId: 'preview-safety',
          sourceType: 'comment',
          title: 'Possible self-harm report in an escalating comment chain',
          bodyExcerpt: 'A user says they may not be safe tonight while other commenters argue below them. Treat this as a safety workflow, not a punitive queue clear.',
          authorNameHash: 'u/redacted-preview-7f2',
          reportReasons: ['Self-harm', 'Urgent safety', 'Escalation needed'],
          expectedAction: 'escalate',
          expectedRuleId: 'rule-5',
          difficulty: 'hard',
          explanation: 'Self-harm cases should be escalated to peers and handled through the community safety protocol.',
          tags: ['safety', 'urgent', 'training'],
          source: 'mock',
          status: 'active',
        },
      };
    }
    // Scenarios are already in dashboard. We can find one not attempted, or just return the first active one.
    // In Devvit backend, they are active scenarios. Let's find the first one.
    const scenario = data.scenarios[0] || null;
    const mappedScenario = scenario ? {
      scenarioId: scenario.scenarioId,
      sourceType: scenario.sourceType === 'modmail' ? 'comment' : scenario.sourceType,
      title: scenario.title,
      bodyExcerpt: scenario.bodyExcerpt,
      authorNameHash: scenario.authorNameHash,
      reportReasons: scenario.reportReasons,
      expectedAction: scenario.expectedAction as any,
      expectedRuleId: scenario.expectedRuleId,
      difficulty: scenario.difficulty,
      explanation: scenario.explanation,
      tags: scenario.tags,
      source: scenario.source,
      status: scenario.status,
      ...(scenario.sourceRef ? { sourceRef: scenario.sourceRef } : {}),
    } : null;
    return { 
      scenario: mappedScenario
    };
  },

  async submitAttempt(payload: {
    scenarioId: string;
    chosenAction: string;
    chosenRuleId: string;
    confidence: number;
    latencyMs: number;
  }): Promise<{ success: boolean; attempt: TrainingAttempt; leveledUp: boolean; moderatorProfile: ModeratorProfile }> {
    const dataBefore = await apiFetch<DashboardResponse>('/dashboard');
    const oldLevel = dataBefore.profile.trainingLevel;

    const res = await apiFetch<SubmitAttemptResponse>('/training/attempt', {
      method: 'POST',
      body: JSON.stringify({
        scenarioId: payload.scenarioId,
        chosenAction: payload.chosenAction,
        chosenRuleId: payload.chosenRuleId,
        confidence: payload.confidence,
        latencyMs: payload.latencyMs,
      }),
    });

    const isCorrect = res.attempt.score >= 80;

    const attempt: TrainingAttempt = {
      attemptId: res.attempt.attemptId,
      scenarioId: res.attempt.scenarioId,
      username: res.attempt.username,
      chosenAction: res.attempt.chosenAction,
      chosenRuleId: res.attempt.chosenRuleId,
      confidence: res.attempt.confidence,
      latencyMs: res.attempt.latencyMs,
      score: res.attempt.score,
      xpAwarded: res.attempt.xpAwarded,
      isCorrect,
      feedback: res.attempt.feedback,
      createdAt: res.attempt.createdAt,
    };

    const moderatorProfile: ModeratorProfile = {
      username: res.profile.username,
      firstSeenAt: res.profile.firstSeenAt,
      roleLabel: res.profile.roleLabel,
      trainingLevel: res.profile.trainingLevel,
      xp: res.profile.xp,
      totalScenarios: res.profile.totalScenarios,
      correctScenarios: res.profile.correctScenarios,
      queueReviewed: res.profile.queueReviewed,
      consensusVotesCast: res.profile.consensusVotesCast,
      lastActiveAt: res.profile.lastActiveAt,
      streak: res.profile.streak,
      missedConcepts: res.profile.missedConcepts,
    };

    return {
      success: true,
      attempt,
      leveledUp: res.profile.trainingLevel > oldLevel,
      moderatorProfile,
    };
  },

  async getTickets(): Promise<{ tickets: ConsensusTicket[] }> {
    const data = await apiFetch<DashboardResponse>('/dashboard');
    
    // Server returns flat tickets and votes list under dashboard. Connect them:
    const mapped = data.tickets.map(t => {
      const ticketVotes = data.votes
        .filter(v => v.ticketId === t.ticketId)
        .map(v => ({
          username: v.username,
          vote: v.vote as 'approve' | 'reject' | 'abstain',
          note: v.note,
          createdAt: v.createdAt,
        }));

      return {
        ticketId: t.ticketId,
        actionType: t.actionType,
        targetType: t.targetType,
        targetId: t.targetId,
        targetDisplay: t.targetDisplay,
        proposedBy: t.proposedBy,
        reason: t.reason,
        severity: t.severity,
        evidence: t.evidence.join('\n'), // Adapt array of string to single string for demo front
        thresholdType: t.thresholdType === 'fixed_count' ? 'fixed' : 'percent',
        requiredVotes: t.requiredVotes,
        status: t.status === 'draft' ? 'pending' : (t.status === 'needs_info' ? 'pending' : t.status) as any,
        createdAt: t.createdAt,
        expiresAt: t.expiresAt,
        finalizedAt: t.finalizedAt || null,
        executedAt: t.executedAt || null,
        finalOutcome: t.finalOutcome || null,
        votes: ticketVotes,
        notes: t.notes,
      };
    });

    return { tickets: mapped };
  },

  async createTicket(payload: {
    actionType: string;
    targetType: string;
    targetId: string;
    reason: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    evidence: string;
  }): Promise<{ success: boolean; ticket: ConsensusTicket }> {
    const created = await apiFetch<any>('/consensus/tickets', {
      method: 'POST',
      body: JSON.stringify({
        actionType: payload.actionType,
        targetType: payload.targetType,
        targetId: payload.targetId,
        targetDisplay: `${payload.targetType === 'user' ? 'u/' : ''}${payload.targetId}`,
        reason: payload.reason,
        severity: payload.severity,
        evidence: [payload.evidence],
        notes: '',
      }),
    });

    const ticket: ConsensusTicket = {
      ticketId: created.ticketId,
      actionType: created.actionType,
      targetType: created.targetType,
      targetId: created.targetId,
      targetDisplay: created.targetDisplay,
      proposedBy: created.proposedBy,
      reason: created.reason,
      severity: created.severity,
      evidence: created.evidence.join('\n'),
      thresholdType: created.thresholdType === 'fixed_count' ? 'fixed' : 'percent',
      requiredVotes: created.requiredVotes,
      status: 'pending',
      createdAt: created.createdAt,
      expiresAt: created.expiresAt,
      finalizedAt: null,
      executedAt: null,
      finalOutcome: null,
      votes: [],
    };

    return { success: true, ticket };
  },

  async castVote(payload: {
    ticketId: string;
    vote: 'approve' | 'reject' | 'abstain';
    note: string;
  }): Promise<{ success: boolean; ticket: ConsensusTicket }> {
    const res = await apiFetch<TicketDetailResponse>('/consensus/vote', {
      method: 'POST',
      body: JSON.stringify({
        ticketId: payload.ticketId,
        vote: payload.vote,
        note: payload.note,
      }),
    });

    const ticketVotes = res.votes.map(v => ({
      username: v.username,
      vote: v.vote as 'approve' | 'reject' | 'abstain',
      note: v.note,
      createdAt: v.createdAt,
    }));

    const ticket: ConsensusTicket = {
      ticketId: res.ticket.ticketId,
      actionType: res.ticket.actionType,
      targetType: res.ticket.targetType,
      targetId: res.ticket.targetId,
      targetDisplay: res.ticket.targetDisplay,
      proposedBy: res.ticket.proposedBy,
      reason: res.ticket.reason,
      severity: res.ticket.severity,
      evidence: res.ticket.evidence.join('\n'),
      thresholdType: res.ticket.thresholdType === 'fixed_count' ? 'fixed' : 'percent',
      requiredVotes: res.ticket.requiredVotes,
      status: res.ticket.status as any,
      createdAt: res.ticket.createdAt,
      expiresAt: res.ticket.expiresAt,
      finalizedAt: res.ticket.finalizedAt || null,
      executedAt: res.ticket.executedAt || null,
      finalOutcome: res.ticket.finalOutcome || null,
      votes: ticketVotes,
      notes: res.ticket.notes,
    };

    return { success: true, ticket };
  },

  async executeTicket(ticketId: string, outcome: string): Promise<{ success: boolean; ticket: ConsensusTicket }> {
    const res = await apiFetch<any>('/consensus/executed', {
      method: 'POST',
      body: JSON.stringify({
        ticketId,
        outcome,
      }),
    });

    const ticket: ConsensusTicket = {
      ticketId: res.ticketId,
      actionType: res.actionType,
      targetType: res.targetType,
      targetId: res.targetId,
      targetDisplay: res.targetDisplay,
      proposedBy: res.proposedBy,
      reason: res.reason,
      severity: res.severity,
      evidence: res.evidence.join('\n'),
      thresholdType: res.thresholdType === 'fixed_count' ? 'fixed' : 'percent',
      requiredVotes: res.requiredVotes,
      status: res.status as any,
      createdAt: res.createdAt,
      expiresAt: res.expiresAt,
      finalizedAt: res.finalizedAt || null,
      executedAt: res.executedAt || null,
      finalOutcome: res.finalOutcome || null,
      votes: [],
    };

    return { success: true, ticket };
  },

  async getTemplates(): Promise<{ templates: ResponseTemplate[] }> {
    const data = await apiFetch<DashboardResponse>('/dashboard');
    const templates: ResponseTemplate[] = data.templates.map(t => ({
      templateId: t.templateId,
      title: t.title,
      linkedRuleId: t.linkedRuleId,
      tone: t.tone as any,
      markdown: t.markdown,
      macrosUsed: t.macrosUsed,
      status: t.status === 'draft' ? 'draft' : 'active' as any,
      createdBy: t.createdBy,
      createdAt: t.createdAt,
      updatedBy: t.updatedBy,
      updatedAt: t.updatedAt,
      version: t.version,
    }));
    return { templates };
  },

  async saveTemplate(payload: {
    templateId?: string;
    title: string;
    linkedRuleId: string;
    tone: 'neutral' | 'strict' | 'friendly' | 'educational';
    markdown: string;
  }): Promise<{ success: boolean; templates: ResponseTemplate[] }> {
    await apiFetch<any>('/templates', {
      method: 'POST',
      body: JSON.stringify({
        templateId: payload.templateId,
        title: payload.title,
        linkedRuleId: payload.linkedRuleId,
        tone: payload.tone,
        markdown: payload.markdown,
        status: 'active',
      }),
    });

    // Re-fetch all templates
    const data = await this.getTemplates();
    return {
      success: true,
      templates: data.templates,
    };
  },

  async deleteTemplate(templateId: string): Promise<{ success: boolean; templates: ResponseTemplate[] }> {
    await apiFetch<any>(`/templates/${templateId}/archive`, {
      method: 'POST',
    });
    const data = await this.getTemplates();
    return {
      success: true,
      templates: data.templates,
    };
  },

  async getQueue(): Promise<{ queue: QueueItem[] }> {
    const data = await apiFetch<DashboardResponse>('/dashboard');

    const queue: QueueItem[] = data.queue.map(item => {
      // Calculate report frequency dynamically
      const counts: Record<string, number> = {};
      for (const reason of item.reports) {
        counts[reason] = (counts[reason] || 0) + 1;
      }
      const reports = Object.entries(counts).map(([reason, count]) => ({ reason, count }));

      return {
        itemId: item.itemId,
        itemType: item.itemType === 'thread' ? 'thread' : item.itemType,
        title: item.title,
        bodyExcerpt: item.bodyExcerpt,
        author: item.author,
        reports,
        reportCount: item.reportCount,
        ageSeconds: item.ageSeconds,
        severityScore: item.severityScore,
        severity: item.severity,
        suggestedRuleIds: item.suggestedRuleIds,
        status: item.status === 'consensus_required' ? 'consensus_required' : item.status as any,
        assignedTo: item.assignedTo || null,
        reviewedBy: item.reviewedBy || null,
        reviewedAt: item.reviewedAt || null,
        outcome: item.outcome || null,
      };
    });

    return { queue };
  },

  async queueAction(payload: {
    itemId: string;
    actionType: string;
    notes?: string;
    confirmation?: boolean;
  }): Promise<{ success: boolean; queue: QueueItem[]; moderatorProfile: ModeratorProfile }> {
    await apiFetch<any>('/queue/action', {
      method: 'POST',
      body: JSON.stringify({
        itemId: payload.itemId,
        action: payload.actionType,
        note: payload.notes || '',
        confirmation: payload.confirmation ? 'CONFIRM_LIVE_ACTION' : undefined,
      }),
    });

    const statusData = await this.getStatus();
    const queueData = await this.getQueue();

    return {
      success: true,
      queue: queueData.queue,
      moderatorProfile: statusData.moderatorProfile,
    };
  },

  async getAudits(): Promise<{ audits: AuditEvent[] }> {
    const statusData = await this.getStatus();
    return { audits: statusData.recentAudits };
  },

  async getAutomod(): Promise<{ content: string }> {
    return await apiFetch<{ content: string }>('/wiki/automod');
  },

  async saveAutomod(content: string, reason: string, confirmation?: boolean): Promise<{ success: boolean }> {
    return await apiFetch<{ success: boolean }>('/wiki/automod', {
      method: 'POST',
      body: JSON.stringify({ content, reason, confirmation: confirmation ? 'CONFIRM_LIVE_ACTION' : undefined }),
    });
  },

  async getLiveModlog(): Promise<{ logs: any[] }> {
    return await apiFetch<{ logs: any[] }>('/live/modlog');
  },

  async getLiveRules(): Promise<{ rules: any[] }> {
    return await apiFetch<{ rules: any[] }>('/live/rules');
  },

  async getLiveUsers(type: 'banned' | 'muted' | 'approved' | 'moderators'): Promise<{ users: any[] }> {
    return await apiFetch<{ users: any[] }>(`/live/users?type=${type}`);
  },

  async liveUserAction(payload: {
    type: 'banned' | 'muted' | 'approved';
    username: string;
    action: 'add' | 'remove';
    duration?: number;
    reason?: string;
    note?: string;
    confirmation?: boolean;
  }): Promise<{ success: boolean }> {
    return await apiFetch<{ success: boolean }>('/live/users/action', {
      method: 'POST',
      body: JSON.stringify({ ...payload, confirmation: payload.confirmation ? 'CONFIRM_LIVE_ACTION' : undefined }),
    });
  },

  async getLiveModmail(): Promise<{ conversations: LiveModmailThread[] }> {
    return await apiFetch<{ conversations: LiveModmailThread[] }>('/live/modmail');
  },

  async replyModmail(payload: { threadId: string; body: string; isInternal?: boolean; confirmation?: boolean }): Promise<{ success: boolean; thread?: any }> {
    return await apiFetch<{ success: boolean; thread?: any }>('/live/modmail/reply', {
      method: 'POST',
      body: JSON.stringify({ ...payload, confirmation: payload.confirmation ? 'CONFIRM_LIVE_ACTION' : undefined }),
    });
  },

  async actionModmail(payload: { threadId: string; action: 'archive' | 'unarchive' | 'highlight' | 'delete'; confirmation?: boolean }): Promise<{ success: boolean }> {
    return await apiFetch<{ success: boolean }>('/live/modmail/action', {
      method: 'POST',
      body: JSON.stringify({ ...payload, confirmation: payload.confirmation ? 'CONFIRM_LIVE_ACTION' : undefined }),
    });
  },

  async getLiveFlairs(): Promise<{ postFlairs: any[]; userFlairs: any[] }> {
    return await apiFetch<{ postFlairs: any[]; userFlairs: any[] }>('/live/flairs');
  },

  async saveFlairTemplate(payload: { type: 'post' | 'user'; text: string; backgroundColor: string; textColor: 'light' | 'dark'; modOnly: boolean; flairId?: string }): Promise<{ success: boolean; flairs: any[] }> {
    return await apiFetch<{ success: boolean; flairs: any[] }>('/live/flairs/action', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getLiveInsights(): Promise<LiveInsightResponse> {
    return await apiFetch<LiveInsightResponse>('/live/insights');
  },

  async getLiveEvents(): Promise<{ events: Array<{ id: string; kind: string; createdAt: string; actor?: string | null; target?: string | null; summary: string }> }> {
    return await apiFetch('/live/events');
  },

  async getRadar(): Promise<CrisisRadarResponse> {
    try {
      return await apiFetch<CrisisRadarResponse>('/radar');
    } catch (error) {
      if (!import.meta.env.DEV) throw error;
      return {
        mode: 'training',
        generatedAt: new Date().toISOString(),
        pressureScore: 76,
        queueOpen: 3,
        queueCritical: 1,
        cases: [
          {
            id: 'preview-crisis',
            title: 'Possible self-harm report in a comment chain',
            itemType: 'comment',
            author: 'preview_user',
            excerpt: 'A user wrote that they may not be safe tonight and the thread is escalating.',
            reportCount: 4,
            ageSeconds: 540,
            severity: 'critical',
            severityScore: 96,
            signals: ['safety', 'harassment'],
            suggestedRuleIds: ['rule-5'],
            recommendedAction: 'consensus',
            source: 'training',
          },
        ],
        rulePressure: [{ rule: 'Crisis or Safety Escalation', count: 4, percentage: 80 }],
        recentEvents: [],
        recentAudits: [],
      };
    }
  },

  async draftComposer(payload: ComposerDraftRequest): Promise<ComposerDraftResponse> {
    try {
      return await apiFetch<ComposerDraftResponse>('/composer/draft', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (error) {
      if (!import.meta.env.DEV) throw error;
      return {
        draftId: 'preview-draft',
        riskLevel: payload.actionIntent === 'remove' || payload.actionIntent === 'create_consensus' ? 'high' : 'medium',
        title: `${payload.actionIntent.replace('_', ' ')} / ${payload.targetType}`,
        draft: `Preview draft for ${payload.targetType}: ${payload.context || 'Add evidence before taking action.'}`,
        checklist: ['Confirm rule match.', 'Check reversibility.', 'Escalate high-impact actions to consensus.'],
        matchedTemplates: [],
        removalReasons: [],
        shouldUseConsensus: payload.actionIntent === 'remove' || payload.actionIntent === 'create_consensus',
        sentinelPrompt: `Improve this moderation draft: ${payload.context}`,
      };
    }
  },

  async getHandoff(): Promise<HandoffResponse> {
    try {
      return await apiFetch<HandoffResponse>('/handoff');
    } catch (error) {
      if (!import.meta.env.DEV) throw error;
      return {
        current: {
          pressureScore: 61,
          queueOpen: 3,
          modmailOpen: 2,
          auditCount: 4,
          pendingConsensus: 1,
          nextModItems: ['critical: possible self-harm report', 'high: spam wave in new posts'],
          recentChanges: ['preview_mod: created consensus ticket', 'AutoModerator: removed spam link'],
        },
        records: [],
      };
    }
  },

  async createHandoff(payload: CreateHandoffRequest): Promise<HandoffResponse> {
    try {
      return await apiFetch<HandoffResponse>('/handoff', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (error) {
      if (!import.meta.env.DEV) throw error;
      const createdAt = new Date().toISOString();
      return {
        current: {
          pressureScore: 61,
          queueOpen: 3,
          modmailOpen: 2,
          auditCount: 4,
          pendingConsensus: 1,
          nextModItems: ['critical: possible self-harm report'],
          recentChanges: ['Preview handoff saved locally for UI testing.'],
        },
        records: [{
          handoffId: 'preview-handoff',
          subredditName: 'ProductMods',
          createdBy: 'preview_mod',
          createdAt,
          notes: payload.notes,
          summary: `Preview handoff saved at ${createdAt}. Notes: ${payload.notes}`,
          pressureScore: 61,
          queueOpen: 3,
          modmailOpen: 2,
          pendingConsensus: 1,
          nextModItems: ['critical: possible self-harm report'],
          recentChanges: ['Preview handoff saved locally for UI testing.'],
        }],
      };
    }
  },

  async askAi(payload: AiChatRequest): Promise<AiChatResponse> {
    try {
      return await apiFetch<AiChatResponse>('/ai/chat', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (requestError) {
      if (!import.meta.env.DEV) throw requestError;
      return {
        reply:
          [
            'Sentinel AI could not reach the server-side Groq service.',
            '',
            'Cause:',
            'The Devvit server API is unavailable in local Vite preview, so no Groq request was made.',
            '',
            'Recovery action:',
            'Run the Devvit playtest server, verify devvit.json allows api.groq.com, save a Groq API key in Settings, then use Test Groq Connection.',
          ].join('\n'),
        model: 'Groq unavailable in preview',
        status: 'error',
        promptPreview: payload.prompt,
        reasoningSummary: 'No AI answer was generated because the server-side Groq service was unreachable.',
        recommendedAction: 'Start Devvit server and test Groq connection.',
        riskLevel: 'medium',
        relatedPolicy: 'Sentinel Groq configuration',
        confidence: 'low',
        nextSuggestedAction: 'Fix Groq service access before using Sentinel.',
        modeLabel: 'demo-only',
        suggestedTasks: [],
        errorReason: 'Devvit server was unavailable in local Vite preview; Groq was not called.',
        modelStatus: {
          status: 'error',
          provider: 'none',
          model: 'server-side Groq',
          lastError: 'Devvit server was unavailable in local Vite preview.',
        },
        sources: [
          {
            id: 'preview:queue',
            title: 'Preview queue and rules',
            type: 'playbook',
            excerpt: 'Local preview uses seeded queue, rules, templates, and audit data when the Devvit server is not running.',
            score: 1,
          },
        ],
      };
    }
  },

  async getSentinelSettings(): Promise<SentinelSettingsResponse> {
    return await apiFetch<SentinelSettingsResponse>('/ai/settings');
  },

  async updateSentinelSettings(payload: UpdateSentinelSettingsRequest): Promise<SentinelSettingsResponse> {
    return await apiFetch<SentinelSettingsResponse>('/ai/settings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async testGroqConnection(): Promise<TestGroqResponse> {
    return await apiFetch<TestGroqResponse>('/ai/test', { method: 'POST' });
  },

  async rebuildSentinelRag(): Promise<{ ok: boolean; rebuiltAt: string; count: number }> {
    return await apiFetch<{ ok: boolean; rebuiltAt: string; count: number }>('/ai/rag/rebuild', { method: 'POST' });
  },

  async getRemovalReasons(): Promise<{ reasons: Array<{ id: string; title: string; message: string }> }> {
    return await apiFetch('/live/removal-reasons');
  },

  async lookupUser(username: string): Promise<{
    user: null | { username: string; id: string; createdAt: string; linkKarma: number; commentKarma: number; isAdmin: boolean; nsfw: boolean; hasVerifiedEmail: boolean; permalink: string };
    status?: string;
  }> {
    return await apiFetch(`/live/user/${encodeURIComponent(username)}`);
  },
};
