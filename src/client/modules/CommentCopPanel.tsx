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
    supabaseVerificationEnabled: false,
    supabaseUrlConfigured: false,
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
          <span className="module-eyebrow">Anti-bot similarity shield</span>
          <h3>CommentCop</h3>
          <p>
            Watches new comments from the Devvit <code>onCommentCreate</code> trigger, blocks duplicate trigger
            deliveries with Redis <code>hSetNX</code>, and flags copied comments with explainable Jaccard similarity.
          </p>
        </div>
        <div className="commentcop-card">
          <span>Status</span>
          <strong>{data.settings.enabled ? 'Active' : 'Paused'}</strong>
          <p>{data.settings.action === 'remove' ? 'Confirmed duplicates are removed.' : 'Duplicates are logged for review.'}</p>
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
            Rolling Redis window
            <input
              type="number"
              min="50"
              max="1000"
              value={data.settings.rollingWindowSize}
              disabled={saving}
              onChange={(event) => void update({ rollingWindowSize: Number(event.target.value) })}
            />
          </label>
          <label>
            Supabase vector verification
            <select
              value={data.settings.supabaseVerificationEnabled ? 'on' : 'off'}
              disabled={saving || !data.settings.supabaseUrlConfigured}
              onChange={(event) => void update({ supabaseVerificationEnabled: event.target.value === 'on' })}
            >
              <option value="off">Off</option>
              <option value="on">On</option>
            </select>
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', borderRadius: '8px', background: '#fffdf8', border: '2px solid var(--line)', marginTop: '8px', marginBottom: '8px', textAlign: 'left' }}>
            <span style={{ fontSize: '10px', fontWeight: 900, color: 'var(--ink)', letterSpacing: '0.05em' }}>🔗 DATABASE SHIELD INTEGRATIONS</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
              <div style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: '6px', background: '#eaf8ef' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'rgb(34, 197, 94)', display: 'inline-block', boxShadow: '0 0 6px rgb(34, 197, 94)' }}></span>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <strong style={{ fontSize: '10px', color: 'var(--ink)' }}>Redis Cache</strong>
                  <span style={{ fontSize: '8px', color: 'var(--muted)', fontWeight: 650 }}>ACTIVE similarity</span>
                </div>
              </div>
              <div style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: '6px', background: data.settings.supabaseUrlConfigured ? '#ecf3ff' : '#f5f2ee' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: data.settings.supabaseUrlConfigured ? 'rgb(59, 130, 246)' : '#8a8178', display: 'inline-block', boxShadow: data.settings.supabaseUrlConfigured ? '0 0 6px rgb(59, 130, 246)' : 'none' }}></span>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <strong style={{ fontSize: '10px', color: 'var(--ink)' }}>Supabase Vector</strong>
                  <span style={{ fontSize: '8px', color: 'var(--muted)', fontWeight: 650 }}>{data.settings.supabaseUrlConfigured ? 'CONNECTED' : 'OPTIONAL (Offline)'}</span>
                </div>
              </div>
            </div>
          </div>
          <details style={{ marginTop: '4px', cursor: 'pointer', textAlign: 'left', marginBottom: '8px' }}>
            <summary style={{ fontSize: '11px', fontWeight: 850, color: 'var(--orange-dark)', outline: 'none', userSelect: 'none' }}>
              ⚙️ Show Developer Configuration Help
            </summary>
            <div style={{ marginTop: '8px', padding: '10px', background: '#faf6eb', border: '1px dashed var(--line)', borderRadius: '6px', fontSize: '10px', color: 'var(--muted)', lineHeight: '1.4', cursor: 'default' }}>
              Supabase is optional. To enable it:
              <ol style={{ paddingLeft: '14px', margin: '4px 0 0' }}>
                <li>Add your project host (e.g. <code>abc.supabase.co</code>) to <code>permissions.http.domains</code> in <code>devvit.json</code>.</li>
                <li>Run <code>devvit playtest</code> or <code>devvit upload</code> so Reddit approves it.</li>
                <li>Set <code>SUPABASE_COMMENTCOP_URL</code> and <code>SUPABASE_COMMENTCOP_KEY</code> on your server.</li>
              </ol>
              * Redis similarity matching works instantly out-of-the-box without Supabase!
            </div>
          </details>
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
                <small>{item.source} / {item.action} / {new Date(item.createdAt).toLocaleString()}</small>
              </article>
            ))
          )}
        </section>
      </div>
    </section>
  );
};
