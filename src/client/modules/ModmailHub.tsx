/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { UserDossier } from '../components/UserDossier';

type ModmailHubProps = {
  mode: 'demo' | 'live';
  triggerToast: (msg: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
};

type FolderType = 'inbox' | 'progress' | 'archived' | 'discussion';

type ModmailMessage = {
  id: string;
  author: string;
  body: string;
  date: string;
  isInternal: boolean;
};

type ModmailThread = {
  id: string;
  subject: string;
  user: string;
  userKarma: number;
  userAge: string;
  userBanned: boolean;
  folder: FolderType;
  date: string;
  messages: ModmailMessage[];
};

const folders: Array<{ id: FolderType; label: string }> = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'progress', label: 'In Progress' },
  { id: 'discussion', label: 'Discussions' },
  { id: 'archived', label: 'Archived' },
];

const macros = [
  {
    title: 'Civility Reminder',
    text: 'Hi {username}, your post was removed under Rule 1: Civility. Please keep discussions polite and focused on ideas.',
  },
  {
    title: 'Spam Removal',
    text: 'Hello, your submission was flagged as unsolicited promotion or duplicate advertising spam, which violates subreddit rules.',
  },
  {
    title: 'AMA Guidelines',
    text: 'Hi u/{username}. Thanks for reaching out about an AMA. Please send proof of identity and a proposed schedule.',
  },
];

