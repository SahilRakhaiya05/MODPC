/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef } from 'react';
import { TrainingScenario, ModeratorProfile } from '../types';
import { api } from '../utils/api';
import { ProgressMeter } from '../components/ProgressMeter';

interface ModAcademyProps {
  profile: ModeratorProfile;
  onProfileUpdate: (p: ModeratorProfile) => void;
  triggerToast: (msg: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
}

const SUBREDDIT_RULES = [
  { id: 'rule-1', title: 'Rule 1: Civility & Respect' },
  { id: 'rule-2', title: 'Rule 2: Relevance & Off-Topic' },
  { id: 'rule-3', title: 'Rule 3: Commercial Spam & Promo' },
  { id: 'rule-4', title: 'Rule 4: Repost & Duplicate Content' },
  { id: 'rule-5', title: 'Rule 5: User Safety & Self-Harm' }
];

export const ModAcademy: React.FC<ModAcademyProps> = ({ profile, onProfileUpdate, triggerToast }) => {
  const [scenario, setScenario] = useState<TrainingScenario | null>(null);
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [selectedRuleId, setSelectedRuleId] = useState<string>('');
  const [confidence, setConfidence] = useState<number>(3); // 1-5 scale
  const [isLoading, setIsLoading] = useState(false);
  
  // Scoring / Feedback Overlay state
  const [feedbackData, setFeedbackData] = useState<{
    score: number;
    xpAwarded: number;
    isCorrect: boolean;
    feedback: string;
  } | null>(null);

  const startTime = useRef<number>(0);

  // Fetch next scenario
  const fetchScenario = async () => {
    setIsLoading(true);
    try {
      const data = await api.getNextScenario();
      setScenario(data.scenario);
      setSelectedAction('');
      setSelectedRuleId('');
      setConfidence(3);
      setFeedbackData(null);
      startTime.current = Date.now();
    } catch (err) {
      console.error(err);
      triggerToast('Error loading training scenario', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchScenario();
  }, []);

  const handleSubmit = async () => {
    if (!scenario) return;
    if (!selectedAction) {
      triggerToast('Please select an enforcement action!', 'warning');
      return;
    }
    if (selectedAction !== 'skip' && !selectedRuleId) {
      triggerToast('Please assign a supporting subreddit rule!', 'warning');
      return;
    }

    setIsLoading(true);
    const latencyMs = Date.now() - startTime.current;

    try {
      const result = await api.submitAttempt({
        scenarioId: scenario.scenarioId,
        chosenAction: selectedAction,
        chosenRuleId: selectedAction === 'skip' ? 'none' : selectedRuleId,
        confidence,
        latencyMs
      });

      if (result.success) {
        setFeedbackData({
          score: result.attempt.score,
          xpAwarded: result.attempt.xpAwarded,
          isCorrect: result.attempt.isCorrect,
          feedback: result.attempt.feedback
        });
        
        onProfileUpdate(result.moderatorProfile);
        
        if (result.leveledUp) {
          triggerToast(`🎉 LEVEL UP! You are now level ${result.moderatorProfile.trainingLevel}!`, 'success');
        } else {
          triggerToast(result.attempt.isCorrect ? '✅ Evaluation matches database!' : '⚠️ Evaluation discrepancy logged.', result.attempt.isCorrect ? 'success' : 'warning');
        }
      }
    } catch (err) {
      console.error(err);
      triggerToast('Error submitting training action', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // XP Progress Calculation
  const nextLevelXp = Math.round(100 * Math.pow(profile.trainingLevel, 1.5));
  const prevLevelXp = profile.trainingLevel > 1 
    ? Math.round(100 * Math.pow(profile.trainingLevel - 1, 1.5)) 
    : 0;
  const currentLevelProgress = profile.xp - prevLevelXp;
  const currentLevelMax = nextLevelXp - prevLevelXp;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', height: '100%', fontFamily: "var(--font-body)" }}>
      {/* Academy HUD */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '14px',
        padding: '12px 18px',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '24px' }}>🎓</span>
          <div>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: '12px', color: 'var(--accent-gold)', letterSpacing: '0.4px' }}>
              RANK: {profile.roleLabel.toUpperCase()}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>
              Level {profile.trainingLevel} - Subreddit Shift Simulator
            </div>
          </div>
        </div>

        <div style={{ width: '180px' }}>
          <ProgressMeter 
            current={currentLevelProgress} 
            max={currentLevelMax} 
            color="purple" 
          />
        </div>

        <div style={{ display: 'flex', gap: '20px', fontSize: '11px', fontWeight: 600, color: '#94a3b8' }}>
          <div>
            ACCURACY:{' '}
            <span style={{ color: '#34d399' }}>
              {profile.totalScenarios > 0 
                ? `${Math.round((profile.correctScenarios / profile.totalScenarios) * 100)}%` 
                : '0%'}
            </span>
          </div>
          <div>
            ATTEMPTS:{' '}
            <span style={{ color: '#f8fafc' }}>{profile.totalScenarios}</span>
          </div>
        </div>
      </div>

      {/* Main Sandbox Frame */}
      {isLoading && !scenario ? (
        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', minHeight: 0 }}>
          <span style={{ fontSize: '24px', animation: 'spin 1.5s infinite linear' }}>🔄</span>
          <span style={{ fontSize: '12px', color: '#94a3b8', fontFamily: "'Fira Code', monospace" }}>SYNCHRONIZING CASE FLAGGERS...</span>
        </div>
      ) : scenario ? (
        <div style={{ display: 'flex', flexGrow: 1, gap: '14px', minHeight: 0, flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: '14px', flexGrow: 1, minHeight: 0 }}>
            {/* Case file body */}
            <div style={{
              flexGrow: 2,
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '14px',
              padding: '16px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', paddingBottom: '8px' }}>
                <span style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  fontFamily: "var(--font-heading)",
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  color: '#f87171',
                  letterSpacing: '0.4px'
                }}>
                  {scenario.sourceType.toUpperCase()} CASE FILE #{scenario.scenarioId}
                </span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>
                  DIFFICULTY: <span style={{ color: scenario.difficulty === 'easy' ? '#10b981' : scenario.difficulty === 'medium' ? '#fbbf24' : '#ef4444' }}>{scenario.difficulty.toUpperCase()}</span>
                </span>
              </div>

              {/* Title & Author */}
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', marginBottom: '4px', letterSpacing: '-0.2px' }}>
                  {scenario.title}
                </h3>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  Reported User Account:{' '}
                  <span style={{ fontFamily: "'Fira Code', monospace", color: '#ef4444', background: 'rgba(239, 68, 68, 0.08)', padding: '1px 5px', borderRadius: '4px' }}>
                    {scenario.authorNameHash}
                  </span>
                </span>
              </div>

              {/* Body Excerpt */}
              <div style={{
                background: 'rgba(0, 0, 0, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '12px',
                padding: '16px',
                fontSize: '13px',
                lineHeight: '1.6',
                color: '#cbd5e1',
                whiteSpace: 'pre-wrap',
                flexGrow: 1,
                borderLeft: '4px solid var(--accent-gold)'
              }}>
                {scenario.bodyExcerpt}
              </div>

              {/* Red Flags / Reports */}
              <div>
                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent-gold)', fontFamily: "var(--font-heading)", letterSpacing: '0.6px', display: 'block', marginBottom: '8px' }}>
                  🚨 INCIDENT REPORT SIGNALS:
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {scenario.reportReasons.map((r, i) => (
                    <span key={i} style={{
                      backgroundColor: 'rgba(245, 158, 11, 0.12)',
                      color: '#fbbf24',
                      border: '1px solid rgba(245, 158, 11, 0.25)',
                      fontSize: '10px',
                      fontWeight: 500,
                      padding: '3px 10px',
                      borderRadius: '20px'
                    }}>
                      FLAG: {r}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Shift controls */}
            <div style={{ flexGrow: 1, width: '240px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Action grid */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '14px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <span className="glass-label">ENFORCEMENT DISPATCH</span>
                {[
                  { id: 'approve', label: 'APPROVE CONTENT', color: '#34d399', icon: '🟢' },
                  { id: 'remove', label: 'REMOVE CONTENT', color: '#f87171', icon: '🔴' },
                  { id: 'filter', label: 'FILTER FOR REVIEW', color: '#fbbf24', icon: '🟡' },
                  { id: 'escalate', label: 'ESCALATE TO PEERS', color: '#c084fc', icon: '🟣' },
                  { id: 'skip', label: 'SKIP / PASS SHIFT', color: '#94a3b8', icon: '⚪' }
                ].map(act => {
                  const isSelected = selectedAction === act.id;
                  return (
                    <button
                      key={act.id}
                      onClick={() => {
                        setSelectedAction(act.id);
                        if (act.id === 'skip') setSelectedRuleId('none');
                      }}
                      className="glass-btn"
                      style={{
                        justifyContent: 'flex-start',
                        width: '100%',
                        fontSize: '11px',
                        background: isSelected ? 'var(--accent-bg-pill)' : 'rgba(255, 255, 255, 0.03)',
                        borderColor: isSelected ? 'var(--accent-border-pill)' : 'rgba(255, 255, 255, 0.06)',
                        color: isSelected ? 'var(--accent-gold)' : act.color,
                        fontWeight: isSelected ? 700 : 500,
                        transform: isSelected ? 'scale(1.02)' : 'none'
                      }}
                    >
                      <span style={{ marginRight: '6px' }}>{act.icon}</span> {act.label}
                    </button>
                  );
                })}
              </div>

              {/* Supporting Rules */}
              {selectedAction && selectedAction !== 'skip' && (
                <div style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '14px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  flexGrow: 1,
                  overflowY: 'auto'
                }}>
                  <span className="glass-label">SUPPORTING STANDARD RULE</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {SUBREDDIT_RULES.map(rule => {
                      const isSelected = selectedRuleId === rule.id;
                      return (
                        <button
                          key={rule.id}
                          onClick={() => setSelectedRuleId(rule.id)}
                          className="glass-btn"
                          style={{
                            justifyContent: 'flex-start',
                            textAlign: 'left',
                            width: '100%',
                            fontSize: '10px',
                            padding: '6px 10px',
                            background: isSelected ? 'var(--accent-bg-pill)' : 'rgba(255, 255, 255, 0.02)',
                            borderColor: isSelected ? 'var(--accent-border-pill)' : 'rgba(255, 255, 255, 0.05)',
                            color: isSelected ? 'var(--accent-gold)' : '#cbd5e1'
                          }}
                        >
                          {isSelected ? '🎯' : '◽'} {rule.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Confidence Scale */}
              {selectedAction && (
                <div style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '14px',
                  padding: '12px'
                }}>
                  <span className="glass-label">CONFIDENCE INDEX GUESS</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                    {[1, 2, 3, 4, 5].map(lvl => {
                      const isSelected = confidence === lvl;
                      return (
                        <button
                          key={lvl}
                          onClick={() => setConfidence(lvl)}
                          className="glass-btn"
                          style={{
                            width: '30px',
                            height: '30px',
                            padding: 0,
                            borderRadius: '8px',
                            background: isSelected ? 'var(--accent-bg-pill)' : 'rgba(255, 255, 255, 0.03)',
                            borderColor: isSelected ? 'var(--accent-border-pill)' : 'rgba(255, 255, 255, 0.05)',
                            color: isSelected ? 'var(--accent-gold)' : '#cbd5e1',
                            fontWeight: 700
                          }}
                        >
                          {lvl}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#64748b', marginTop: '6px', fontWeight: 500 }}>
                    <span>GUESS</span>
                    <span>CERTAIN</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Submit block */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 0' }}>
            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className="glass-btn primary"
              style={{
                width: '180px',
                padding: '10px',
                fontSize: '12px',
                fontWeight: 700
              }}
            >
              🚀 COMMIT ACTION
            </button>
          </div>
        </div>
      ) : (
        <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px' }}>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>No active scenarios loaded. Open Control Panel settings to factory reset.</span>
        </div>
      )}

      {/* Feedback modal (glassmorphic overlay dialog) */}
      {feedbackData && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(3, 0, 20, 0.6)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          zIndex: 500,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div className="glass-window glass-panel" style={{ width: '420px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 18px',
              background: feedbackData.isCorrect 
                ? 'rgba(16, 185, 129, 0.15)'
                : 'rgba(245, 158, 11, 0.15)',
              borderBottom: '1px solid rgba(255,255,255,0.08)'
            }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: feedbackData.isCorrect ? '#34d399' : '#fbbf24', fontFamily: "var(--font-heading)", letterSpacing: '0.4px' }}>
                {feedbackData.isCorrect ? '✓ EVALUATION ACCURACY MATCH' : '⚠ DISCREPANCY DETECTED'}
              </span>
              <button style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer' }} onClick={fetchScenario}>×</button>
            </div>

            {/* Body */}
            <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span style={{ fontSize: '36px' }}>{feedbackData.isCorrect ? '🏆' : '⚖️'}</span>
                <div>
                  <h4 style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: '14px', color: '#fff' }}>
                    {feedbackData.isCorrect ? 'Subsystem Calibrated' : 'Discrepancy Logged'}
                  </h4>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                    XP Earned: <span style={{ color: 'var(--accent-gold)', fontWeight: 700 }}>+{feedbackData.xpAwarded} XP</span>
                  </div>
                </div>
              </div>

              {/* Rationale feedback */}
              <div style={{
                backgroundColor: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '10px',
                padding: '10px 14px',
                fontSize: '12px',
                lineHeight: '1.5',
                color: '#cbd5e1',
                maxHeight: '160px',
                overflowY: 'auto'
              }}>
                {feedbackData.feedback}
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 18px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button className="glass-btn primary" onClick={fetchScenario} style={{ width: '130px', fontWeight: 600 }}>
                NEXT CASE ⏩
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
