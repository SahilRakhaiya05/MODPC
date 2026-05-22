import './index.css';

/* eslint-disable react-hooks/set-state-in-effect, react-refresh/only-export-components */

import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  AppSettings,
  ConsensusTicket,
  ConsensusVote,
  DashboardResponse,
  QueueActionRequest,
  QueueItem,
  ResponseTemplate,
  SaveTemplateRequest,
  Severity,
  SubmitAttemptRequest,
  TicketStatus,
  TrainingAction,
  VoteChoice,
} from '../shared/api';
import { RULES } from '../shared/api';

type ModuleId = 'dashboard' | 'academy' | 'consensus' | 'typewriter' | 'queue' | 'settings';
type Toast = { id: string; message: string; tone: 'info' | 'success' | 'warning' | 'danger' };
type ConfirmState = { title: string; body: string; action: () => Promise<void> } | null;

const moduleLabels: Record<ModuleId, string> = {
  dashboard: 'Desktop',
  academy: 'ModAcademy',
  consensus: 'Consensus',
  typewriter: 'Typewriter',
  queue: 'Live Queue',
  settings: 'Control Panel',
};

const moduleIcons: Record<ModuleId, string> = {
  dashboard: '▣',
  academy: '▤',
  consensus: '◆',
  typewriter: '⌨',
  queue: '▥',
  settings: '⚙',
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

function pct(part: number, whole: number): number {
  return Math.round((part / Math.max(1, whole)) * 100);
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function xpForNext(level: number): number {
  return Math.floor(100 * Math.pow(level + 1, 1.5));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderMarkdown(markdown: string): string {
  const escaped = escapeHtml(markdown);
  const lines = escaped.split('\n');
  let inList = false;
  let html = '';
  for (const line of lines) {
    const withInline = line
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
    if (/^- /.test(withInline)) {
      if (!inList) html += '<ul>';
      inList = true;
      html += `<li>${withInline.replace(/^- /, '')}</li>`;
    } else {
      if (inList) html += '</ul>';
      inList = false;
      html += withInline.trim() ? `<p>${withInline}</p>` : '<br />';
    }
  }
  if (inList) html += '</ul>';
  return html;
}

function makePreviewDashboard(): DashboardResponse {
  const createdAt = new Date().toISOString();
  const settings: AppSettings = {
    subredditName: 'testsubreddit',
    initializedAt: createdAt,
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
  };
  const tickets: ConsensusTicket[] = [
    {
      ticketId: 'preview-ticket',
      actionType: 'Permanent ban',
      targetType: 'user',
      targetId: 'u_preview',
      targetDisplay: 'u/SpamWave',
      proposedBy: 'PreviewMod',
      reason: 'Repeated spam after warnings.',
      severity: 'high',
      evidence: ['t3_preview_link', 'Three removals in seven days'],
      thresholdType: 'fixed_count',
      requiredVotes: 3,
      status: 'pending',
      createdAt,
      expiresAt: createdAt,
      notes: 'Preview-only case file.',
    },
  ];
  return {
    context: { username: 'PreviewMod', subredditName: 'testsubreddit', isModerator: true, redisStatus: 'ok' },
    settings,
    profile: {
      username: 'PreviewMod',
      firstSeenAt: createdAt,
      roleLabel: 'Queue Cadet',
      trainingLevel: 3,
      xp: 420,
      totalScenarios: 9,
      correctScenarios: 7,
      queueReviewed: 14,
      consensusVotesCast: 3,
      streak: 4,
      lastActiveAt: createdAt,
      missedConcepts: ['Crisis or Safety Escalation'],
    },
    summary: { pendingVotes: 1, trainingLevel: 3, queueCritical: 1, templatesCount: 2, teamCoverage: 48 },
    scenarios: [
      {
        scenarioId: 'preview-scenario',
        sourceType: 'comment',
        title: 'Possible self-harm report in a comment chain',
        bodyExcerpt: 'A user writes that they might not stay safe tonight while others argue below.',
        authorNameHash: 'u/demo-safe',
        reportReasons: ['Self-harm', 'Urgent safety'],
        expectedAction: 'escalate',
        expectedRuleId: 'rule-5',
        difficulty: 'hard',
        explanation: 'Urgent safety reports should be escalated and handled with care.',
        tags: ['safety'],
        createdBy: 'system',
        createdAt,
        status: 'active',
      },
    ],
    tickets,
    votes: [{ ticketId: 'preview-ticket', username: 'PreviewMod', vote: 'approve', note: 'Pattern is clear.', createdAt, updatedAt: createdAt }],
    templates: [
      {
        templateId: 'preview-template',
        title: 'Rule 1 civility removal',
        linkedRuleId: 'rule-1',
        tone: 'neutral',
        markdown: 'Hi {username}, your {post_title} was removed under **Rule 1: Civility**.\n\nPlease contact {modmail_link} for appeals.',
        macrosUsed: ['{username}', '{post_title}', '{modmail_link}'],
        status: 'active',
        createdBy: 'PreviewMod',
        createdAt,
        updatedBy: 'PreviewMod',
        updatedAt: createdAt,
        version: 1,
      },
    ],
    queue: [
      {
        itemId: 'preview-queue',
        itemType: 'comment',
        title: 'Reported comment: possible self-harm',
        bodyExcerpt: 'I do not think I can stay safe tonight.',
        author: 'u/ThrowawayCare',
        reports: ['Self-harm', 'Urgent'],
        reportCount: 2,
        ageSeconds: 600,
        severityScore: 92,
        severity: 'critical',
        suggestedRuleIds: ['rule-5'],
        status: 'new',
      },
    ],
    audit: [
      {
        eventId: 'preview-audit',
        actor: 'PreviewMod',
        eventType: 'ticket.created',
        entityType: 'consensus_ticket',
        entityId: 'preview-ticket',
        summary: 'Consensus gate active for Permanent ban on u/SpamWave.',
        createdAt,
      },
    ],
  };
}

function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`severity severity-${severity}`}>{severity.toUpperCase()}</span>;
}

function StatusStamp({ status }: { status: TicketStatus | QueueItem['status'] | ResponseTemplate['status'] }) {
  return <span className={`stamp stamp-${status}`}>{status.replaceAll('_', ' ').toUpperCase()}</span>;
}

function ProgressMeter({ value, label }: { value: number; label: string }) {
  const chunks = Array.from({ length: 10 }, (_, index) => index < Math.round(value / 10));
  return (
    <div className="meter" aria-label={`${label}: ${value}%`}>
      <div className="meter-label">
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <div className="meter-track">
        {chunks.map((active, index) => (
          <span className={active ? 'meter-chunk active' : 'meter-chunk'} key={`${label}-${index}`} />
        ))}
      </div>
    </div>
  );
}

function RetroWindow({
  title,
  icon,
  children,
  footer,
  severity,
  className = '',
}: {
  title: string;
  icon: string;
  children: ReactNode;
  footer?: string | undefined;
  severity?: Severity | undefined;
  className?: string | undefined;
}) {
  return (
    <section className={`retro-window ${severity ? `stripe-${severity}` : ''} ${className}`}>
      <header className="window-title">
        <span>
          <b>{icon}</b> {title}
        </span>
        <span className="window-buttons" aria-hidden="true">
          <i>_</i>
          <i>□</i>
          <i>×</i>
        </span>
      </header>
      <div className="window-body">{children}</div>
      {footer ? <footer className="window-footer">{footer}</footer> : null}
    </section>
  );
}

function BootScreen({ onSkip }: { onSkip: () => void }) {
  return (
    <div className="boot-screen">
      <div className="boot-box">
        <div className="boot-logo">ModDesk OS v2.0</div>
        <p>Subreddit Operations Desk</p>
        <div className="boot-progress">
          <span />
        </div>
        <ul>
          <li>Redis OK</li>
          <li>Rules OK</li>
          <li>Queue OK</li>
          <li>Consensus gate active</li>
        </ul>
        <button className="retro-button primary" onClick={onSkip}>
          Enter Desk
        </button>
      </div>
    </div>
  );
}

function SystemToast({ toast, onClose }: { toast: Toast; onClose: (id: string) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onClose(toast.id), 3200);
    return () => window.clearTimeout(timer);
  }, [onClose, toast.id]);
  return (
    <div className={`system-toast toast-${toast.tone}`}>
      <b>ModDesk Notice</b>
      <span>{toast.message}</span>
      <button onClick={() => onClose(toast.id)}>OK</button>
    </div>
  );
}