export const ModmailHub: React.FC<ModmailHubProps> = ({ mode, triggerToast }) => {
  const [conversations, setConversations] = useState<ModmailThread[]>([]);
  const [activeFolder, setActiveFolder] = useState<FolderType>('inbox');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [replyText, setReplyText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchModmail = async () => {
    setLoading(true);
    try {
      const res = await api.getLiveModmail();
      setConversations(res.conversations);
      if (res.conversations.length > 0 && !selectedThreadId) {
        const firstInFolder = res.conversations.find((thread) => thread.folder === activeFolder);
        setSelectedThreadId(firstInFolder?.id ?? res.conversations[0]?.id ?? null);
      }
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : 'Failed to fetch modmail.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchModmail();
  }, []);

  useEffect(() => {
    const threadInFolder = conversations.find((thread) => thread.folder === activeFolder);
    setSelectedThreadId(threadInFolder?.id ?? null);
  }, [activeFolder, conversations]);

  const handleSendReply = async () => {
    if (!selectedThreadId || !replyText.trim()) return;
    setSubmitting(true);
    try {
      const res = await api.replyModmail({
        threadId: selectedThreadId,
        body: replyText,
        isInternal: isInternalNote,
        mode,
      });

      if (res.success) {
        triggerToast(
          isInternalNote ? 'Internal moderator note added.' : 'Modmail reply sent.',
          'success'
        );
        setReplyText('');
        await fetchModmail();
      }
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : 'Failed to send reply.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (action: 'archive' | 'unarchive' | 'delete') => {
    if (!selectedThreadId) return;
    try {
      const res = await api.actionModmail({ threadId: selectedThreadId, action, mode });
      if (res.success) {
        triggerToast(`Conversation ${action === 'archive' ? 'archived' : 'updated'}.`, 'success');
        await fetchModmail();
      }
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : 'Failed to apply action.', 'error');
    }
  };

  const selectedThread = conversations.find((thread) => thread.id === selectedThreadId);
  const filteredThreads = conversations.filter((thread) => {
    const needle = searchQuery.toLowerCase();
    return thread.folder === activeFolder && (
      thread.user.toLowerCase().includes(needle) ||
      thread.subject.toLowerCase().includes(needle)
    );
  });

  const injectMacro = (macroText: string) => {
    if (!selectedThread) return;
    setReplyText(macroText.replace('{username}', selectedThread.user));
  };

  return (
    <div className="modmail-shell">
      <aside className="modmail-pane modmail-folders">
        <div className="module-eyebrow">Live modmail mailbox</div>
        {folders.map((folder) => {
          const isSelected = activeFolder === folder.id;
          const count = conversations.filter((thread) => thread.folder === folder.id).length;
          return (
            <button
              key={folder.id}
              onClick={() => setActiveFolder(folder.id)}
              className={isSelected ? 'active' : ''}
            >
              <span>{folder.label}</span>
              <strong>{count}</strong>
            </button>
          );
        })}
        <button className="glass-btn primary modmail-sync" onClick={fetchModmail} disabled={loading}>
          {loading ? 'Syncing...' : 'Re-sync mail'}
        </button>
      </aside>

      <section className="modmail-pane modmail-list">
        <input
          type="text"
          placeholder="Filter conversations..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="glass-input"
        />
        <div className="modmail-thread-list">
          {loading ? (
            <div className="module-empty compact">Fetching mail...</div>
          ) : filteredThreads.length === 0 ? (
            <div className="module-empty compact">No messages found.</div>
          ) : (
            filteredThreads.map((thread) => {
              const isSelected = selectedThreadId === thread.id;
              const lastMsg = thread.messages[thread.messages.length - 1];
              return (
                <button
                  key={thread.id}
                  onClick={() => setSelectedThreadId(thread.id)}
                  className={isSelected ? 'active' : ''}
                >
                  <span>
                    <strong>u/{thread.user}</strong>
                    <em>{new Date(thread.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</em>
                  </span>
                  <b>{thread.subject}</b>
                  <small>{lastMsg ? lastMsg.body : 'No messages'}</small>
                </button>
              );
            })
          )}
        </div>
      </section>

      <section className="modmail-pane modmail-thread">
        {selectedThread ? (
          <>
            <header className="modmail-thread-head">
              <div>
                <h3>{selectedThread.subject}</h3>
                <span>Thread ID: {selectedThread.id}</span>
              </div>
              <div>
                {selectedThread.folder !== 'archived' ? (
                  <button onClick={() => handleAction('archive')} className="glass-btn success">Archive</button>
                ) : (
                  <button onClick={() => handleAction('unarchive')} className="glass-btn primary">Move to inbox</button>
                )}
                <button onClick={() => handleAction('delete')} className="glass-btn danger">Dismiss</button>
              </div>
            </header>

            <div className="modmail-messages">
              {selectedThread.messages.map((message, index) => {
                const isModMsg = message.author !== selectedThread.user;
                return (
                  <article key={message.id || `${message.date}-${index}`} className={isModMsg ? 'mod' : 'user'}>
                    <span>{message.author} / {new Date(message.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <p className={message.isInternal ? 'internal' : ''}>{message.body}</p>
                  </article>
                );
              })}
            </div>

            <footer className="modmail-compose">
              <div className="modmail-macros">
                <span>Macros</span>
                {macros.map((macro) => (
                  <button key={macro.title} onClick={() => injectMacro(macro.text)}>{macro.title}</button>
                ))}
              </div>
              <textarea
                placeholder={isInternalNote ? 'Compose private internal moderator note...' : 'Compose official response reply...'}
                value={replyText}
                onChange={(event) => setReplyText(event.target.value)}
                className="glass-input"
              />
              <div className="modmail-send-row">
                <label>
                  <input
                    type="checkbox"
                    checked={isInternalNote}
                    onChange={(event) => setIsInternalNote(event.target.checked)}
                  />
                  Internal mod note
                </label>
                <button onClick={handleSendReply} className="glass-btn primary" disabled={submitting || !replyText.trim()}>
                  {submitting ? 'Sending...' : 'Reply in Modmail'}
                </button>
              </div>
            </footer>
          </>
        ) : (
          <div className="module-empty">Select a conversation from the mailbox.</div>
        )}
      </section>

      <aside className="modmail-pane modmail-profile">
        <UserDossier username={selectedThread ? selectedThread.user : null} />
        {selectedThread?.userBanned && (
          <p className="modmail-ban-note">
            Prior ban context is present on this account. Review the live user registry before replying.
          </p>
        )}
      </aside>
    </div>
  );
};
