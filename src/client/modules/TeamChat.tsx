import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, SessionResponse } from '../../shared/api';
import { api } from '../utils/api';

type TeamChatProps = {
  session?: SessionResponse | undefined;
  triggerToast: (msg: string, tone?: 'success' | 'warning' | 'error' | 'info') => void;
};

const POLL_MS = 5000;

const fmtTime = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const renderBody = (body: string, me: string): React.ReactNode => {
  const parts: React.ReactNode[] = [];
  const re = /(@[a-z0-9_-]{3,30})/gi;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(body)) !== null) {
    if (match.index > lastIdx) parts.push(body.slice(lastIdx, match.index));
    const mentioned = match[0].slice(1).toLowerCase();
    const isMe = mentioned === me.toLowerCase();
    parts.push(
      <span key={`m-${key++}`} className={`chat-mention ${isMe ? 'me' : ''}`}>
        {match[0]}
      </span>
    );
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < body.length) parts.push(body.slice(lastIdx));
  return parts;
};

export const TeamChat: React.FC<TeamChatProps> = ({ session, triggerToast }) => {
  const me = session?.username ?? '';
  const role = session?.modDeskRole ?? 'observer';
  const canPin = role === 'owner' || role === 'admin';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pinned, setPinned] = useState<ChatMessage[]>([]);
  const [participants, setParticipants] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<'all' | 'mentions' | 'pinned'>('all');
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTsRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async (silent = false) => {
    try {
      const data = await api.getTeamChat();
      if (!mountedRef.current) return;
      setMessages(data.messages);
      setPinned(data.pinned);
      setParticipants(data.participants);
      if (data.messages.length > 0) {
        lastTsRef.current = data.messages[data.messages.length - 1]!.createdAt;
      }
    } catch (err) {
      if (!silent) triggerToast(err instanceof Error ? err.message : 'Failed to load chat.', 'error');
    }
  }, [triggerToast]);

  useEffect(() => {
    mountedRef.current = true;
    const initialLoad = window.setTimeout(() => {
      void refresh().then(() => api.markNotificationsRead().catch(() => null));
    }, 0);
    const t = window.setInterval(() => { void refresh(true); }, POLL_MS);
    return () => {
      mountedRef.current = false;
      window.clearTimeout(initialLoad);
      window.clearInterval(t);
    };
  }, [refresh]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await api.postTeamChat(text);
      setDraft('');
      await refresh(true);
      await api.markNotificationsRead().catch(() => null);
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : 'Failed to send.', 'error');
    } finally {
      setSending(false);
    }
  };

  const togglePin = async (msg: ChatMessage) => {
    try {
      await api.pinTeamChat(msg.id, !msg.pinned);
      await refresh(true);
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : 'Pin failed.', 'error');
    }
  };

  const remove = async (msg: ChatMessage) => {
    try {
      await api.deleteTeamChat(msg.id);
      triggerToast('Message removed.', 'success');
      await refresh(true);
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  };

  const filtered = useMemo(() => {
    if (filter === 'mentions') return messages.filter((m) => m.mentions.some((u) => u === me.toLowerCase()));
    if (filter === 'pinned') return messages.filter((m) => m.pinned);
    return messages;
  }, [filter, messages, me]);

  const insertMention = (user: string) => {
    setDraft((d) => `${d}${d && !d.endsWith(' ') ? ' ' : ''}@${user} `);
  };

  return (
    <div className="chat-panel">
      <header className="chat-header">
        <div>
          <span className="module-eyebrow">Mod team channel</span>
          <h3>r/{session?.subredditName ?? 'community'} · #team</h3>
          <p>
            Private channel — only moderators of this subreddit can see or post. Messages persist in Redis for 200 entries.
          </p>
        </div>
        <div className="chat-header-meta">
          <span>You</span>
          <strong>{me ? `u/${me}` : 'guest'}</strong>
          <em>{role}</em>
        </div>
      </header>

      {pinned.length > 0 && (
        <section className="chat-pinned">
          <span className="module-eyebrow">Pinned by owner</span>
          {pinned.map((m) => (
            <article key={m.id} className="chat-pinned-row">
              <strong>u/{m.author}</strong>
              <p>{renderBody(m.body, me)}</p>
              <time>{fmtTime(m.createdAt)}</time>
            </article>
          ))}
        </section>
      )}

      <nav className="chat-filters" role="tablist">
        {(['all', 'mentions', 'pinned'] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            className={filter === f ? 'active' : ''}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? `All (${messages.length})` : f === 'mentions' ? 'Mentions' : `Pinned (${pinned.length})`}
          </button>
        ))}
        <span className="chat-presence">
          {participants.slice(0, 5).map((p) => (
            <button key={p} type="button" className="chat-pill" onClick={() => insertMention(p)} title={`Mention u/${p}`}>
              u/{p}
            </button>
          ))}
          {participants.length > 5 && <em>+{participants.length - 5}</em>}
        </span>
      </nav>

      <div className="chat-stream" ref={scrollRef}>
        {filtered.length === 0 ? (
          <div className="chat-empty">
            <strong>No messages yet.</strong>
            <p>Say hello to the team. Use @username to ping someone.</p>
          </div>
        ) : (
          filtered.map((m) => {
            const isMe = m.author.toLowerCase() === me.toLowerCase();
            const isMention = m.mentions.includes(me.toLowerCase());
            return (
              <article
                key={m.id}
                className={`chat-row ${isMe ? 'me' : ''} ${isMention ? 'mention' : ''} ${m.pinned ? 'pinned' : ''}`}
              >
                <header>
                  <strong>u/{m.author}</strong>
                  <span className="chat-role">{m.authorRole}</span>
                  <time>{fmtTime(m.createdAt)}</time>
                  {m.pinned && <em className="chat-flag">📌</em>}
                </header>
                <p>{renderBody(m.body, me)}</p>
                <div className="chat-row-actions">
                  {canPin && (
                    <button type="button" className="chat-link" onClick={() => togglePin(m)}>
                      {m.pinned ? 'Unpin' : 'Pin'}
                    </button>
                  )}
                  {(isMe || canPin) && (
                    <button type="button" className="chat-link danger" onClick={() => remove(m)}>
                      Delete
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>

      <footer className="chat-composer">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Message #team... use @username to ping. Ctrl+Enter to send."
          rows={2}
          maxLength={2000}
        />
        <div className="chat-composer-actions">
          <span className="chat-counter">{draft.length}/2000</span>
          <button type="button" className="glass-btn primary" onClick={send} disabled={sending || !draft.trim()}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </footer>
    </div>
  );
};
