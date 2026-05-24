/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

type UserControlRegistryProps = {
  triggerToast: (msg: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
};

type TabType = 'banned' | 'muted' | 'approved' | 'moderators';
type UserActionType = Exclude<TabType, 'moderators'>;

type RegistryUser = {
  username: string;
  role?: string;
  reason?: string;
  duration?: string | number;
  date?: string;
};

export const UserControlRegistry: React.FC<UserControlRegistryProps> = ({ triggerToast }) => {
  const [activeTab, setActiveTab] = useState<TabType>('banned');
  const [users, setUsers] = useState<RegistryUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Form Fields
  const [usernameInput, setUsernameInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [durationInput, setDurationInput] = useState(0); // 0 = permanent
  const [noteInput, setNoteInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmLiveAction, setConfirmLiveAction] = useState(false);

  const fetchUsers = async (tab: TabType) => {
    setLoading(true);
    try {
      const res = await api.getLiveUsers(tab);
      setUsers(res.users);
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : `Failed to fetch users registry for ${tab}.`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchUsers(activeTab);
  }, [activeTab]);

  const activeUserActionType: UserActionType | null = activeTab === 'moderators' ? null : activeTab;

  const handleUserAction = async (
    type: UserActionType,
    username: string,
    action: 'add' | 'remove'
  ) => {
    if (!username.trim()) {
      triggerToast('Please provide a valid username.', 'warning');
      return;
    }
    if (!confirmLiveAction) {
      triggerToast('Confirm the guarded live user action first.', 'warning');
      return;
    }

    const cleanUsername = username.replace(/^u\//, '');
    setActionLoading(true);
    try {
      const res = await api.liveUserAction({
        type,
        username: cleanUsername,
        action,
        duration: durationInput,
        reason: reasonInput,
        note: noteInput,
        confirmation: confirmLiveAction
      });

      if (res.success) {
        triggerToast(
          `User u/${cleanUsername} successfully ${action === 'add' ? 'added to' : 'removed from'} ${type} registry!`,
          'success'
        );
        // Reset forms
        setUsernameInput('');
        setReasonInput('');
        setDurationInput(0);
        setNoteInput('');
        setConfirmLiveAction(false);
        // Re-fetch active tab
        void fetchUsers(activeTab);
      }
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : 'Subreddit user action operation failed.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', color: 'var(--ink)', fontFamily: 'var(--font-body)' }}>
      {/* Segmented Tab Controller */}
      <div 
        style={{ 
          padding: '8px', 
          background: 'var(--paper-strong)', 
          border: '3px solid var(--line)',
          borderRadius: '10px',
          boxShadow: '4px 4px 0 var(--line)',
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap'
        }}
      >
        {([
          { id: 'banned', label: '🛡️ Banned Users' },
          { id: 'muted', label: '🔇 Muted Users' },
          { id: 'approved', label: '🟢 Approved Contributors' },
          { id: 'moderators', label: '👑 Community Moderators' }
        ] as const).map(tab => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="glass-btn"
              style={{
                flexGrow: 1,
                padding: '10px 14px',
                fontSize: '11px',
                background: isSelected ? 'var(--orange)' : 'var(--paper)',
                border: '2px solid var(--line)',
                borderRadius: '6px',
                color: isSelected ? '#ffffff' : 'var(--ink)',
                fontWeight: isSelected ? 850 : 650,
                boxShadow: isSelected ? '3px 3px 0 var(--line)' : 'none',
                transform: isSelected ? 'translate(-1px, -1px)' : 'none',
                transition: 'all 0.1s ease'
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="registry-grid-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(280px, 0.8fr)', gap: '22px', flex: 1, minHeight: 0 }}>
        {/* Left Column: Registered Users list */}
        <div 
          style={{
            backgroundColor: 'var(--paper)',
            border: '3px solid var(--line)',
            borderRadius: '10px',
            padding: '18px',
            boxShadow: '6px 6px 0 var(--line)',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            minHeight: 0
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--line)', paddingBottom: '10px', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 900, fontFamily: 'var(--font-heading)', color: 'var(--ink)', letterSpacing: '0.05em' }}>
              📁 REGISTRY DATABASE RECORDS ({users.length})
            </span>
            <button 
              onClick={() => fetchUsers(activeTab)} 
              className="glass-btn" 
              style={{ fontSize: '11px', padding: '4px 12px', background: 'var(--paper-strong)' }}
              disabled={loading}
            >
              🔄 Sync Registry
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '60px 0', fontWeight: 800 }}>
              ⚡ INTERROGATING REDDIT CLOUD DIRECTORIES...
            </div>
          ) : users.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--muted)', fontFamily: 'var(--font-heading)', fontSize: '13px', padding: '60px 20px', lineHeight: '1.6', background: 'rgba(0,0,0,0.02)', borderRadius: '8px', border: '1px dashed var(--line-soft)' }}>
              ℹ️ NO USERS LISTED IN THIS CATEGORY.<br/>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 400 }}>Use the policy control panel on the right to add an entry.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {users.map((u) => (
                <div 
                  key={u.username}
                  style={{
                    backgroundColor: '#fffdfa',
                    border: '2px solid var(--line)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    boxShadow: '2px 2px 0 rgba(0,0,0,0.05)'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' }}>
                    <span style={{ fontSize: '14px', fontWeight: 850, color: 'var(--ink)', fontFamily: 'var(--font-heading)' }}>
                      u/{u.username}
                    </span>
                    {u.role && (
                      <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--orange-dark)', fontWeight: 800 }}>
                        Relation: {u.role}
                      </span>
                    )}
                    {u.reason && (
                      <span style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Note/Reason: {u.reason}
                      </span>
                    )}
                    {u.duration !== undefined && (
                      <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--red)', fontWeight: 800 }}>
                        Ban duration: {u.duration === 'Permanent' || u.duration === 0 ? '🚫 PERMANENT' : `⏳ ${u.duration} DAYS`}
                      </span>
                    )}
                  </div>

                  {/* Actions buttons */}
                  {activeUserActionType && (
                    <button
                      className="glass-btn danger"
                      style={{ fontSize: '10px', padding: '6px 12px', flexShrink: 0, boxShadow: '2px 2px 0 var(--line)' }}
                      onClick={() => handleUserAction(activeUserActionType, u.username, 'remove')}
                      disabled={actionLoading}
                    >
                      {activeTab === 'banned' ? '🔓 UNBAN' : activeTab === 'muted' ? '🔊 UNMUTE' : '❌ REMOVE'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Execution Control Panel (Forms) */}
        <div 
          style={{
            backgroundColor: 'var(--paper-strong)',
            border: '3px solid var(--line)',
            borderRadius: '10px',
            padding: '18px',
            boxShadow: '6px 6px 0 var(--line)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}
        >
          <span style={{ fontSize: '12px', fontWeight: 900, fontFamily: 'var(--font-heading)', color: 'var(--orange-dark)', letterSpacing: '0.1em' }}>
            ⚙️ REGISTRY POLICY CONTROL
          </span>

          {activeTab === 'moderators' ? (
            <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: '1.6', background: '#fffcf7', border: '2px solid var(--line)', padding: '14px', borderRadius: '8px' }}>
              <strong>ℹ️ Community Moderators</strong>
              <p style={{ marginTop: '8px', fontSize: '11px' }}>
                Subreddit moderation roles are controlled natively by your community configuration on Reddit.com. You can synchronize and view your team here, but changes must be made via the official Reddit mod tools.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Username Input */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span className="glass-label">TARGET USERNAME</span>
                <input
                  type="text"
                  placeholder="e.g. SpamWave"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  className="glass-input"
                  style={{ fontSize: '13px', padding: '8px 12px', color: 'var(--ink)' }}
                />
              </div>

              {/* Mute/Ban Specific fields */}
              {activeTab === 'banned' && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span className="glass-label">BAN DURATION (DAYS, 0 = PERM)</span>
                    <input
                      type="number"
                      min="0"
                      max="365"
                      value={durationInput}
                      onChange={(e) => setDurationInput(parseInt(e.target.value) || 0)}
                      className="glass-input"
                      style={{ fontSize: '13px', padding: '8px 12px', fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span className="glass-label">BAN AUDIT REASON</span>
                    <input
                      type="text"
                      placeholder="e.g. Spam links violation"
                      value={reasonInput}
                      onChange={(e) => setReasonInput(e.target.value)}
                      className="glass-input"
                      style={{ fontSize: '13px', padding: '8px 12px', color: 'var(--ink)' }}
                    />
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                      {['Spam / Self-Promo', 'Harassment / Civility', 'Duplicate / Repost', 'Brigading / Trolling', 'Toxicity / Toxicity'].map((reason) => (
                        <button
                          key={reason}
                          type="button"
                          onClick={() => setReasonInput(reason)}
                          className="glass-btn"
                          style={{ fontSize: '9px', padding: '3px 8px', height: 'auto', minHeight: 'auto', background: 'var(--paper)', border: '1px solid var(--line)' }}
                        >
                          +{reason}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span className="glass-label">MOD CONSOLE NOTE (INTERNAL)</span>
                    <input
                      type="text"
                      placeholder="e.g. Multi-account ban wave..."
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      className="glass-input"
                      style={{ fontSize: '13px', padding: '8px 12px', color: 'var(--ink)' }}
                    />
                  </div>
                </>
              )}

              {activeTab === 'muted' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span className="glass-label">MUTE AUDIT REASON</span>
                  <input
                    type="text"
                    placeholder="e.g. Modmail abuse/harassment"
                    value={reasonInput}
                    onChange={(e) => setReasonInput(e.target.value)}
                    className="glass-input"
                    style={{ fontSize: '13px', padding: '8px 12px', color: 'var(--ink)' }}
                  />
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                    {['Modmail Abuse', 'Harassment', 'Spamming Team', 'Trolling Modmail'].map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => setReasonInput(reason)}
                        className="glass-btn"
                        style={{ fontSize: '9px', padding: '3px 8px', height: 'auto', minHeight: 'auto', background: 'var(--paper)', border: '1px solid var(--line)' }}
                      >
                        +{reason}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--muted)', fontSize: '11px', fontWeight: 800, lineHeight: 1.4, cursor: 'pointer', userSelect: 'none', background: '#fffcf8', padding: '10px', borderRadius: '6px', border: '1px solid var(--line-soft)' }}>
                <input
                  type="checkbox"
                  checked={confirmLiveAction}
                  onChange={(event) => setConfirmLiveAction(event.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <span>Confirm this change will be applied directly to your live subreddit user registry on Reddit.</span>
              </label>

              {/* Action execute button */}
              <button
                className={`glass-btn ${activeTab === 'banned' ? 'danger' : 'primary'}`}
                style={{ fontWeight: 850, padding: '12px', marginTop: '6px', fontSize: '13px', boxShadow: '3px 3px 0 var(--line)' }}
                onClick={() => activeUserActionType && handleUserAction(activeUserActionType, usernameInput, 'add')}
                disabled={actionLoading || !usernameInput.trim() || !confirmLiveAction}
              >
                {actionLoading
                  ? '⚡ Working...'
                  : activeTab === 'banned'
                    ? '🚫 Commit banned status'
                    : activeTab === 'muted'
                      ? '🔇 Mute from contacts'
                      : '🟢 Deploy approved status'
                }
              </button>

              <div style={{ fontSize: '9px', color: 'var(--red)', fontFamily: 'var(--font-mono)', lineHeight: '1.4', marginTop: '6px', fontWeight: 800 }}>
                * DIRECT ACTION: ALL MODERATION WRITES IMMEDIATELY MODIFY SUBREDDIT MEMBERSHIP STATE VIA THE NATIVE REDDIT DEVVIT APIS.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
