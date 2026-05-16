/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import React, { useState, useEffect } from 'react';
import { ConsensusTicket, ModeratorProfile } from '../types';
import { api } from '../utils/api';
import { ProgressMeter } from '../components/ProgressMeter';

interface ConsensusDeskProps {
  profile: ModeratorProfile;
  triggerToast: (msg: string, type?: 'success' | 'warning' | 'error') => void;
}

export const ConsensusDesk: React.FC<ConsensusDeskProps> = ({ profile, triggerToast }) => {
  const [tickets, setTickets] = useState<ConsensusTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<ConsensusTicket | null>(null);
  
  // Creation Form State
  const [isCreating, setIsCreating] = useState(false);
  const [actionType, setActionType] = useState('ban_permanent');
  const [targetType, setTargetType] = useState('user');
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState('');
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');

  // Voting Input Note
  const [voteNote, setVoteNote] = useState('');
  const [isVoting, setIsVoting] = useState(false);

  const fetchTickets = async () => {
    try {
      const data = await api.getTickets();
      setTickets(data.tickets);
      if (selectedTicket) {
        const updated = data.tickets.find(t => t.ticketId === selectedTicket.ticketId);
        if (updated) setSelectedTicket(updated);
      }
    } catch (err) {
      console.error(err);
      triggerToast('Error loading consensus tickets', 'error');
    }
  };

  useEffect(() => {
    void fetchTickets();
  }, []);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetId.trim()) {
      triggerToast('Please enter a target ID or username!', 'warning');
      return;
    }
    if (!reason.trim()) {
      triggerToast('Please provide a supporting reason!', 'warning');
      return;
    }

    try {
      const res = await api.createTicket({
        actionType,
        targetType,
        targetId: targetId.trim(),
        reason: reason.trim(),
        severity,
        evidence: evidence.trim()
      });

      if (res.success) {
        triggerToast('🗳️ Governance ticket created for team review!', 'success');
        setIsCreating(false);
        setTargetId('');
        setReason('');
        setEvidence('');
        void fetchTickets();
      }
    } catch (err) {
      console.error(err);
      triggerToast('Failed to log consensus ticket', 'error');
    }
  };

  const handleCastVote = async (voteValue: 'approve' | 'reject' | 'abstain') => {
    if (!selectedTicket) return;
    setIsVoting(true);
    try {
      const res = await api.castVote({
        ticketId: selectedTicket.ticketId,
        vote: voteValue,
        note: voteNote.trim() || 'Moderator consensus evaluation'
      });

      if (res.success) {
        triggerToast(`Recorded '${voteValue.toUpperCase()}' vote!`, 'success');
        setVoteNote('');
        void fetchTickets();
      }
    } catch (err) {
      console.error(err);
      triggerToast('Error filing consensus ballot', 'error');
    } finally {
      setIsVoting(false);
    }
  };

  const handleExecuteTicket = async () => {
    if (!selectedTicket) return;
    try {
      const res = await api.executeTicket(selectedTicket.ticketId, 'executed');
      if (res.success) {
        triggerToast('⚡ Policy proposal executed successfully!', 'success');
        void fetchTickets();
      }
    } catch (err) {
      console.error(err);
      triggerToast('Error executing proposal', 'error');
    }
  };

  const getStatusStamp = (status: string) => {
    const badgeStyle: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '4px 12px',
      borderRadius: '20px',
      fontSize: '10px',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      fontFamily: 'var(--font-heading)',
    };

    switch (status) {
      case 'approved':
        return (
          <span style={{ 
            ...badgeStyle, 
            backgroundColor: 'rgba(16, 185, 129, 0.15)', 
            color: '#10b981', 
            border: '1px solid rgba(16, 185, 129, 0.3)',
            boxShadow: '0 0 12px rgba(16, 185, 129, 0.2)' 
          }}>
            Approved
          </span>
        );
      case 'rejected':
        return (
          <span style={{ 
            ...badgeStyle, 
            backgroundColor: 'rgba(239, 68, 68, 0.15)', 
            color: '#ef4444', 
            border: '1px solid rgba(239, 68, 68, 0.3)',
            boxShadow: '0 0 12px rgba(239, 68, 68, 0.2)' 
          }}>
            Rejected
          </span>
        );
      case 'executed':
        return (
          <span style={{ 
            ...badgeStyle, 
            backgroundColor: 'var(--accent-bg-pill)', 
            color: 'var(--accent-gold)', 
            border: '1px solid var(--accent-border-pill)',
            boxShadow: '0 0 12px var(--accent-bg-pill)' 
          }}>
            Executed
          </span>
        );
      default:
        return (
          <span style={{ 
            ...badgeStyle, 
            backgroundColor: 'rgba(245, 158, 11, 0.15)', 
            color: '#fbbf24', 
            border: '1px solid rgba(245, 158, 11, 0.3)',
            boxShadow: '0 0 12px rgba(245, 158, 11, 0.2)' 
          }}>
            Pending
          </span>
        );
    }
  };

  const getSeverityBadge = (sev: string) => {
    const baseStyle: React.CSSProperties = {
      display: 'inline-block',
      padding: '3px 8px',
      borderRadius: '6px',
      fontSize: '10px',
      fontWeight: 600,
      fontFamily: 'var(--font-heading)',
    };
    switch (sev) {
      case 'critical':
        return <span style={{ ...baseStyle, backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.4)', boxShadow: '0 0 8px rgba(239, 68, 68, 0.2)' }}>CRITICAL</span>;
      case 'high':
        return <span style={{ ...baseStyle, backgroundColor: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.4)' }}>HIGH</span>;
      case 'medium':
        return <span style={{ ...baseStyle, backgroundColor: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.4)' }}>MEDIUM</span>;
      default:
        return <span style={{ ...baseStyle, backgroundColor: 'rgba(148, 163, 184, 0.2)', color: '#94a3b8', border: '1px solid rgba(148, 163, 184, 0.4)' }}>LOW</span>;
    }
  };

  const hasVoted = (ticket: ConsensusTicket) => {
    return ticket.votes.some(v => v.username === profile.username);
  };

  return (
    <div style={{ display: 'flex', gap: '16px', height: '100%', minHeight: 0, fontFamily: 'var(--font-body)' }}>
      {/* Sidebar List */}
      <div 
        className="glass-panel" 
        style={{ 
          width: '240px', 
          display: 'flex', 
          flexDirection: 'column', 
          minHeight: 0, 
          background: 'var(--glass-bg)', 
          borderColor: 'var(--glass-border)',
          borderRadius: '12px',
          overflow: 'hidden'
        }}
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: '11px', fontWeight: 700, color: 'var(--glass-text-muted)', letterSpacing: '0.05em' }}>
            PROPOSALS
          </span>
          <button 
            onClick={() => setIsCreating(true)} 
            className="glass-btn success"
            style={{ padding: '4px 10px', fontSize: '10px', borderRadius: '6px' }}
          >
            + NEW
          </button>
        </div>

        <div style={{ flexGrow: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {tickets.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--glass-text-muted)', textAlign: 'center', padding: '24px 0' }}>
              No proposals found.
            </div>
          ) : (
            tickets.map(tick => {
              const isSelected = selectedTicket?.ticketId === tick.ticketId;
              return (
                <div
                  key={tick.ticketId}
                  onClick={() => {
                    setSelectedTicket(tick);
                    setIsCreating(false);
                  }}
                  style={{
                    padding: '10px 12px',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    background: isSelected ? 'var(--accent-bg-pill)' : 'rgba(255, 255, 255, 0.03)',
                    border: isSelected ? '1px solid var(--accent-border-pill)' : '1px solid rgba(255, 255, 255, 0.05)',
                    color: 'var(--glass-text)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    transition: 'all 0.2s ease',
                    boxShadow: isSelected ? '0 0 15px var(--accent-bg-pill)' : 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
                    }
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px', fontFamily: 'var(--font-heading)' }}>
                      {tick.targetDisplay}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--glass-text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {tick.votes.length}v
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: isSelected ? 'var(--accent-gold)' : 'var(--glass-text-muted)' }}>
                    <span>{tick.actionType.replace('_', ' ').toUpperCase()}</span>
                    <span style={{ 
                      color: tick.status === 'approved' || tick.status === 'executed' ? '#10b981' : tick.status === 'rejected' ? '#ef4444' : '#fbbf24',
                      fontWeight: 700
                    }}>
                      {tick.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Detail & Work Pane */}
      <div 
        className="glass-panel" 
        style={{ 
          flexGrow: 1, 
          padding: '20px', 
          overflowY: 'auto', 
          backgroundColor: 'var(--glass-bg)', 
          borderColor: 'var(--glass-border)',
          borderRadius: '12px',
          minHeight: 0 
        }}
      >
        {isCreating ? (
          /* Ticket Creation Form */
          <form onSubmit={handleCreateTicket} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '10px', marginBottom: '4px' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '15px', fontWeight: 700, color: 'var(--accent-gold)' }}>
                FILE NEW CONSENSUS GOVERNANCE CASE
              </h3>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px' }}>
                <label className="glass-label">ACTION SPECIFICATION</label>
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value)}
                  className="glass-input"
                  style={{ cursor: 'pointer' }}
                >
                  <option value="ban_permanent">Permanent User Ban</option>
                  <option value="mute_long">Long-Term user Mute</option>
                  <option value="comment_removal">Mass Comment Removal</option>
                  <option value="thread_lock_cascade">Lock Thread Cascade</option>
                  <option value="settings_change">Alter Subreddit Rule/Setting</option>
                </select>
              </div>

              <div style={{ flex: '1 1 200px' }}>
                <label className="glass-label">SEVERITY RATING</label>
                <select
                  value={severity}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'low' || val === 'medium' || val === 'high' || val === 'critical') {
                      setSeverity(val);
                    }
                  }}
                  className="glass-input"
                  style={{ cursor: 'pointer' }}
                >
                  <option value="low">Low Risk</option>
                  <option value="medium">Medium Escalation</option>
                  <option value="high">High Security</option>
                  <option value="critical">Critical Threat</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 150px' }}>
                <label className="glass-label">TARGET TYPE</label>
                <select
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value)}
                  className="glass-input"
                  style={{ cursor: 'pointer' }}
                >
                  <option value="user">User Profile</option>
                  <option value="post">Post ID</option>
                  <option value="comment">Comment ID</option>
                  <option value="subreddit">Subreddit</option>
                </select>
              </div>

              <div style={{ flex: '2 1 250px' }}>
                <label className="glass-label">TARGET ID / USERNAME</label>
                <input
                  type="text"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  placeholder={targetType === 'user' ? 'e.g. u/SpamBot_99' : 'e.g. comment_1289'}
                  className="glass-input"
                />
              </div>
            </div>

            <div>
              <label className="glass-label">PRIMARY REASON & COMPLAINT</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Detail why this peer-reviewed consensus directive is required..."
                className="glass-input"
                style={{ height: '90px', resize: 'none', lineHeight: '1.5' }}
              />
            </div>

            <div>
              <label className="glass-label">EVIDENCE LOGS / LINKS</label>
              <textarea
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                placeholder="Inject link URLs, comment logs, or AutoMod audit evidence..."
                className="glass-input"
                style={{ height: '70px', resize: 'none', fontFamily: 'var(--font-mono)', fontSize: '11px', lineHeight: '1.5' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
              <button 
                type="button" 
                onClick={() => setIsCreating(false)} 
                className="glass-btn"
                style={{ minWidth: '100px' }}
              >
                CANCEL
              </button>
              <button 
                type="submit" 
                className="glass-btn success"
                style={{ fontWeight: 600, minWidth: '180px' }}
              >
                💾 LOCK CASE PROPOSAL
              </button>
            </div>
          </form>
        ) : selectedTicket ? (
          /* Active Ticket Details view */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '12px' }}>
              <div>
                <span 
                  style={{ 
                    fontSize: '9px', 
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    fontFamily: 'var(--font-mono)', 
                    padding: '3px 8px', 
                    backgroundColor: 'var(--accent-bg-pill)', 
                    color: 'var(--accent-gold)',
                    borderRadius: '4px',
                    border: '1px solid var(--accent-border-pill)'
                  }}
                >
                  GOVERNANCE RECORD #{selectedTicket.ticketId}
                </span>
                <h3 style={{ fontSize: '20px', fontWeight: 700, marginTop: '8px', fontFamily: 'var(--font-heading)', color: '#fff' }}>
                  {selectedTicket.targetDisplay}
                </h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                {getStatusStamp(selectedTicket.status)}
                <span style={{ fontSize: '11px', color: 'var(--glass-text-muted)' }}>
                  Proposed by: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)' }}>{selectedTicket.proposedBy}</span>
                </span>
              </div>
            </div>

            {/* Grid stats */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div 
                className="glass-panel" 
                style={{ 
                  flex: '1 1 200px', 
                  padding: '12px', 
                  backgroundColor: 'rgba(255, 255, 255, 0.02)', 
                  borderColor: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '10px' 
                }}
              >
                <span className="glass-label" style={{ marginBottom: '4px' }}>PROPOSED ACTION</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#f87171', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                  {selectedTicket.actionType.toUpperCase().replace('_', ' ')}
                </span>
              </div>

              <div 
                className="glass-panel" 
                style={{ 
                  flex: '1 1 200px', 
                  padding: '12px', 
                  backgroundColor: 'rgba(255, 255, 255, 0.02)', 
                  borderColor: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '10px' 
                }}
              >
                <span className="glass-label" style={{ marginBottom: '4px' }}>SEVERITY INDEX</span>
                <div style={{ display: 'flex', alignItems: 'center', height: '20px' }}>
                  {getSeverityBadge(selectedTicket.severity)}
                </div>
              </div>
            </div>

            {/* Reason & Evidence Panels */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <span className="glass-label">COMPLAINT EXPLANATION</span>
                <div 
                  className="glass-panel" 
                  style={{ 
                    padding: '12px 16px', 
                    backgroundColor: 'rgba(0, 0, 0, 0.2)', 
                    borderColor: 'rgba(255, 255, 255, 0.05)',
                    fontSize: '13px', 
                    lineHeight: '1.6',
                    color: 'var(--glass-text)',
                    borderRadius: '8px'
                  }}
                >
                  {selectedTicket.reason}
                </div>
              </div>

              {selectedTicket.evidence && (
                <div>
                  <span className="glass-label">EVIDENCE FILE DETAILED</span>
                  <div 
                    className="glass-panel" 
                    style={{ 
                      padding: '12px 16px', 
                      backgroundColor: 'rgba(0, 0, 0, 0.3)', 
                      borderColor: 'rgba(255, 255, 255, 0.05)',
                      fontSize: '12px', 
                      fontFamily: 'var(--font-mono)', 
                      color: '#93c5fd',
                      lineHeight: '1.5',
                      borderRadius: '8px',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all'
                    }}
                  >
                    {selectedTicket.evidence}
                  </div>
                </div>
              )}
            </div>

            {/* Voting Progression Telemetry */}
            <div 
              className="glass-panel" 
              style={{ 
                padding: '14px 16px', 
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                borderColor: 'rgba(255, 255, 255, 0.06)',
                borderRadius: '10px'
              }}
            >
              <span className="glass-label" style={{ marginBottom: '8px' }}>BALLOT CONSENSUS TIMELINE</span>
              <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flexGrow: 1 }}>
                  <ProgressMeter 
                    current={selectedTicket.votes.filter(v => v.vote === 'approve').length}
                    max={selectedTicket.requiredVotes}
                    color={selectedTicket.votes.filter(v => v.vote === 'approve').length >= selectedTicket.requiredVotes ? 'green' : 'amber'}
                  />
                </div>
                <div 
                  style={{ 
                    fontSize: '12px', 
                    fontWeight: 600,
                    fontFamily: 'var(--font-heading)', 
                    color: selectedTicket.votes.filter(v => v.vote === 'approve').length >= selectedTicket.requiredVotes ? '#10b981' : '#fbbf24', 
                    whiteSpace: 'nowrap',
                    textShadow: selectedTicket.votes.filter(v => v.vote === 'approve').length >= selectedTicket.requiredVotes ? '0 0 10px rgba(16, 185, 129, 0.3)' : '0 0 10px rgba(245, 158, 11, 0.3)'
                  }}
                >
                  Approvals: {selectedTicket.votes.filter(v => v.vote === 'approve').length} / {selectedTicket.requiredVotes} req
                </div>
              </div>
            </div>

            {/* Execute Proposal Button for Approved Tickets */}
            {selectedTicket.status === 'approved' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '12px' }}>
                <button
                  onClick={handleExecuteTicket}
                  className="glass-btn success"
                  style={{ minWidth: '180px', fontWeight: 600, padding: '10px' }}
                >
                  ⚡ EXECUTE DECISION DIRECTIVE
                </button>
              </div>
            )}

            {/* Active ballot castings */}
            {selectedTicket.status === 'pending' && (
              <div 
                className="glass-panel" 
                style={{ 
                  padding: '16px', 
                  background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(245, 158, 11, 0.02) 100%)', 
                  borderColor: 'rgba(245, 158, 11, 0.25)',
                  borderRadius: '10px',
                  boxShadow: '0 0 20px rgba(245, 158, 11, 0.05)'
                }}
              >
                {hasVoted(selectedTicket) ? (
                  <div style={{ fontSize: '13px', color: '#fbbf24', textAlign: 'center', fontWeight: 600, fontFamily: 'var(--font-heading)', letterSpacing: '0.02em' }}>
                    ✔ YOUR DECISION BALLOT IS ALREADY REGISTERED. AWAITING PEER ALIGNMENT.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <span className="glass-label" style={{ color: '#fbbf24' }}>SUBMIT YOUR OFFICIAL BALLOT VOTE</span>
                    <input 
                      type="text"
                      value={voteNote}
                      onChange={(e) => setVoteNote(e.target.value)}
                      placeholder="Inject optional justification notes to support your decision..."
                      className="glass-input"
                      style={{ fontSize: '13px' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                      <button 
                        onClick={() => handleCastVote('reject')}
                        disabled={isVoting}
                        className="glass-btn danger"
                        style={{ minWidth: '110px' }}
                      >
                        ❌ REJECT
                      </button>
                      <button 
                        onClick={() => handleCastVote('approve')}
                        disabled={isVoting}
                        className="glass-btn success"
                        style={{ minWidth: '130px', fontWeight: 600 }}
                      >
                        🟢 APPROVE
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Vote log ticker */}
            <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '12px' }}>
              <span className="glass-label" style={{ marginBottom: '6px' }}>BALLOT VOTERS LOG</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '120px', overflowY: 'auto' }}>
                {selectedTicket.votes.length === 0 ? (
                  <div style={{ fontSize: '11px', color: 'var(--glass-text-muted)', fontStyle: 'italic', padding: '6px 0' }}>
                    No votes recorded yet on this active ballot.
                  </div>
                ) : (
                  selectedTicket.votes.map((v, i) => (
                    <div 
                      key={i} 
                      className="glass-panel" 
                      style={{ 
                        padding: '8px 12px', 
                        fontSize: '11px', 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        backgroundColor: 'rgba(255, 255, 255, 0.02)',
                        borderColor: 'rgba(255, 255, 255, 0.04)',
                        borderRadius: '6px'
                      }}
                    >
                      <span style={{ fontWeight: 600, color: '#fff', width: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {v.username}
                      </span>
                      <span style={{ fontStyle: 'italic', color: 'var(--glass-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexGrow: 1, padding: '0 12px' }}>
                        "{v.note}"
                      </span>
                      <span style={{ 
                        color: v.vote === 'approve' ? '#10b981' : '#ef4444', 
                        fontFamily: 'var(--font-heading)', 
                        fontWeight: 700,
                        fontSize: '10px' 
                      }}>
                        [{v.vote.toUpperCase()}]
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: '12px' }}>
            <span style={{ fontSize: '42px', filter: 'drop-shadow(0 0 15px var(--accent-border-pill))' }}>⚖️</span>
            <span style={{ fontSize: '13px', color: 'var(--glass-text-muted)', fontFamily: 'var(--font-heading)', textAlign: 'center', lineHeight: '1.5' }}>
              THE CONSENSUS DESK IS SILENT.<br/>
              <span style={{ fontSize: '11px' }}>SELECT AN ACTIVE PROPOSAL OR LOG A NEW ACTION.</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