function ConfirmDialog({ confirm, onCancel }: { confirm: ConfirmState; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  if (!confirm) return null;
  return (
    <div className="dialog-backdrop">
      <div className="confirm-dialog">
        <header>Confirm High-Impact Action</header>
        <h2>{confirm.title}</h2>
        <p>{confirm.body}</p>
        <div className="dialog-actions">
          <button className="retro-button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="retro-button danger"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void confirm.action().finally(() => {
                setBusy(false);
                onCancel();
              });
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function DesktopIcon({ module, active, onOpen }: { module: ModuleId; active: boolean; onOpen: (module: ModuleId) => void }) {
  return (
    <button className={active ? 'desktop-icon active' : 'desktop-icon'} onClick={() => onOpen(module)}>
      <span>{moduleIcons[module]}</span>
      <b>{moduleLabels[module]}</b>
    </button>
  );
}

function AuditTicker({ data }: { data: DashboardResponse }) {
  const events = data.audit.slice(0, 7);
  return (
    <div className="audit-ticker">
      {events.length === 0 ? <p>No audit events yet. The desk is quiet.</p> : null}
      {events.map((event) => (
        <p key={event.eventId}>
          <time>{formatTime(event.createdAt)}</time> {event.summary}
        </p>
      ))}
    </div>
  );
}

function DashboardModule({ data, open }: { data: DashboardResponse; open: (module: ModuleId) => void }) {
  const accuracy = pct(data.profile.correctScenarios, data.profile.totalScenarios);
  return (
    <div className="dashboard-grid">
      <RetroWindow title="Command Summary" icon="▣" footer="Private moderator-only workspace">
        <div className="summary-grid">
          <button onClick={() => open('consensus')}>
            <strong>{data.summary.pendingVotes}</strong>
            <span>Pending votes</span>
          </button>
          <button onClick={() => open('academy')}>
            <strong>Lvl {data.profile.trainingLevel}</strong>
            <span>{data.profile.roleLabel}</span>
          </button>
          <button onClick={() => open('queue')}>
            <strong>{data.summary.queueCritical}</strong>
            <span>Critical queue</span>
          </button>
          <button onClick={() => open('typewriter')}>
            <strong>{data.summary.templatesCount}</strong>
            <span>Templates</span>
          </button>
        </div>
        <ProgressMeter value={Math.min(100, pct(data.profile.xp, xpForNext(data.profile.trainingLevel)))} label="XP Drive" />
        <ProgressMeter value={data.summary.teamCoverage} label="Queue Coverage" />
      </RetroWindow>
      <RetroWindow title="ModAcademy Mini" icon="▤" footer="Rewarding accuracy, consistency, and care">
        <h3>{data.profile.roleLabel}</h3>
        <p className="muted">
          {data.profile.totalScenarios} scenarios completed, {accuracy}% accuracy, streak {data.profile.streak}.
        </p>
        <button className="retro-button primary" onClick={() => open('academy')}>
          Start Training Shift
        </button>
      </RetroWindow>
      <RetroWindow title="Governance Desk" icon="◆" footer="Consensus before dangerous actions">
        {data.tickets.slice(0, 3).map((ticket) => (
          <div className="mini-row" key={ticket.ticketId}>
            <SeverityBadge severity={ticket.severity} />
            <span>{ticket.actionType}</span>
            <StatusStamp status={ticket.status} />
          </div>
        ))}
      </RetroWindow>
      <RetroWindow title="Audit Log Ticker" icon="▦" footer="Every meaningful action leaves a record">
        <AuditTicker data={data} />
      </RetroWindow>
    </div>
  );
}

function AcademyModule({
  data,
  refresh,
  toast,
}: {
  data: DashboardResponse;
  refresh: () => Promise<void>;
  toast: (message: string, tone?: Toast['tone']) => void;
}) {
  const [scenarioId, setScenarioId] = useState(data.scenarios[0]?.scenarioId ?? '');
  const [action, setAction] = useState<TrainingAction>('approve');
  const [ruleId, setRuleId] = useState('rule-1');
  const [confidence, setConfidence] = useState(70);
  const startedAt = useRef(0);
  const scenario = data.scenarios.find((item) => item.scenarioId === scenarioId) ?? data.scenarios[0];

  useEffect(() => {
    startedAt.current = Date.now();
  }, [scenarioId]);

  if (!scenario) return <RetroWindow title="ModAcademy" icon="▤">No scenarios seeded.</RetroWindow>;

  const submit = async () => {
    const body: SubmitAttemptRequest = {
      scenarioId: scenario.scenarioId,
      chosenAction: action,
      chosenRuleId: ruleId,
      confidence,
      latencyMs: Date.now() - startedAt.current,
    };
    const result = await apiFetch('/training/attempt', { method: 'POST', body: JSON.stringify(body) });
    const typed = result as { attempt: { score: number; xpAwarded: number; feedback: string } };
    toast(`Training scenario complete. Score ${typed.attempt.score}/100, +${typed.attempt.xpAwarded} XP.`, 'success');
    await refresh();
  };

  return (
    <div className="module-grid academy-grid">
      <RetroWindow title="Training Disk" icon="▤" footer="Simulator mode: no live enforcement">
        <div className="profile-strip">
          <b>{data.profile.roleLabel}</b>
          <span>Level {data.profile.trainingLevel}</span>
          <span>{data.profile.xp} XP</span>
          <span>Streak {data.profile.streak}</span>
        </div>
        <ProgressMeter value={Math.min(100, pct(data.profile.xp, xpForNext(data.profile.trainingLevel)))} label="Next Rank" />
        <label className="field">
          Scenario
          <select value={scenario.scenarioId} onChange={(event) => setScenarioId(event.target.value)}>
            {data.scenarios.map((item) => (
              <option value={item.scenarioId} key={item.scenarioId}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <div className="missed">
          <b>Concepts to revisit</b>
          <span>{data.profile.missedConcepts.length ? data.profile.missedConcepts.join(', ') : 'No misses logged yet.'}</span>
        </div>
      </RetroWindow>
      <RetroWindow title="Scenario Case File" icon="◇" severity={scenario.difficulty === 'hard' ? 'high' : 'medium'}>
        <div className="case-file">
          <SeverityBadge severity={scenario.difficulty === 'hard' ? 'high' : scenario.difficulty === 'medium' ? 'medium' : 'low'} />
          <h2>{scenario.title}</h2>
          <p>{scenario.bodyExcerpt}</p>
          <div className="report-list">
            {scenario.reportReasons.map((reason) => (
              <span key={reason}>{reason}</span>
            ))}
          </div>
        </div>
        <div className="button-row decision-row">
          {(['approve', 'remove', 'filter', 'escalate', 'skip'] satisfies TrainingAction[]).map((item) => (
            <button className={action === item ? 'retro-button primary' : 'retro-button'} key={item} onClick={() => setAction(item)}>
              {item}
            </button>
          ))}
        </div>
        <label className="field">
          Rule / Template
          <select value={ruleId} onChange={(event) => setRuleId(event.target.value)}>
            {RULES.map((rule) => (
              <option value={rule.id} key={rule.id}>
                {rule.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Confidence: {confidence}%
          <input type="range" min="20" max="100" value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} />
        </label>
        <button className="retro-button primary wide" onClick={submit}>
          Submit Decision
        </button>
      </RetroWindow>
      <RetroWindow title="Training History" icon="▧">
        <p className="muted">{data.profile.totalScenarios} total attempts. Careful escalation is rewarded for edge cases.</p>
        <p>{scenario.explanation}</p>
      </RetroWindow>
    </div>
  );
}

function voteCount(votes: ConsensusVote[], ticket: ConsensusTicket, vote: VoteChoice): number {
  return votes.filter((item) => item.ticketId === ticket.ticketId && item.vote === vote).length;
}

function ConsensusModule({
  data,
  refresh,
  toast,
  confirm,
}: {
  data: DashboardResponse;
  refresh: () => Promise<void>;
  toast: (message: string, tone?: Toast['tone']) => void;
  confirm: (state: ConfirmState) => void;
}) {
  const [activeId, setActiveId] = useState(data.tickets[0]?.ticketId ?? '');
  const [voteNote, setVoteNote] = useState('');
  const [draft, setDraft] = useState({
    actionType: 'Permanent ban',
    targetType: 'user',
    targetId: '',
    targetDisplay: '',
    reason: '',
    severity: 'high' as Severity,
    evidence: '',
    notes: '',
  });
  const ticket = data.tickets.find((item) => item.ticketId === activeId) ?? data.tickets[0];

  const castVote = async (choice: VoteChoice) => {
    if (!ticket) return;
    await apiFetch('/consensus/vote', {
      method: 'POST',
      body: JSON.stringify({ ticketId: ticket.ticketId, vote: choice, note: voteNote }),
    });
    toast(choice === 'approve' ? 'Vote recorded. Consensus gate updated.' : 'Vote recorded.', 'success');
    await refresh();
  };

  const createTicket = async () => {
    await apiFetch('/consensus/tickets', {
      method: 'POST',
      body: JSON.stringify({
        ...draft,
        evidence: draft.evidence.split('\n').map((item) => item.trim()).filter(Boolean),
      }),
    });
    toast('Consensus gate active for new ticket.', 'success');
    setDraft({ ...draft, targetId: '', targetDisplay: '', reason: '', evidence: '', notes: '' });
    await refresh();
  };

  const execute = () => {
    if (!ticket) return;
    confirm({
      title: `Mark ${ticket.actionType} as executed`,
      body:
        'This does not run a live Reddit enforcement action. It records that a moderator manually completed the approved outcome. Confirm only if the consensus result is correct.',
      action: async () => {
        await apiFetch('/consensus/executed', {
          method: 'POST',
          body: JSON.stringify({ ticketId: ticket.ticketId, outcome: 'Manual execution confirmed.' }),
        });
        toast('Approved ticket marked as manually executed.', 'success');
        await refresh();
      },
    });
  };

  return (
    <div className="module-grid consensus-grid">
      <RetroWindow title="Ticket Spool" icon="◆" footer="One vote per moderator; updates are allowed before finalization">
        {data.tickets.map((item) => (
          <button className={item.ticketId === ticket?.ticketId ? 'ticket-row active' : 'ticket-row'} key={item.ticketId} onClick={() => setActiveId(item.ticketId)}>
            <SeverityBadge severity={item.severity} />
            <span>{item.actionType}</span>
            <small>{item.targetDisplay}</small>
            <StatusStamp status={item.status} />
          </button>
        ))}
      </RetroWindow>
      <RetroWindow title="Case File" icon="▨" severity={ticket?.severity}>
        {ticket ? (
          <>
            <div className="case-heading">
              <div>
                <h2>{ticket.actionType}</h2>
                <p>{ticket.targetDisplay}</p>
              </div>
              <StatusStamp status={ticket.status} />
            </div>
            <p>{ticket.reason}</p>
            <ProgressMeter value={pct(voteCount(data.votes, ticket, 'approve'), ticket.requiredVotes)} label={`${voteCount(data.votes, ticket, 'approve')}/${ticket.requiredVotes} Required`} />
            <div className="vote-counters">
              <span>Approve {voteCount(data.votes, ticket, 'approve')}</span>
              <span>Reject {voteCount(data.votes, ticket, 'reject')}</span>
              <span>More info {voteCount(data.votes, ticket, 'abstain')}</span>
            </div>
            <textarea className="note-box" placeholder="Vote note" value={voteNote} onChange={(event) => setVoteNote(event.target.value)} />
            <div className="button-row">
              <button className="retro-button primary" onClick={() => castVote('approve')}>
                Approve
              </button>
              <button className="retro-button" onClick={() => castVote('abstain')}>
                More Info
              </button>
              <button className="retro-button danger" onClick={() => castVote('reject')}>
                Reject
              </button>
            </div>
            {ticket.status === 'approved' ? (
              <button className="retro-button danger wide" onClick={execute}>
                Manual Execution Confirmation
              </button>
            ) : null}
          </>
        ) : (
          <p>No tickets pending. The desk is quiet.</p>
        )}
      </RetroWindow>
      <RetroWindow title="Evidence / New Ticket" icon="▧">
        {ticket ? (
          <div className="evidence-panel">
            {ticket.evidence.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        ) : null}
        <div className="ticket-form">
          <label className="field">
            Action
            <select value={draft.actionType} onChange={(event) => setDraft({ ...draft, actionType: event.target.value })}>
              <option>Permanent ban</option>
              <option>Long mute</option>
              <option>Thread lock</option>
              <option>Sticky announcement</option>
              <option>Queue escalation</option>
            </select>
          </label>
          <label className="field">
            Target
            <input value={draft.targetDisplay} onChange={(event) => setDraft({ ...draft, targetDisplay: event.target.value, targetId: event.target.value })} placeholder="u/example or t3_id" />
          </label>
          <label className="field">
            Reason
            <textarea value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} />
          </label>
          <label className="field">
            Evidence
            <textarea value={draft.evidence} onChange={(event) => setDraft({ ...draft, evidence: event.target.value })} placeholder="One link or note per line" />
          </label>
          <button className="retro-button primary wide" onClick={createTicket}>
            Create Ticket
          </button>
        </div>
      </RetroWindow>
    </div>
  );
}

function TypewriterModule({
  data,
  refresh,
  toast,
}: {
  data: DashboardResponse;
  refresh: () => Promise<void>;
  toast: (message: string, tone?: Toast['tone']) => void;
}) {
  const first = data.templates[0];
  const [activeId, setActiveId] = useState(first?.templateId ?? '');
  const active = data.templates.find((item) => item.templateId === activeId) ?? first;
  const draftFromTemplate = (template: ResponseTemplate | undefined): SaveTemplateRequest => {
    const base: SaveTemplateRequest = {
      title: template?.title ?? 'New response',
      linkedRuleId: template?.linkedRuleId ?? 'rule-1',
      tone: template?.tone ?? 'neutral',
      markdown: template?.markdown ?? '',
      status: template?.status ?? 'draft',
    };
    return template ? { ...base, templateId: template.templateId } : base;
  };
  const [draft, setDraft] = useState<SaveTemplateRequest>(draftFromTemplate(active));

  useEffect(() => {
    setDraft(draftFromTemplate(active));
  }, [active]);

  const insert = (value: string) => setDraft((current) => ({ ...current, markdown: `${current.markdown}${value}` }));
  const save = async () => {
    const saved = await apiFetch<ResponseTemplate>('/templates', { method: 'POST', body: JSON.stringify(draft) });
    setActiveId(saved.templateId);
    toast('Template saved to Response Disk.', 'success');
    await refresh();
  };
  const archive = async () => {
    if (!draft.templateId) return;
    await apiFetch(`/templates/${draft.templateId}/archive`, { method: 'POST' });
    toast('Template archived.', 'warning');
    await refresh();
  };

  return (
    <div className="module-grid typewriter-grid">
      <RetroWindow title="Template Cabinet" icon="▥">
        <button
          className="retro-button primary wide"
          onClick={() => {
            setActiveId('');
            setDraft({ title: 'New response', linkedRuleId: 'rule-1', tone: 'neutral', markdown: '', status: 'draft' });
          }}
        >
          New Template
        </button>
        {data.templates.map((template) => (
          <button className={template.templateId === activeId ? 'template-row active' : 'template-row'} key={template.templateId} onClick={() => setActiveId(template.templateId)}>
            <span>{template.title}</span>
            <StatusStamp status={template.status} />
          </button>
        ))}
      </RetroWindow>
      <RetroWindow title="Typewriter Canned Response Editor" icon="⌨" footer="Large mobile-safe markdown controls">
        <div className="editor-meta">
          <label className="field">
            Title
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </label>
          <label className="field">
            Rule
            <select value={draft.linkedRuleId} onChange={(event) => setDraft({ ...draft, linkedRuleId: event.target.value })}>
              {RULES.map((rule) => (
                <option value={rule.id} key={rule.id}>
                  {rule.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Tone
            <select value={draft.tone} onChange={(event) => setDraft({ ...draft, tone: event.target.value as SaveTemplateRequest['tone'] })}>
              <option value="neutral">neutral</option>
              <option value="strict">strict</option>
              <option value="friendly">friendly</option>
              <option value="educational">educational</option>
            </select>
          </label>
        </div>
        <div className="macro-row">
          {([
            ['B', '**bold**'],
            ['I', '*italic*'],
            ['List', '\n- item'],
            ['1.', '\n1. item'],
            ['"', '\n> quote'],
            ['Link', '[text](https://reddit.com)'],
            ['User', '{username}'],
            ['Sub', '{subreddit}'],
            ['Rule', '{rule_link}'],
            ['Appeal', '{appeal_instructions}'],
            ['Mail', '{modmail_link}'],
            ['Title', '{post_title}'],
          ] as const).map(([label, value]) => (
            <button className="macro-button" key={label} onClick={() => insert(value)}>
              {label}
            </button>
          ))}
        </div>
        <textarea className="markdown-editor" value={draft.markdown} onChange={(event) => setDraft({ ...draft, markdown: event.target.value })} />
        <div className="button-row pinned-actions">
          <button className="retro-button primary" onClick={save}>
            Save
          </button>
          <button className="retro-button" onClick={archive} disabled={!draft.templateId}>
            Archive
          </button>
        </div>
      </RetroWindow>
      <RetroWindow title="Rendered Output Preview" icon="▣">
        <div className="preview-pane" dangerouslySetInnerHTML={{ __html: renderMarkdown(draft.markdown) }} />
      </RetroWindow>
    </div>
  );
}

function QueueModule({
  data,
  refresh,
  toast,
}: {
  data: DashboardResponse;
  refresh: () => Promise<void>;
  toast: (message: string, tone?: Toast['tone']) => void;
}) {
  const [activeId, setActiveId] = useState(data.queue[0]?.itemId ?? '');
  const [note, setNote] = useState('');
  const active = data.queue.find((item) => item.itemId === activeId) ?? data.queue[0];
  const act = async (action: QueueActionRequest['action']) => {
    if (!active) return;
    await apiFetch('/queue/action', { method: 'POST', body: JSON.stringify({ itemId: active.itemId, action, note }) });
    toast(action === 'escalate' ? 'Queue packet escalated to Governance Desk.' : 'Queue item reviewed.', 'success');
    await refresh();
  };
  return (
    <div className="module-grid queue-grid">
      <RetroWindow title="Priority Queue" icon="▥" footer="Sorted by severity by default">
        {data.queue.map((item) => (
          <button className={item.itemId === active?.itemId ? 'queue-row active' : 'queue-row'} key={item.itemId} onClick={() => setActiveId(item.itemId)}>
            <SeverityBadge severity={item.severity} />
            <span>{item.title}</span>
            <small>{item.severityScore} pts</small>
            <StatusStamp status={item.status} />
          </button>
        ))}
      </RetroWindow>
      <RetroWindow title="Queue Packet Preview" icon="▧" severity={active?.severity}>
        {active ? (
          <>
            <div className="case-heading">
              <div>
                <h2>{active.title}</h2>
                <p>{active.author} · {Math.round(active.ageSeconds / 60)} min old</p>
              </div>
              <SeverityBadge severity={active.severity} />
            </div>
            <p>{active.bodyExcerpt}</p>
            <div className="report-list">
              {active.reports.map((report) => (
                <span key={report}>{report}</span>
              ))}
            </div>
            <div className="rule-strip">
              {active.suggestedRuleIds.map((rule) => (
                <span key={rule}>{rule}</span>
              ))}
            </div>
            <textarea className="note-box" placeholder="Moderator note" value={note} onChange={(event) => setNote(event.target.value)} />
            <div className="button-row">
              <button className="retro-button primary" onClick={() => act('approve')}>
                Sim Approve
              </button>
              <button className="retro-button" onClick={() => act('reviewed')}>
                Mark Reviewed
              </button>
              <button className="retro-button danger" onClick={() => act('remove')}>
                Sim Remove
              </button>
              <button className="retro-button" onClick={() => act('escalate')}>
                Escalate
              </button>
            </div>
          </>
        ) : (
          <p>No queue packets loaded.</p>
        )}
      </RetroWindow>
      <RetroWindow title="Team Performance Strip" icon="▦">
        <ProgressMeter value={data.summary.teamCoverage} label="Coverage" />
        <div className="stats-strip">
          <span>Reviewed {data.profile.queueReviewed}</span>
          <span>Votes {data.profile.consensusVotesCast}</span>
          <span>Training {pct(data.profile.correctScenarios, data.profile.totalScenarios)}%</span>
        </div>
        <p className="muted">Score rewards reviewed items, appropriate escalation, and consistency. It does not reward bans or removals as volume.</p>
      </RetroWindow>
    </div>
  );
}

function SettingsModule({
  data,
  refresh,
  toast,
}: {
  data: DashboardResponse;
  refresh: () => Promise<void>;
  toast: (message: string, tone?: Toast['tone']) => void;
}) {
  const [settings, setSettings] = useState<AppSettings>(data.settings);
  useEffect(() => setSettings(data.settings), [data.settings]);
  const save = async () => {
    await apiFetch<AppSettings>('/settings', { method: 'POST', body: JSON.stringify(settings) });
    toast('Control Panel settings updated.', 'success');
    await refresh();
  };
  const reset = async () => {
    await apiFetch('/reset', { method: 'POST' });
    toast('Demo data reset for test install.', 'warning');
    await refresh();
  };
  const toggleImpact = (action: string) => {
    const highImpactActions = settings.highImpactActions.includes(action)
      ? settings.highImpactActions.filter((item) => item !== action)
      : [...settings.highImpactActions, action];
    setSettings({ ...settings, highImpactActions });
  };
  return (
    <div className="module-grid settings-grid">
      <RetroWindow title="General" icon="⚙">
        <label className="field">
          Community
          <input value={settings.subredditName} disabled />
        </label>
        <label className="field">
          Theme intensity
          <select value={settings.themeMode} onChange={(event) => setSettings({ ...settings, themeMode: event.target.value as AppSettings['themeMode'] })}>
            <option value="authentic">authentic retro</option>
            <option value="modern">modern-retro</option>
            <option value="high_contrast">high-contrast</option>
          </select>
        </label>
        <label className="check-row">
          <input type="checkbox" checked={settings.mobileCompactMode} onChange={(event) => setSettings({ ...settings, mobileCompactMode: event.target.checked })} />
          Mobile compact mode
        </label>
      </RetroWindow>
      <RetroWindow title="Consensus" icon="◆">
        <label className="field">
          Threshold mode
          <select value={settings.consensusThresholdMode} onChange={(event) => setSettings({ ...settings, consensusThresholdMode: event.target.value as AppSettings['consensusThresholdMode'] })}>
            <option value="simple_majority">simple majority</option>
            <option value="fixed_count">fixed count</option>
            <option value="two_thirds">two-thirds</option>
          </select>
        </label>
        <label className="field">
          Fixed count: {settings.consensusFixedCount}
          <input type="range" min="1" max="9" value={settings.consensusFixedCount} onChange={(event) => setSettings({ ...settings, consensusFixedCount: Number(event.target.value) })} />
        </label>
        {['Permanent ban', 'Long mute', 'Thread lock', 'Sticky announcement', 'Mass removal'].map((action) => (
          <label className="check-row" key={action}>
            <input type="checkbox" checked={settings.highImpactActions.includes(action)} onChange={() => toggleImpact(action)} />
            {action}
          </label>
        ))}
      </RetroWindow>
      <RetroWindow title="Training / Templates" icon="▤">
        <label className="field">
          Training level required: {settings.trainingRequiredLevel}
          <input type="range" min="1" max="8" value={settings.trainingRequiredLevel} onChange={(event) => setSettings({ ...settings, trainingRequiredLevel: Number(event.target.value) })} />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={settings.anonymousVotesUntilClosed} onChange={(event) => setSettings({ ...settings, anonymousVotesUntilClosed: event.target.checked })} />
          Anonymous votes until closed
        </label>
        <label className="check-row">
          <input type="checkbox" checked={settings.templateApprovalRequired} onChange={(event) => setSettings({ ...settings, templateApprovalRequired: event.target.checked })} />
          Template approval required
        </label>
        <div className="button-row">
          <button className="retro-button primary" onClick={save}>
            Save Settings
          </button>
          <button className="retro-button danger" onClick={reset}>
            Reset Demo Data
          </button>
        </div>
      </RetroWindow>
    </div>
  );
}

function DesktopShell({
  data,
  active,
  setActive,
  children,
}: {
  data: DashboardResponse;
  active: ModuleId;
  setActive: (module: ModuleId) => void;
  children: ReactNode;
}) {
  return (
    <main className={`desktop-shell theme-${data.settings.themeMode}`}>
      <header className="top-menu">
        <strong>ModDesk OS</strong>
        <nav>
          <button onClick={() => setActive('dashboard')}>File</button>
          <button onClick={() => setActive('academy')}>Training</button>
          <button onClick={() => setActive('consensus')}>Governance</button>
          <button onClick={() => setActive('queue')}>Queue</button>
          <button onClick={() => setActive('settings')}>Help</button>
        </nav>
        <span>r/{data.context.subredditName} · u/{data.context.username}</span>
      </header>
      <div className="desktop-workspace">
        <aside className="desktop-icons">
          {(Object.keys(moduleLabels) as ModuleId[]).map((module) => (
            <DesktopIcon module={module} active={active === module} onOpen={setActive} key={module} />
          ))}
        </aside>
        <section className="active-module">{children}</section>
      </div>
      <footer className="taskbar">
        <button className="start-button" onClick={() => setActive('dashboard')}>
          ▣ Start
        </button>
        {(Object.keys(moduleLabels) as ModuleId[]).map((module) => (
          <button className={active === module ? 'task active' : 'task'} onClick={() => setActive(module)} key={module}>
            {moduleIcons[module]} {moduleLabels[module]}
          </button>
        ))}
        <div className="tray">
          <span>Redis {data.context.redisStatus.toUpperCase()}</span>
          <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </footer>
    </main>
  );
}

function App() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [active, setActive] = useState<ModuleId>('dashboard');
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState('');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const addToast = (message: string, tone: Toast['tone'] = 'info') => {
    setToasts((items) => [...items, { id: `${Date.now()}-${Math.random()}`, message, tone }]);
  };

  const refresh = async () => {
    try {
      const dashboard = await apiFetch<DashboardResponse>('/dashboard');
      setData(dashboard);
    } catch (err) {
      if (import.meta.env.DEV) {
        setData(makePreviewDashboard());
        return;
      }
      throw err;
    }
  };

  useEffect(() => {
    refresh()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Unable to load ModDesk OS.'))
      .finally(() => window.setTimeout(() => setBooting(false), 900));
  }, []);

  const module = useMemo(() => {
    if (!data) return null;
    if (active === 'academy') return <AcademyModule data={data} refresh={refresh} toast={addToast} />;
    if (active === 'consensus') return <ConsensusModule data={data} refresh={refresh} toast={addToast} confirm={setConfirm} />;
    if (active === 'typewriter') return <TypewriterModule data={data} refresh={refresh} toast={addToast} />;
    if (active === 'queue') return <QueueModule data={data} refresh={refresh} toast={addToast} />;
    if (active === 'settings') return <SettingsModule data={data} refresh={refresh} toast={addToast} />;
    return <DashboardModule data={data} open={setActive} />;
  }, [active, data]);

  if (booting) return <BootScreen onSkip={() => setBooting(false)} />;
  if (error) {
    return (
      <div className="access-denied">
        <RetroWindow title="Access Check Failed" icon="!" footer="Moderator-only utility">
          <h1>ModDesk OS is private.</h1>
          <p>{error}</p>
          <p>Open this app from a subreddit moderator menu or ask a senior moderator to verify permissions.</p>
        </RetroWindow>
      </div>
    );
  }
  if (!data) return null;
  return (
    <>
      <DesktopShell data={data} active={active} setActive={setActive}>
        {module}
      </DesktopShell>
      <div className="toast-stack">
        {toasts.map((toast) => (
          <SystemToast key={toast.id} toast={toast} onClose={(toastId) => setToasts((items) => items.filter((item) => item.id !== toastId))} />
        ))}
      </div>
      <ConfirmDialog confirm={confirm} onCancel={() => setConfirm(null)} />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
