import React, { useEffect, useState } from 'react';
import type { HandoffRecord, HandoffResponse } from '../../shared/api';
import { api } from '../utils/api';

type ShiftHandoffProps = {
  triggerToast: (msg: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
  openSentinel: () => void;
};

const copyText = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
};

export const ShiftHandoff: React.FC<ShiftHandoffProps> = ({ triggerToast, openSentinel }) => {
  const [data, setData] = useState<HandoffResponse | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);

  const generateHandoff = async () => {
    if (!data) {
      triggerToast('Handoff data is still loading.', 'warning');
      return;
    }
    setLoading(true);
    try {
      const prompt = [
        'Draft a concise moderator shift handoff note from the snapshot below.',
        'Return only the handoff draft text. Keep it readable, actionable, and ready to paste into the notes field.',
        `Pressure: ${data.current.pressureScore}/100.`,
        `Queue open: ${data.current.queueOpen}. Modmail open: ${data.current.modmailOpen ?? 0}. Audit count: ${data.current.auditCount}. Pending consensus: ${data.current.pendingConsensus}.`,
        data.current.nextModItems.length ? `Needs next mod: ${data.current.nextModItems.join('; ')}` : 'Needs next mod: no urgent handoff items.',
        data.current.recentChanges.length ? `What changed: ${data.current.recentChanges.join('; ')}` : 'What changed: no recent changes recorded.',
        notes ? `Existing notes to preserve or improve: ${notes}` : 'Existing notes: none.',
      ].join('\n');
      const response = await api.askAi({ prompt, history: [] });
      setNotes(response.reply.trim());
      triggerToast('Sentinel drafted the handoff notes.', 'success');
      openSentinel();
    } catch (error) {
      triggerToast(error instanceof Error ? error.message : 'Sentinel could not draft the handoff.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    api.getHandoff()
      .then((response) => {
        if (isMounted) setData(response);
      })
      .catch((error: unknown) => {
        triggerToast(error instanceof Error ? error.message : 'Shift Handoff failed to load.', 'error');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [triggerToast]);

  const create = async () => {
    setLoading(true);
    try {
      const response = await api.createHandoff({ notes });
      setData(response);
      setNotes('');
      triggerToast('Shift handoff saved.', 'success');
    } catch (error) {
      triggerToast(error instanceof Error ? error.message : 'Could not save shift handoff.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const copyRecord = async (record: HandoffRecord) => {
    await copyText(record.summary);
    triggerToast('Handoff summary copied.', 'success');
  };

  return (
    <section className="shift-handoff">
      <header className="ops-hero">
        <div>
          <span className="module-eyebrow">Team continuity</span>
          <h3>Shift Handoff</h3>
          <p>Capture what changed, what needs the next moderator, and the current pressure picture for timezone handoffs.</p>
        </div>
        <div className="ops-status-card">
          <span>Pressure</span>
          <strong>{loading ? '...' : data?.current.pressureScore ?? 0}/100</strong>
          <em>{data?.current.pendingConsensus ?? 0} consensus open</em>
        </div>
      </header>

      <div className="handoff-grid">
        <section className="ops-panel handoff-current">
          <div className="handoff-stats">
            <button><strong>{data?.current.queueOpen ?? 0}</strong><span>queue</span></button>
            <button><strong>{data?.current.modmailOpen ?? 0}</strong><span>modmail</span></button>
            <button><strong>{data?.current.auditCount ?? 0}</strong><span>audit</span></button>
            <button><strong>{data?.current.pendingConsensus ?? 0}</strong><span>consensus</span></button>
          </div>
          <div className="handoff-lists">
            <div>
              <span className="module-eyebrow">Needs next mod</span>
              {data?.current.nextModItems.length ? (
                <ol>{data.current.nextModItems.map((item) => <li key={item}>{item}</li>)}</ol>
              ) : <p className="moddesk-empty compact">No urgent handoff items.</p>}
            </div>
            <div>
              <span className="module-eyebrow">What changed</span>
              {data?.current.recentChanges.length ? (
                <ol>{data.current.recentChanges.map((item) => <li key={item}>{item}</li>)}</ol>
              ) : <p className="moddesk-empty compact">No recent changes recorded.</p>}
            </div>
          </div>
          <label>
            <span>Handoff notes</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What should the next moderator know?" />
          </label>
          <div className="handoff-actions">
            <button type="button" className="glass-btn" onClick={() => void generateHandoff()} disabled={loading}>Generate with Sentinel</button>
            <button type="button" className="glass-btn primary" onClick={() => void create()} disabled={loading}>Save handoff</button>
          </div>
        </section>

        <section className="ops-panel handoff-history">
          <div className="ph-panel-title">
            <span>Handoff history</span>
          </div>
          {data?.records.length ? data.records.map((record) => (
            <article key={record.handoffId}>
              <div>
                <strong>u/{record.createdBy}</strong>
                <time dateTime={record.createdAt}>{new Date(record.createdAt).toLocaleString()}</time>
              </div>
              <p>{record.summary}</p>
              <button type="button" onClick={() => void copyRecord(record)}>Copy summary</button>
            </article>
          )) : <p className="moddesk-empty">No handoffs saved yet.</p>}
        </section>
      </div>
    </section>
  );
};
