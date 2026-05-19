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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', color: '#e2e8f0', fontFamily: 'var(--font-body)' }}>
      {/* Segmented Tab Controller */}
      <div 
        className="glass-panel" 
        style={{ 
          padding: '6px', 
          background: 'rgba(0, 0, 0, 0.25)', 
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: '10px',
          display: 'flex',
          gap: '6px'
        }}
      >
        {([
          { id: 'banned', label: '🛡️ BANNED USERS' },
          { id: 'muted', label: '🔇 MUTED USERS' },
          { id: 'approved', label: '🟢 APPROVED CONTRIBUTORS' },
          { id: 'moderators', label: '👑 COMMUNITY MODERATORS' }
        ] as const).map(tab => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="glass-btn"
              style={{
                flexGrow: 1,
                padding: '8px',
                fontSize: '9px',
                background: isSelected ? 'rgba(217, 119, 6, 0.12)' : 'transparent',
                borderColor: isSelected ? 'rgba(217, 119, 6, 0.3)' : 'transparent',
                color: isSelected ? 'var(--accent-gold)' : 'var(--glass-text-muted)',
                fontWeight: isSelected ? 700 : 500,
                boxShadow: isSelected ? '0 0 10px rgba(217, 119, 6, 0.15)' : 'none'
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '16px', flexGrow: 1, minHeight: 0 }}>
        {/* Left Column: Registered Users list */}
        <div 
          className="glass-panel"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            borderColor: 'var(--glass-border)',
            borderRadius: '10px',
            padding: '16px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            minHeight: 0
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, fontFamily: 'var(--font-heading)', color: 'var(--glass-text-muted)', letterSpacing: '0.05em' }}>
              REGISTRY DATABASE RECORDS ({users.length})
            </span>
            <button 
              onClick={() => fetchUsers(activeTab)} 
              className="glass-btn" 
              style={{ fontSize: '9px', padding: '3px 8px' }}
              disabled={loading}
            >
              Sync Registry
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--glass-text-muted)', fontFamily: 'var(--font-mono)', fontSize: '11px', padding: '40px 0' }}>
              🔄 INTERROGATING REDDIT CLOUD DIRECTORIES...
            </div>
          ) : users.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--glass-text-muted)', fontFamily: 'var(--font-heading)', fontSize: '12px', padding: '48px 16px', lineHeight: '1.6' }}>
              ℹ️ NO USERS LISTED IN THIS CATEGORY.<br/>
              <span style={{ fontSize: '10px', color: 'var(--glass-text-muted)', fontWeight: 400 }}>USE THE CONTROL PANEL TO ADD AN ENTRY.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {users.map((u) => (
                <div 
                  key={u.username}
                  className="glass-panel"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    borderColor: 'rgba(255, 255, 255, 0.04)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#fff', fontFamily: 'var(--font-heading)' }}>
                      u/{u.username}
                    </span>
                    {u.role && (
                      <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)' }}>
                        Relation: {u.role}
                      </span>
                    )}
                    {u.reason && (
                      <span style={{ fontSize: '10px', color: 'var(--glass-text-muted)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Note: {u.reason}
                      </span>
                    )}
                    {u.duration !== undefined && (
                      <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: '#f87171' }}>
                        Ban duration: {u.duration === 'Permanent' || u.duration === 0 ? 'PERMANENT' : `${u.duration} DAYS`}
                      </span>
                    )}
                  </div>

                  {/* Actions buttons */}
                  {activeUserActionType && (
                    <button
                      className="glass-btn danger"
                      style={{ fontSize: '9px', padding: '4px 10px', flexShrink: 0 }}
                      onClick={() => handleUserAction(activeUserActionType, u.username, 'remove')}
                      disabled={actionLoading}
                    >
                      {activeTab === 'banned' ? 'UNBAN' : activeTab === 'muted' ? 'UNMUTE' : 'REMOVE APPROVED'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Execution Control Panel (Forms) */}
        <div 
          className="glass-panel"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.25)',
            borderColor: 'var(--glass-border)',
            borderRadius: '10px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}
        >
          <span style={{ fontSize: '10px', fontWeight: 700, fontFamily: 'var(--font-heading)', color: 'var(--accent-gold)', letterSpacing: '0.1em' }}>
            REGISTRY POLICY CONTROL
          </span>

          {activeTab === 'moderators' ? (
            <div style={{ fontSize: '11px', color: 'var(--glass-text-muted)', lineHeight: '1.6' }}>
              ⚠️ Moderation team membership is controlled directly from your subreddit's settings on Reddit.com. You can view active moderators here, but changes must be made via the official admin portal.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Username Input */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span className="glass-label">TARGET USERNAME</span>
                <input
                  type="text"
                  placeholder="e.g. u/SpamWave"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  className="glass-input"
                  style={{ fontSize: '12px', padding: '6px 12px' }}
                />
              </div>

              {/* Mute/Ban Specific fields */}
              {activeTab === 'banned' && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span className="glass-label">BAN DURATION (DAYS, 0 = PERM)</span>
                    <input
                      type="number"
                      min="0"
                      max="365"
                      value={durationInput}
                      onChange={(e) => setDurationInput(parseInt(e.target.value) || 0)}
                      className="glass-input"
                      style={{ fontSize: '12px', padding: '6px 12px', fontFamily: 'var(--font-mono)' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span className="glass-label">BAN AUDIT REASON</span>
                    <input
                      type="text"
                      placeholder="e.g. Spam links violation"
                      value={reasonInput}
                      onChange={(e) => setReasonInput(e.target.value)}
                      className="glass-input"
                      style={{ fontSize: '12px', padding: '6px 12px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span className="glass-label">MOD CONSOLE NOTE (INTERNAL)</span>
                    <input
                      type="text"
                      placeholder="e.g. Multi-account ban wave..."
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      className="glass-input"
                      style={{ fontSize: '12px', padding: '6px 12px' }}
                    />
                  </div>
                </>
              )}

              {activeTab === 'muted' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span className="glass-label">MUTE AUDIT REASON</span>
                  <input
                    type="text"
                    placeholder="e.g. Modmail abuse/harassment"
                    value={reasonInput}
                    onChange={(e) => setReasonInput(e.target.value)}
                    className="glass-input"
                    style={{ fontSize: '12px', padding: '6px 12px' }}
                  />
                </div>
              )}

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--muted)', fontSize: '11px', fontWeight: 800, lineHeight: 1.35 }}>
                <input
                  type="checkbox"
                  checked={confirmLiveAction}
                  onChange={(event) => setConfirmLiveAction(event.target.checked)}
                />
                Confirm this change will be applied to the live subreddit user registry.
              </label>

              {/* Action execute button */}
              <button
                className={`glass-btn ${activeTab === 'banned' ? 'danger' : 'primary'}`}
                style={{ fontWeight: 600, padding: '10px', marginTop: '6px' }}
                onClick={() => activeUserActionType && handleUserAction(activeUserActionType, usernameInput, 'add')}
                disabled={actionLoading || !usernameInput.trim() || !confirmLiveAction}
              >
                {actionLoading
                  ? 'Working...'
                  : activeTab === 'banned'
                    ? 'Commit banned status'
                    : activeTab === 'muted'
                      ? 'Mute from contacts'
                      : 'Deploy approved status'
                }
              </button>

              <div style={{ fontSize: '8px', color: '#f87171', fontFamily: 'var(--font-mono)', lineHeight: '1.4', marginTop: '6px' }}>
                * IMPORTANT: BANS, MUTES AND CONTRIBUTOR ACTIONS TAKE EFFECT DIRECTLY ON THE LIVE SUBREDDIT VIA DEVVIT CLIENT INTERFACES.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
