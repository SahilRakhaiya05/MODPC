import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

interface ModmailHubProps {
  triggerToast: (msg: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
}

type FolderType = 'inbox' | 'progress' | 'archived' | 'discussion';

interface ModmailMessage {
  id: string;
  author: string;
  body: string;
  date: string;
  isInternal: boolean;
}

interface ModmailThread {
  id: string;
  subject: string;
  user: string;
  userKarma: number;
  userAge: string;
  userBanned: boolean;
  folder: FolderType;
  date: string;
  messages: ModmailMessage[];
}

export const ModmailHub: React.FC<ModmailHubProps> = ({ triggerToast }) => {
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
        // Auto-select first in folder
        const firstInFolder = res.conversations.find(c => c.folder === activeFolder);
        if (firstInFolder) {
          setSelectedThreadId(firstInFolder.id);
        }
      }
    } catch (err: any) {
      triggerToast(err.message || 'Failed to fetch modmail.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchModmail();
  }, []);

  // Update selected thread when changing folder
  useEffect(() => {
    const threadInFolder = conversations.find(c => c.folder === activeFolder);
    if (threadInFolder) {
      setSelectedThreadId(threadInFolder.id);
    } else {
      setSelectedThreadId(null);
    }
  }, [activeFolder, conversations]);

  const handleSendReply = async () => {
    if (!selectedThreadId || !replyText.trim()) return;
    setSubmitting(true);
    try {
      const res = await api.replyModmail({
        threadId: selectedThreadId,
        body: replyText,
        isInternal: isInternalNote
      });

      if (res.success) {
        triggerToast(
          isInternalNote ? 'Internal moderator note committed!' : 'Modmail reply dispatched successfully!',
          'success'
        );
        setReplyText('');
        // Re-sync
        await fetchModmail();
      }
    } catch (err: any) {
      triggerToast(err.message || 'Failed to send reply.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (action: 'archive' | 'unarchive' | 'delete') => {
    if (!selectedThreadId) return;
    try {
      const res = await api.actionModmail({
        threadId: selectedThreadId,
        action
      });
      if (res.success) {
        triggerToast(`Conversation ${action === 'archive' ? 'archived' : 'updated'}!`, 'success');
        await fetchModmail();
      }
    } catch (err: any) {
      triggerToast(err.message || 'Failed to apply action.', 'error');
    }
  };

  const selectedThread = conversations.find(c => c.id === selectedThreadId);
  const filteredThreads = conversations.filter(c => {
    const matchesFolder = c.folder === activeFolder;
    const matchesSearch = c.user.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          c.subject.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFolder && matchesSearch;
  });

  // Macros response templates
  const macros = [
    { title: '⚠️ Civility Reminder', text: 'Hi {username}, your post was removed under Rule 1: Civility. Please keep constructive discussions polite and focused on ideas.' },
    { title: '🚫 Spam Removal', text: 'Hello, your submission was flagged as unsolicited promotion or duplicate advertising spam, which violates subreddit rules. Future violations will result in permanent ban.' },
    { title: '🎮 AMA Guidelines', text: 'Hi u/{username}! Thanks for reaching out about AMAs. We are excited about it. We require a proof of identity and a short schedule. Let us know what time works best!' }
  ];

  const injectMacro = (macroText: string) => {
    if (!selectedThread) return;
    const completedText = macroText.replace('{username}', selectedThread.user);
    setReplyText(completedText);
  };

  return (
    <div 
      style={{ 
        display: 'grid', 
        gridTemplateColumns: '180px 240px 1fr', 
        gap: '12px', 
        height: '100%', 
        color: '#e2e8f0', 
        fontFamily: 'var(--font-body)',
        minHeight: 0
      }}
    >
      {/* Pane 1: Folders Directory */}
      <div 
        className="glass-panel"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          borderColor: 'var(--glass-border)',
          borderRadius: '10px',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}
      >
        <span style={{ fontSize: '8px', fontWeight: 700, fontFamily: 'var(--font-heading)', color: 'var(--accent-gold)', letterSpacing: '0.15em', marginBottom: '8px', display: 'block' }}>
          MODMAIL MAILBOX
        </span>
        
        {([
          { id: 'inbox', label: '📬 Inbox', count: conversations.filter(c => c.folder === 'inbox').length },
          { id: 'progress', label: '💬 In Progress', count: conversations.filter(c => c.folder === 'progress').length },
          { id: 'discussion', label: '🔒 Discussions', count: conversations.filter(c => c.folder === 'discussion').length },
          { id: 'archived', label: '📁 Archived', count: conversations.filter(c => c.folder === 'archived').length }
        ] as const).map(folder => {
          const isSelected = activeFolder === folder.id;
          return (
            <button
              key={folder.id}
              onClick={() => setActiveFolder(folder.id)}
              className="glass-btn"
              style={{
                justifyContent: 'space-between',
                padding: '10px 12px',
                fontSize: '11px',
                background: isSelected ? 'rgba(217, 119, 6, 0.12)' : 'transparent',
                borderColor: isSelected ? 'rgba(217, 119, 6, 0.3)' : 'transparent',
                color: isSelected ? '#ffffff' : 'var(--glass-text-muted)',
                fontWeight: isSelected ? 700 : 500
              }}
            >
              <span>{folder.label}</span>
              {folder.count > 0 && (
                <span style={{
                  backgroundColor: isSelected ? 'var(--accent-gold)' : 'rgba(255,255,255,0.06)',
                  color: isSelected ? '#000' : '#fff',
                  borderRadius: '10px',
                  padding: '1px 6px',
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono)'
                }}>
                  {folder.count}
                </span>
              )}
            </button>
          );
        })}

        <div style={{ flexGrow: 1 }} />
        <button 
          onClick={fetchModmail} 
          className="glass-btn primary" 
          style={{ fontSize: '9px', padding: '8px', letterSpacing: '0.1em' }}
          disabled={loading}
        >
          {loading ? 'SYNCING...' : '🔄 RE-SYNC MAIL'}
        </button>
      </div>

      {/* Pane 2: Threads list in Active Folder */}
      <div 
        className="glass-panel"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.2)',
          borderColor: 'var(--glass-border)',
          borderRadius: '10px',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          minHeight: 0
        }}
      >
        <input 
          type="text" 
          placeholder="Filter conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="glass-input"
          style={{ fontSize: '11px', padding: '6px 10px' }}
        />

        <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--glass-text-muted)', fontSize: '10px', fontFamily: 'var(--font-mono)', padding: '24px 0' }}>
              FETCHING MAILS...
            </div>
          ) : filteredThreads.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--glass-text-muted)', fontSize: '11px', padding: '36px 0' }}>
              No messages found.
            </div>
          ) : (
            filteredThreads.map(thread => {
              const isSelected = selectedThreadId === thread.id;
              const lastMsg = thread.messages[thread.messages.length - 1];
              return (
                <div
                  key={thread.id}
                  onClick={() => setSelectedThreadId(thread.id)}
                  className="glass-panel"
                  style={{
                    backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0,0,0,0.1)',
                    borderColor: isSelected ? 'var(--accent-gold)' : 'rgba(255,255,255,0.03)',
                    padding: '10px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#fff' }}>
                      u/{thread.user}
                    </span>
                    <span style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: 'var(--glass-text-muted)' }}>
                      {new Date(thread.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: isSelected ? 'var(--accent-gold)' : '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>
                    {thread.subject}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--glass-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {lastMsg ? lastMsg.body : 'No messages'}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Pane 3: Main Chat View & Participant Details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: '12px', minHeight: 0 }}>
        {/* Chat Thread */}
        <div 
          className="glass-panel"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.25)',
            borderColor: 'var(--glass-border)',
            borderRadius: '10px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            minHeight: 0
          }}
        >
          {selectedThread ? (
            <>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '10px' }}>
                <div>
                  <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
                    {selectedThread.subject}
                  </h3>
                  <span style={{ fontSize: '10px', color: 'var(--glass-text-muted)' }}>
                    Thread ID: <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedThread.id}</span>
                  </span>
                </div>
                
                {/* Actions */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  {selectedThread.folder !== 'archived' ? (
                    <button onClick={() => handleAction('archive')} className="glass-btn success" style={{ fontSize: '9px', padding: '4px 8px' }}>
                      ARCHIVE
                    </button>
                  ) : (
                    <button onClick={() => handleAction('unarchive')} className="glass-btn primary" style={{ fontSize: '9px', padding: '4px 8px' }}>
                      INBOX
                    </button>
                  )}
                  <button onClick={() => handleAction('delete')} className="glass-btn danger" style={{ fontSize: '9px', padding: '4px 8px' }}>
                    DISMISS
                  </button>
                </div>
              </div>

              {/* Chat Messages bubble chronological scroll list */}
              <div 
                style={{ 
                  flexGrow: 1, 
                  overflowY: 'auto', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '12px', 
                  paddingRight: '6px',
                  paddingBottom: '8px'
                }}
              >
                {selectedThread.messages.map((m, idx) => {
                  const isModMsg = m.author !== selectedThread.user;
                  return (
                    <div 
                      key={m.id || idx}
                      style={{
                        alignSelf: isModMsg ? 'flex-end' : 'flex-start',
                        maxWidth: '80%',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        alignItems: isModMsg ? 'flex-end' : 'flex-start'
                      }}
                    >
                      <div style={{ display: 'flex', gap: '8px', fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--glass-text-muted)', marginBottom: '1px' }}>
                        <span>{m.author}</span>
                        <span>{new Date(m.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div
                        style={{
                          backgroundColor: m.isInternal 
                            ? 'rgba(217, 119, 6, 0.06)' 
                            : isModMsg 
                              ? 'rgba(255, 255, 255, 0.04)' 
                              : 'rgba(0, 0, 0, 0.35)',
                          border: m.isInternal 
                            ? '1px dashed rgba(217, 119, 6, 0.4)' 
                            : isModMsg 
                              ? '1px solid rgba(255, 255, 255, 0.08)' 
                              : '1px solid rgba(255, 255, 255, 0.02)',
                          borderRadius: isModMsg ? '10px 10px 0px 10px' : '10px 10px 10px 0px',
                          padding: '10px 14px',
                          fontSize: '12px',
                          lineHeight: '1.5',
                          color: m.isInternal ? 'var(--accent-gold)' : '#fff',
                          wordBreak: 'break-word',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                        }}
                      >
                        {m.body}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Composition Area */}
              <div 
                style={{ 
                  borderTop: '1px solid rgba(255,255,255,0.06)', 
                  paddingTop: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                {/* Macros Injections */}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', overflowX: 'auto', paddingBottom: '4px' }}>
                  <span style={{ fontSize: '8px', fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--glass-text-muted)', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                    MACROS:
                  </span>
                  {macros.map((m, idx) => (
                    <button
                      key={idx}
                      onClick={() => injectMacro(m.text)}
                      className="glass-btn"
                      style={{ fontSize: '9px', padding: '3px 8px', whiteSpace: 'nowrap' }}
                    >
                      {m.title}
                    </button>
                  ))}
                </div>

                {/* Text editor box */}
                <textarea
                  placeholder={isInternalNote ? "Compose private internal moderator note..." : "Compose official response reply..."}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="glass-input"
                  style={{ minHeight: '60px', maxHeight: '120px', resize: 'vertical', fontSize: '12px', fontFamily: 'var(--font-body)' }}
                />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={isInternalNote}
                      onChange={(e) => setIsInternalNote(e.target.checked)}
                      style={{ accentColor: 'var(--accent-gold)' }}
                    />
                    <span style={{ fontSize: '10px', fontWeight: 600, color: isInternalNote ? 'var(--accent-gold)' : 'var(--glass-text-muted)' }}>
                      🔒 Internal Mod Note (Visible only to team)
                    </span>
                  </label>

                  <button
                    onClick={handleSendReply}
                    className="glass-btn primary"
                    style={{ padding: '8px 16px', letterSpacing: '0.05em' }}
                    disabled={submitting || !replyText.trim()}
                  >
                    {submitting ? 'TRANSMITTING...' : '🚀 DISPATCH MESSAGE'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexGrow: 1, alignItems: 'center', justifyContent: 'center', color: 'var(--glass-text-muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
              SELECT A CONVERSATION FROM THE QUEUE LIST.
            </div>
          )}
        </div>

        {/* Right Info card */}
        <div 
          className="glass-panel"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            borderColor: 'var(--glass-border)',
            borderRadius: '10px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <span style={{ fontSize: '8px', fontWeight: 700, fontFamily: 'var(--font-heading)', color: 'var(--glass-text-muted)', letterSpacing: '0.1em' }}>
            PARTICIPANT dossier
          </span>

          {selectedThread ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff', wordBreak: 'break-word', display: 'block' }}>
                  u/{selectedThread.user}
                </span>
                <span style={{
                  color: selectedThread.userBanned ? 'var(--error)' : 'var(--success)',
                  fontSize: '8px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.05em'
                }}>
                  {selectedThread.userBanned ? '🔴 BANNED STATUS' : '🟢 REGULAR USER'}
                </span>
              </div>

              <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.06)' }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
                <div>
                  <span style={{ color: 'var(--glass-text-muted)' }}>Karma Score:</span>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: '12px', marginTop: '2px' }}>{selectedThread.userKarma}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--glass-text-muted)' }}>Account Age:</span>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: '11px', marginTop: '2px' }}>{selectedThread.userAge}</div>
                </div>
              </div>

              <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.06)' }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '8px', fontWeight: 700, color: 'var(--glass-text-muted)', fontFamily: 'var(--font-heading)' }}>internal mod notes</span>
                <div style={{
                  backgroundColor: 'rgba(0,0,0,0.2)',
                  borderRadius: '6px',
                  padding: '6px 8px',
                  fontSize: '10px',
                  color: 'var(--glass-text-muted)',
                  fontStyle: 'italic',
                  lineHeight: '1.4'
                }}>
                  {selectedThread.userBanned 
                    ? "Violated Rule 1 harassment rules in general megathread on 2026-05-18. Ban appeal submitted."
                    : "No negative history recorded for this account. Appears cooperative."}
                </div>
              </div>
            </div>
          ) : (
            <span style={{ fontSize: '10px', color: 'var(--glass-text-muted)' }}>No user selected.</span>
          )}
        </div>
      </div>
    </div>
  );
};
