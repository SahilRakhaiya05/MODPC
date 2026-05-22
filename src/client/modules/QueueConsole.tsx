/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import React, { useState, useEffect } from 'react';
import { QueueItem, ModeratorProfile } from '../types';
import { api } from '../utils/api';
import { SeverityBadge } from '../components/SeverityBadge';
import { UserDossier } from '../components/UserDossier';

type QueueConsoleProps = {
  profile: ModeratorProfile;
  onProfileUpdate: (p: ModeratorProfile) => void;
  triggerToast: (msg: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
  mode: 'demo' | 'live';
};

type LiveRule = {
  id: string;
  shortName: string;
};

export const QueueConsole: React.FC<QueueConsoleProps> = ({ profile, onProfileUpdate, triggerToast, mode }) => {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
  const [escalateNote, setEscalateNote] = useState('');
  const [isEscalating, setIsEscalating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [liveRules, setLiveRules] = useState<LiveRule[]>([]);
  const [confirmLiveAction, setConfirmLiveAction] = useState(false);

  const fetchQueue = async () => {
    setIsLoading(true);
    try {
      const data = await api.getQueue();
      setQueue(data.queue);
      if (selectedItem) {
        const updated = data.queue.find(q => q.itemId === selectedItem.itemId);
        setSelectedItem(updated || null);
      }
    } catch (err) {
      console.error(err);
      triggerToast('Error loading queue', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLiveRules = async () => {
    try {
      const res = await api.getLiveRules();
      setLiveRules(res.rules);
    } catch (err) {
      console.warn('Could not load live rules dynamically', err);
    }
  };

  useEffect(() => {
    void fetchQueue();
    void fetchLiveRules();
  }, [mode]);

  const handleAction = async (actionType: 'approve' | 'remove' | 'escalate') => {
    if (!selectedItem) return;

    if (actionType === 'escalate' && !isEscalating) {
      setIsEscalating(true);
      return;
    }

    const requiresLiveConfirmation = selectedItem.itemId.startsWith('live:') && actionType !== 'escalate';
    if (requiresLiveConfirmation && !confirmLiveAction) {
      triggerToast('Confirm the guarded live action before changing Reddit content.', 'warning');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.queueAction({
        itemId: selectedItem.itemId,
        actionType,
        confirmation: confirmLiveAction,
        ...(actionType === 'escalate' ? { notes: escalateNote } : {})
      });

      if (res.success) {
        if (mode === 'live') {
          triggerToast(
            actionType === 'escalate' 
              ? '🗳️ Live item escalated to Consensus Board!' 
              : `✅ Live content successfully actioned as [${actionType.toUpperCase()}] on Reddit!`,
            'success'
          );
        } else {
          triggerToast(
            actionType === 'escalate' 
              ? '🗳️ Item escalated to Consensus Board!' 
              : `✅ Content successfully marked as [${actionType.toUpperCase()}]`,
            'success'
          );
        }
        
        onProfileUpdate(res.moderatorProfile);
        setSelectedItem(null);
        setIsEscalating(false);
        setEscalateNote('');
        setConfirmLiveAction(false);
        void fetchQueue();
      }
    } catch (err) {
      console.error(err);
      triggerToast(err instanceof Error ? err.message : 'Error resolving queue item', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Filter queue items depending on 'demo' vs 'live' mode
  const filteredQueue = queue.filter(item => {
    const isLiveItem = item.itemId.startsWith('live:');
    return mode === 'live' ? isLiveItem : !isLiveItem;
  });

  return (
    <div style={{ display: 'flex', gap: '16px', height: '100%', minHeight: 0, fontFamily: 'var(--font-body)' }}>
      {/* Sidebar priority queue list */}
      <div 
        className="glass-panel" 
        style={{ 
          width: '260px', 
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
            {mode === 'live' ? 'LIVE SUBREDDIT FEED' : 'PRIORITY QUEUE'}
          </span>
          <span 
            style={{ 
              padding: '3px 8px', 
              fontSize: '10px', 
              color: mode === 'live' ? '#10b981' : '#f59e0b', 
              fontWeight: 700, 
              backgroundColor: mode === 'live' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)', 
              border: mode === 'live' ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(245, 158, 11, 0.25)', 
              borderRadius: '20px',
              fontFamily: 'var(--font-mono)'
            }}
          >
            {filteredQueue.length} LEFT
          </span>
        </div>

        <div style={{ flexGrow: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {isLoading && filteredQueue.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--glass-text-muted)', textAlign: 'center', padding: '24px 0' }}>
              🔄 TRIAGING LIVE STREAM...
            </div>
          ) : filteredQueue.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--glass-text-muted)', textAlign: 'center', padding: '32px 12px', fontFamily: 'var(--font-heading)', lineHeight: '1.6' }}>
              ☀️ THE DESK IS SILENT.<br/>
              <span style={{ fontSize: '10px', color: '#10b981' }}>NO ITEMS AWAITING ACTION</span>
            </div>
          ) : (
            filteredQueue.map(item => {
              const isSelected = selectedItem?.itemId === item.itemId;
              return (
                <div
                  key={item.itemId}
                  onClick={() => {
                    setSelectedItem(item);
                    setIsEscalating(false);
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
                    <span style={{ fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px', fontFamily: 'var(--font-heading)' }}>
                      {item.author}
                    </span>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#f87171', fontFamily: 'var(--font-mono)' }}>
                      {item.reportCount}r
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: isSelected ? 'var(--accent-gold)' : 'var(--glass-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic' }}>
                    {item.title || item.bodyExcerpt}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                    <span 
                      style={{ 
                        fontSize: '9px', 
                        fontWeight: 600,
                        fontFamily: 'var(--font-mono)', 
                        backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                        color: 'var(--accent-gold)', 
                        padding: '1px 6px',
                        borderRadius: '4px',
                        border: '1px solid rgba(255, 255, 255, 0.08)'
                      }}
                    >
                      {item.itemType.toUpperCase()}
                    </span>
                    <div style={{ transform: 'scale(0.85)', transformOrigin: 'right center' }}>
                      <SeverityBadge score={item.severityScore} />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Workspace triage detail pane */}
      <div 
        className="glass-panel" 
        style={{ 
          flexGrow: 1, 
          padding: '20px', 
          display: 'flex', 
          flexDirection: 'column', 
          backgroundColor: 'var(--glass-bg)', 
          borderColor: 'var(--glass-border)',
          borderRadius: '12px',
          minHeight: 0 
        }}
      >
        {selectedItem ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', height: '100%' }}>
            
            {/* Live Mode Security Warning Banner */}
            {mode === 'live' && (
              <div 
                style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontSize: '11px',
                  color: '#f87171',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <span>⚠️</span> ACTIVE DEPLOYMENT: ACTIONS AFFECT THE LIVE SUBREDDIT DIRECTLY
              </div>
            )}

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '12px' }}>
              <div>
                <span 
                  style={{ 
                    fontSize: '9px', 
                    fontWeight: 700, 
                    letterSpacing: '0.1em',
                    fontFamily: 'var(--font-mono)', 
                    padding: '3px 8px', 
                    backgroundColor: mode === 'live' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)', 
                    color: mode === 'live' ? '#34d399' : '#f87171',
                    borderRadius: '4px',
                    border: mode === 'live' ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)'
                  }}
                >
                  {mode === 'live' ? 'LIVE SUBREDDIT ITEM' : 'REPORTED QUEUE BLOCK'} #{selectedItem.itemId}
                </span>
                <h3 style={{ fontSize: '18px', fontWeight: 700, marginTop: '8px', fontFamily: 'var(--font-heading)', color: '#fff' }}>
                  {selectedItem.title || `Contribution post by ${selectedItem.author}`}
                </h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                <SeverityBadge score={selectedItem.severityScore} />
                <span style={{ fontSize: '11px', color: 'var(--glass-text-muted)' }}>
                  Author: <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#f87171' }}>{selectedItem.author}</span>
                </span>
              </div>
            </div>

            {/* Content + author dossier side-by-side */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 240px', gap: '12px' }}>
              <div
                className="glass-panel"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.35)',
                  borderColor: 'rgba(255, 255, 255, 0.05)',
                  padding: '16px',
                  fontSize: '13px',
                  fontFamily: 'var(--font-mono)',
                  color: '#93c5fd',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                  borderLeft: '4px solid #3b82f6',
                  maxHeight: '220px',
                  overflowY: 'auto',
                  borderRadius: '8px',
                }}
              >
                {selectedItem.bodyExcerpt}
              </div>
              <UserDossier username={selectedItem.author} />
            </div>

            {/* Report Reasons Grid */}
            <div>
              <span className="glass-label">⚠️ PRIMARY ENFORCEMENT ALERTS</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {selectedItem.reports.map((rep, idx) => (
                  <span 
                    key={idx} 
                    className="glass-panel" 
                    style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.12)',
                      borderColor: 'rgba(239, 68, 68, 0.25)',
                      color: '#f87171',
                      fontSize: '10px',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontWeight: 600,
                      fontFamily: 'var(--font-heading)'
                    }}
                  >
                    {rep.reason.toUpperCase()} ({rep.count}x Reports)
                  </span>
                ))}
              </div>
            </div>

            {/* Rule Hints suggestions */}
            {selectedItem.suggestedRuleIds.length > 0 && (
              <div>
                <span className="glass-label">⚡ SYSTEM SUGGESTED POLICIES</span>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {selectedItem.suggestedRuleIds.map(rule => {
                    const matchedRule = liveRules.find(r => r.id === rule || r.shortName === rule);
                    const ruleLabel = matchedRule 
                      ? matchedRule.shortName.toUpperCase() 
                      : rule.replace('rule-', 'RULE ').toUpperCase();
                    return (
                      <span 
                        key={rule} 
                        className="glass-panel" 
                        style={{
                          backgroundColor: 'rgba(56, 189, 248, 0.12)',
                          borderColor: 'rgba(56, 189, 248, 0.25)',
                          color: '#38bdf8',
                          fontSize: '10px',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontFamily: 'var(--font-heading)',
                          fontWeight: 600
                        }}
                      >
                        💡 Suggestion: {ruleLabel}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Shift Actions */}
            {isEscalating ? (
              /* Escalation panel */
              <div 
                className="glass-panel" 
                style={{ 
                  padding: '14px', 
                  background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(239, 68, 68, 0.02) 100%)', 
                  borderColor: 'rgba(239, 68, 68, 0.25)',
                  borderRadius: '10px',
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '10px' 
                }}
              >
                <span className="glass-label" style={{ color: '#f87171' }}>EXPLAIN REASON FOR SECURITY ESCALATION</span>
                <input
                  type="text"
                  value={escalateNote}
                  onChange={(e) => setEscalateNote(e.target.value)}
                  placeholder="Detail why permanent ban or peer-group voting is required..."
                  className="glass-input"
                  style={{ fontSize: '13px' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button 
                    onClick={() => {
                      setIsEscalating(false);
                      setEscalateNote('');
                    }} 
                    className="glass-btn"
                    style={{ minWidth: '90px' }}
                  >
                    CANCEL
                  </button>
                  <button 
                    onClick={() => handleAction('escalate')} 
                    className="glass-btn danger"
                    style={{ fontWeight: 600, minWidth: '160px' }}
                  >
                    ⚠️ COMPOSE ESCALATION
                  </button>
                </div>
              </div>
            ) : (
              /* Core Action Buttons */
              <div style={{ display: 'grid', gap: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '14px', marginTop: 'auto' }}>
                {selectedItem.itemId.startsWith('live:') && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--muted)', fontSize: '12px', fontWeight: 800 }}>
                    <input
                      type="checkbox"
                      checked={confirmLiveAction}
                      onChange={(event) => setConfirmLiveAction(event.target.checked)}
                    />
                    Confirm this approve/remove action will change live Reddit content.
                  </label>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                  <button
                    onClick={() => handleAction('escalate')}
                    className="glass-btn"
                    style={{ color: 'var(--accent-gold)', borderColor: 'var(--accent-border-pill)', minWidth: '150px', fontWeight: 600 }}
                  >
                    Escalate case
                  </button>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={() => handleAction('remove')}
                      className="glass-btn danger"
                      style={{ minWidth: '140px' }}
                      disabled={selectedItem.itemId.startsWith('live:') && !confirmLiveAction}
                    >
                      Remove content
                    </button>
                    <button
                      onClick={() => handleAction('approve')}
                      className="glass-btn success"
                      style={{ minWidth: '140px', fontWeight: 600 }}
                      disabled={selectedItem.itemId.startsWith('live:') && !confirmLiveAction}
                    >
                      Approve content
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Team coverage strip (Only show in Demo Mode) */}
            {mode === 'demo' ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--glass-text-muted)', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '8px', marginTop: '4px' }}>
                <span>Your Review Count: <strong style={{ color: '#fff' }}>{profile.queueReviewed}</strong></span>
                <span style={{ color: '#10b981', fontWeight: 600 }}>+15 XP per cleared ticket</span>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#f87171', fontFamily: 'var(--font-mono)', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '8px', marginTop: '4px' }}>
                <span>OPERATING MODE: LIVE DEPLOYMENT</span>
                <span>TRAINING STATS & XP CALCULATIONS ARE PAUSED</span>
              </div>
            )}

          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: '12px' }}>
            <span style={{ fontSize: '42px', filter: 'drop-shadow(0 0 15px var(--accent-border-pill))' }}>🗃️</span>
            <span style={{ fontSize: '13px', color: 'var(--glass-text-muted)', fontFamily: 'var(--font-heading)', textAlign: 'center', lineHeight: '1.5' }}>
              {mode === 'live' ? 'LIVE DEPLOYMENT WORKSPACE ACTIVE.' : 'PRIORITIZATION GRID COMPLIANT.'}<br/>
              <span style={{ fontSize: '11px' }}>SELECT AN ITEM FROM THE LEFT CONSOLE TO START RESOLVING.</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
