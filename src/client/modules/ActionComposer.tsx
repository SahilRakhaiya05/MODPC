import React, { useState } from 'react';
import type { ComposerDraftRequest, ComposerDraftResponse } from '../../shared/api';
import { api } from '../utils/api';

type ActionComposerProps = {
  mode: 'demo' | 'live';
  triggerToast: (msg: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
  openConsensus: () => void;
  openSentinel: () => void;
};

const targetTypes: ComposerDraftRequest['targetType'][] = ['post', 'comment', 'user', 'modmail', 'automod', 'announcement'];
const actionIntents: ComposerDraftRequest['actionIntent'][] = ['approve', 'remove', 'escalate', 'reply', 'archive', 'draft_automod', 'create_consensus'];

export const ActionComposer: React.FC<ActionComposerProps> = ({ mode, triggerToast, openConsensus, openSentinel }) => {
  const [targetType, setTargetType] = useState<ComposerDraftRequest['targetType']>('comment');
  const [actionIntent, setActionIntent] = useState<ComposerDraftRequest['actionIntent']>('reply');
  const [targetId, setTargetId] = useState('');
  const [context, setContext] = useState('');
  const [draft, setDraft] = useState<ComposerDraftResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const createDraft = async () => {
    setLoading(true);
    try {
      const payload: ComposerDraftRequest = {
        targetType,
        actionIntent,
        context,
      };
      if (targetId.trim()) payload.targetId = targetId.trim();
      const response = await api.draftComposer(payload);
      setDraft(response);
      triggerToast('Action draft prepared.', 'success');
    } catch (error) {
      triggerToast(error instanceof Error ? error.message : 'Action Composer could not create a draft.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="action-composer">
      <header className="ops-hero">
        <div>
          <span className="module-eyebrow">Working draft desk</span>
          <h3>Action Composer</h3>
          <p>Prepare moderator actions with risk checks, matching templates, removal reasons, and consensus routing before touching live Reddit.</p>
        </div>
        <div className="ops-status-card">
          <span>Workspace</span>
          <strong>{mode === 'live' ? 'Live guarded' : 'Training sandbox'}</strong>
          <em>{mode === 'live' ? 'Real context only' : 'Demo cases allowed'}</em>
        </div>
      </header>

      <div className="composer-grid">
        <section className="composer-form ops-panel">
          <label>
            <span>Target type</span>
            <select
              value={targetType}
              onChange={(event) => {
                const value = targetTypes.find((item) => item === event.target.value);
                if (value) setTargetType(value);
              }}
            >
              {targetTypes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>Action intent</span>
            <select
              value={actionIntent}
              onChange={(event) => {
                const value = actionIntents.find((item) => item === event.target.value);
                if (value) setActionIntent(value);
              }}
            >
              {actionIntents.map((item) => <option key={item} value={item}>{item.replace('_', ' ')}</option>)}
            </select>
          </label>
          <label>
            <span>Target id or label</span>
            <input value={targetId} onChange={(event) => setTargetId(event.target.value)} placeholder="t1_, t3_, u/name, modmail id..." />
          </label>
          <label>
            <span>Evidence and context</span>
            <textarea
              value={context}
              onChange={(event) => setContext(event.target.value)}
              placeholder="Paste report reasons, queue excerpt, user history notes, or modmail context..."
            />
          </label>
          <button type="button" className="glass-btn primary" onClick={() => void createDraft()} disabled={loading}>
            {loading ? 'Composing...' : 'Compose action'}
          </button>
        </section>

        <section className="composer-output ops-panel">
          {!draft ? (
            <p className="moddesk-empty">Choose a target and intent to generate a reviewable moderation draft.</p>
          ) : (
            <>
              <div className="composer-risk-row">
                <span className={`risk-severity ${draft.riskLevel}`}>{draft.riskLevel}</span>
                <strong>{draft.title}</strong>
                {draft.shouldUseConsensus && <button type="button" onClick={openConsensus}>Send to Consensus</button>}
                <button type="button" onClick={openSentinel}>Ask Sentinel</button>
              </div>
              <pre>{draft.draft}</pre>
              <div className="composer-columns">
                <div>
                  <span className="module-eyebrow">Checklist</span>
                  <ol>
                    {draft.checklist.map((item) => <li key={item}>{item}</li>)}
                  </ol>
                </div>
                <div>
                  <span className="module-eyebrow">Templates</span>
                  {draft.matchedTemplates.length === 0 ? (
                    <p>No saved templates yet.</p>
                  ) : draft.matchedTemplates.map((template) => (
                    <article key={template.templateId}>
                      <strong>{template.title}</strong>
                      <span>{template.tone}</span>
                    </article>
                  ))}
                </div>
              </div>
              <div className="composer-reasons">
                <span className="module-eyebrow">Removal reasons</span>
                {draft.removalReasons.length === 0 ? (
                  <p>Removal reasons are unavailable for this install.</p>
                ) : draft.removalReasons.map((reason) => (
                  <article key={reason.id || reason.title}>
                    <strong>{reason.title}</strong>
                    <p>{reason.message}</p>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  );
};
