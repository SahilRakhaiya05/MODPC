import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../utils/api';
import type { CommentCopResponse, CommentCopSettings } from '../../shared/api';

type CommentCopPanelProps = {
  triggerToast: (msg: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
};

const fallback: CommentCopResponse = {
  settings: {
    enabled: true,
    threshold: 0.85,
    action: 'log_only',
    minTokenCount: 8,
    rollingWindowSize: 250,
  },
  cases: [],
  stats: {
    scanned: 0,
    flagged: 0,
    removed: 0,
    duplicateTriggersBlocked: 0,
  },
};

export const CommentCopPanel: React.FC<CommentCopPanelProps> = ({ triggerToast }) => {
  const [data, setData] = useState<CommentCopResponse>(fallback);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.getCommentCop());
    } catch (error) {
      triggerToast(error instanceof Error ? error.message : 'CommentCop could not load.', 'error');
    } finally {
      setLoading(false);
    }
  }, [triggerToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const update = async (patch: Partial<CommentCopSettings>) => {
    setSaving(true);
    try {
      const next = await api.updateCommentCop(patch);
      setData(next);
      triggerToast('CommentCop settings saved.', 'success');
    } catch (error) {
      triggerToast(error instanceof Error ? error.message : 'Could not save CommentCop settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="commentcop-panel">
      <header className="commentcop-hero">
        <div>
          <span className="module-eyebrow">Reddit-only anti-bot shield</span>
          <h3>CommentCop</h3>
          <p>
            Watches new comments from the Devvit <code>onCommentCreate</code> trigger, blocks duplicate trigger
            deliveries with Reddit Redis <code>hSetNX</code>, and flags copied comments with explainable Jaccard
            similarity. Cases stay inside this subreddit app install.
          </p>
        </div>
        <div className="commentcop-card">
          <span>Status</span>
          <strong>{data.settings.enabled ? 'Active' : 'Paused'}</strong>
          <p>{data.settings.action === 'remove' ? 'Confirmed duplicates are removed when live writes are enabled.' : 'Duplicates are logged for review.'}</p>
        </div>
      </header>

      <div className="commentcop-metrics">
        <article className="commentcop-card">
          <span>Scanned</span>
          <strong>{data.stats.scanned}</strong>
          <p>incoming comments</p>
        </article>
        <article className="commentcop-card">
          <span>Flagged</span>
          <strong>{data.stats.flagged}</strong>
          <p>similarity hits</p>
        </article>
        <article className="commentcop-card">
          <span>Removed</span>
          <strong>{data.stats.removed}</strong>
          <p>live Reddit actions</p>
        </article>
        <article className="commentcop-card">
          <span>Dedupe</span>
          <strong>{data.stats.duplicateTriggersBlocked}</strong>
          <p>trigger repeats blocked</p>
        </article>
      </div>

      <div className="commentcop-body">
        <aside className="commentcop-settings">
          <label>
            Shield
            <select
              value={data.settings.enabled ? 'on' : 'off'}
              disabled={saving}
              onChange={(event) => void update({ enabled: event.target.value === 'on' })}
            >
              <option value="on">Active</option>
              <option value="off">Paused</option>
            </select>
          </label>
          <label>
            Action
            <select
              value={data.settings.action}
              disabled={saving}
              onChange={(event) => void update({ action: event.target.value === 'remove' ? 'remove' : 'log_only' })}
            >
              <option value="log_only">Log only</option>
              <option value="remove">Remove duplicate comment</option>
            </select>
          </label>
          <label>
            Jaccard threshold
            <input
              type="number"
              min="0.5"
              max="1"
              step="0.01"
              value={data.settings.threshold}
              disabled={saving}
              onChange={(event) => void update({ threshold: Number(event.target.value) })}
            />
          </label>
          <label>
            Minimum tokens
            <input
              type="number"
              min="4"
              max="40"
              value={data.settings.minTokenCount}
              disabled={saving}
              onChange={(event) => void update({ minTokenCount: Number(event.target.value) })}
            />
          </label>
          <label>
            Rolling Reddit Redis window
            <input
              type="number"
              min="50"
              max="1000"
              value={data.settings.rollingWindowSize}
              disabled={saving}
              onChange={(event) => void update({ rollingWindowSize: Number(event.target.value) })}
            />
          </label>
          <div className="commentcop-reddit-only">
            <strong>Reddit-only storage</strong>
            <span>No external vector service and no client-side external fetch. Devvit Redis stores locks, comments, stats, and cases.</span>
          </div>
          <button type="button" className="glass-btn" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
        </aside>

        <section className="commentcop-case-list" aria-label="Recent CommentCop cases">
          {loading ? (
            <p className="moddesk-empty">Loading CommentCop cases...</p>
          ) : data.cases.length === 0 ? (
            <p className="moddesk-empty">No copied-comment cases recorded yet. The shield is waiting for comment triggers.</p>
          ) : (
            data.cases.map((item) => (
              <article key={item.id} className="commentcop-case">
                <header>
                  <div>
                    <strong>u/{item.author}</strong>
                    <p>{item.reason}</p>
                  </div>
                  <span className="commentcop-score">{Math.round(item.score * 100)}%</span>
                </header>
                <p>{item.excerpt}</p>
                <p>Matched u/{item.matchedAuthor}: {item.matchedExcerpt}</p>
                <small>Reddit Redis / {item.action} / {new Date(item.createdAt).toLocaleString()}</small>
              </article>
            ))
          )}
        </section>
      </div>
    </section>
  );
};
