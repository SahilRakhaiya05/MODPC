import React, { useState } from 'react';
import { AppSettings, ModeratorProfile } from '../types';
import { api } from '../utils/api';

interface SettingsPanelProps {
  settings: AppSettings;
  onSettingsUpdate: (s: AppSettings) => void;
  profile: ModeratorProfile;
  triggerToast: (msg: string, type?: 'success' | 'warning' | 'error') => void;
  onReset: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  onSettingsUpdate,
  profile,
  triggerToast,
  onReset
}) => {
  const [subredditName, setSubredditName] = useState(settings.subredditName);
  const [consensusThresholdMode, setConsensusThresholdMode] = useState(settings.consensusThresholdMode);
  const [consensusFixedCount, setConsensusFixedCount] = useState(settings.consensusFixedCount);
  const [trainingRequiredLevel, setTrainingRequiredLevel] = useState(settings.trainingRequiredLevel);
  const [themeMode, setThemeMode] = useState(settings.themeMode);
  const [isLoading, setIsLoading] = useState(false);
  
  // Custom Modern Modal confirmation state
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await api.updateSettings({
        subredditName,
        consensusThresholdMode,
        consensusFixedCount: Number(consensusFixedCount),
        trainingRequiredLevel: Number(trainingRequiredLevel),
        themeMode
      });

      if (res.success) {
        onSettingsUpdate(res.settings);
        triggerToast('💾 Configurations written to AppSettings Registry!', 'success');
      }
    } catch (err) {
      console.error(err);
      triggerToast('Error saving settings', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetExecute = async () => {
    setShowConfirmModal(false);
    setIsLoading(true);
    try {
      const res = await api.resetDb();
      if (res.success) {
        triggerToast('🔄 System re-initialized! Syncing new directories...', 'success');
        setTimeout(() => {
          onReset();
        }, 1500);
      }
    } catch (err) {
      console.error(err);
      triggerToast('Error resetting database', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '16px', 
      height: '100%', 
      minHeight: 0,
      fontFamily: "var(--font-body)",
      color: "var(--glass-text)"
    }}>
      {/* Control Panel Header */}
      <div style={{ 
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)', 
        paddingBottom: '12px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between' 
      }}>
        <div>
          <h3 style={{ 
            fontFamily: 'var(--font-heading)', 
            fontSize: '15px', 
            fontWeight: 700, 
            letterSpacing: '0.5px',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ color: 'var(--primary)', filter: 'drop-shadow(0 0 6px var(--primary))' }}>⚙️</span> 
            SYSTEM CONFIGURATION REGISTRY
          </h3>
          <p style={{ fontSize: '11px', color: 'var(--glass-text-muted)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
            ModDesk OS Engine V3.0 // ACTIVE_SHARDS = 1
          </p>
        </div>
      </div>

      <form 
        onSubmit={handleSubmit} 
        style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '14px', 
          flexGrow: 1, 
          overflowY: 'auto',
          paddingRight: '4px'
        }}
      >
        {/* Subreddit Specs */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '12px',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          transition: 'all 0.3s ease'
        }}>
          <span style={{ 
            fontFamily: 'var(--font-heading)', 
            fontSize: '11px', 
            fontWeight: 700,
            color: 'var(--primary)',
            letterSpacing: '0.8px',
            textTransform: 'uppercase'
          }}>
            1. Subreddit General Scope
          </span>
          
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px' }}>
              <label className="glass-label">SUBREDDIT BOUND NAME</label>
              <input
                type="text"
                value={subredditName}
                onChange={(e) => setSubredditName(e.target.value)}
                className="glass-input"
                placeholder="e.g. r/AskModerators"
                style={{ fontSize: '13px' }}
              />
            </div>
            
            <div style={{ flex: '1 1 200px' }}>
              <label className="glass-label">ACTIVE SHIFT OPERATOR</label>
              <input
                type="text"
                value={profile.username}
                disabled
                className="glass-input"
                style={{ 
                  fontSize: '13px', 
                  opacity: 0.6,
                  cursor: 'not-allowed',
                  background: 'rgba(0, 0, 0, 0.4)',
                  borderColor: 'rgba(255, 255, 255, 0.03)'
                }}
              />
            </div>
          </div>
        </div>

        {/* Consensus Guidelines */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '12px',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          transition: 'all 0.3s ease'
        }}>
          <span style={{ 
            fontFamily: 'var(--font-heading)', 
            fontSize: '11px', 
            fontWeight: 700,
            color: 'var(--accent-gold)',
            letterSpacing: '0.8px',
            textTransform: 'uppercase'
          }}>
            2. Consensus Escalation Rules
          </span>
          
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px' }}>
              <label className="glass-label">VOTE CRITERIA THRESHOLD</label>
              <select
                value={consensusThresholdMode}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'fixed' || val === 'percent') {
                    setConsensusThresholdMode(val);
                  }
                }}
                className="glass-input"
                style={{ 
                  fontSize: '13px', 
                  padding: '10px 14px', 
                  background: 'rgba(0,0,0,0.3)',
                  cursor: 'pointer' 
                }}
              >
                <option value="fixed" style={{ backgroundColor: 'var(--neutral-dark)' }}>Fixed Vote Quorum</option>
                <option value="percent" style={{ backgroundColor: 'var(--neutral-dark)' }}>Percentage Supermajority</option>
              </select>
            </div>
            
            <div style={{ flex: '1 1 200px' }}>
              <label className="glass-label">REQUIRED APPROVAL THRESHOLD</label>
              <input
                type="number"
                min="1"
                max="10"
                value={consensusFixedCount}
                onChange={(e) => setConsensusFixedCount(Number(e.target.value))}
                className="glass-input"
                style={{ fontSize: '13px' }}
              />
            </div>
          </div>
        </div>

        {/* ModAcademy Parameters */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '12px',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          transition: 'all 0.3s ease'
        }}>
          <span style={{ 
            fontFamily: 'var(--font-heading)', 
            fontSize: '11px', 
            fontWeight: 700,
            color: '#10b981',
            letterSpacing: '0.8px',
            textTransform: 'uppercase'
          }}>
            3. Onboarding & Training Credentials
          </span>
          
          <div style={{ display: 'flex', gap: '12px', flexDirection: 'column' }}>
            <div>
              <label className="glass-label">MINIMUM ONBOARDING LEVEL REQUIREMENT</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={trainingRequiredLevel}
                  onChange={(e) => setTrainingRequiredLevel(Number(e.target.value))}
                  style={{ 
                    flexGrow: 1, 
                    height: '6px', 
                    borderRadius: '3px', 
                    background: 'rgba(255, 255, 255, 0.1)', 
                    accentColor: '#10b981',
                    cursor: 'pointer' 
                  }}
                />
                <span style={{ 
                  fontFamily: 'var(--font-mono)', 
                  fontSize: '14px', 
                  fontWeight: 'bold', 
                  color: '#10b981',
                  background: 'rgba(16, 185, 129, 0.1)',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  minWidth: '35px',
                  textAlign: 'center'
                }}>
                  Lvl {trainingRequiredLevel}
                </span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--glass-text-muted)', marginTop: '6px', display: 'block', lineHeight: '1.4' }}>
                Apprentices must clear this level within ModAcademy shift modules before live Priority Queue permissions are unlocked.
              </span>
            </div>
          </div>
        </div>

        {/* Visual Aesthetics Theme */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '12px',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          transition: 'all 0.3s ease'
        }}>
          <span style={{ 
            fontFamily: 'var(--font-heading)', 
            fontSize: '11px', 
            fontWeight: 700,
            color: 'var(--accent-gold)',
            letterSpacing: '0.8px',
            textTransform: 'uppercase'
          }}>
            4. Display Settings & Themes
          </span>
          
          <div>
            <label className="glass-label">THEME INTENSITY PRESET</label>
            <select
              value={themeMode}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'modern' || val === 'authentic') {
                  setThemeMode(val);
                }
              }}
              className="glass-input"
              style={{ 
                fontSize: '13px', 
                padding: '10px 14px', 
                background: 'rgba(0,0,0,0.3)',
                cursor: 'pointer' 
              }}
            >
              <option value="modern" style={{ backgroundColor: 'var(--neutral-dark)' }}>Modern Hybrid (Premium WebOS Glassmorphism)</option>
              <option value="authentic" style={{ backgroundColor: 'var(--neutral-dark)' }}>Authentic Retro (1998 Bevels + Scanlines)</option>
              <option value="high-contrast" style={{ backgroundColor: 'var(--neutral-dark)' }}>High Contrast Telemetry (Accessibility Mode)</option>
            </select>
          </div>
        </div>

        {/* Action controls */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginTop: 'auto', 
          paddingTop: '16px', 
          borderTop: '1px solid rgba(255, 255, 255, 0.08)' 
        }}>
          <button
            type="button"
            onClick={() => setShowConfirmModal(true)}
            disabled={isLoading}
            className="glass-btn danger"
            style={{ 
              padding: '10px 18px',
              fontFamily: 'var(--font-heading)',
              fontWeight: 600,
              fontSize: '12px',
              boxShadow: 'none'
            }}
          >
            ☣️ System Factory Reset
          </button>
          
          <button
            type="submit"
            disabled={isLoading}
            className="glass-btn primary"
            style={{ 
              padding: '10px 24px', 
              fontWeight: 600,
              fontFamily: 'var(--font-heading)',
              fontSize: '12px',
              minWidth: '160px'
            }}
          >
            {isLoading ? 'Writing Data...' : '💾 Save Configurations'}
          </button>
        </div>
      </form>

      {/* CUSTOM FROSTED GLASS CONFIRM MODAL */}
      {showConfirmModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(3, 0, 15, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999999,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          transition: 'all 0.3s ease'
        }}>
          <div 
            className="glass-panel"
            style={{
              width: '440px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8), 0 0 30px var(--accent-border-pill)',
              border: '1px solid var(--accent-border-pill)',
              borderRadius: '20px',
              background: 'var(--glass-bg)',
              overflow: 'hidden',
              transform: 'scale(1)',
              animation: 'modalEntrance 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
            }}
          >
            {/* Header bar */}
            <div style={{
              background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.15) 0%, rgba(239, 68, 68, 0.02) 100%)',
              padding: '14px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(239, 68, 68, 0.25)'
            }}>
              <span style={{ 
                fontSize: '13px', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                fontFamily: 'var(--font-heading)',
                fontWeight: 700,
                color: '#ef4444',
                letterSpacing: '0.5px'
              }}>
                <span>🛑</span>
                <span>SECURITY DIRECTIVE WARNING</span>
              </span>
              <button 
                onClick={() => setShowConfirmModal(false)}
                style={{ 
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255, 255, 255, 0.4)',
                  fontSize: '16px',
                  cursor: 'pointer',
                  fontWeight: 900,
                  transition: 'color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)'}
              >
                ×
              </button>
            </div>

            {/* Content bed */}
            <div style={{
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}>
              <div style={{ display: 'flex', gap: '14px', fontStyle: 'normal', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '32px', filter: 'drop-shadow(0 0 8px #ef4444)' }}>🚨</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <h4 style={{
                    fontFamily: 'var(--font-heading)',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#ef4444'
                  }}>
                    HIGH-RISK DESTRUCTIVE DIRECTIVE
                  </h4>
                  <p style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.85)', lineHeight: '1.5' }}>
                    You are initiating a system-wide database purge. This operation will override current registries and write default templates.
                  </p>
                </div>
              </div>

              {/* Target Display Panel */}
              <div style={{
                padding: '12px 16px',
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  fontWeight: 600,
                  color: 'var(--glass-text-muted)'
                }}>
                  TARGET TARGET PROCESS:
                </span>
                <div style={{
                  fontSize: '13px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 'bold',
                  color: '#fff'
                }}>
                  ModDesk_DB_Seeding.reset_to_factory_defaults()
                </div>
              </div>

              {/* Consequences Callout */}
              <div style={{
                padding: '12px 16px',
                backgroundColor: 'rgba(239, 68, 68, 0.06)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: '10px'
              }}>
                <span style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#ef4444',
                  display: 'block',
                  marginBottom: '4px',
                  letterSpacing: '0.5px'
                }}>
                  IRREVERSIBLE CONSEQUENCES:
                </span>
                <p style={{
                  fontSize: '12px',
                  color: 'rgba(239, 68, 68, 0.9)',
                  lineHeight: '1.4'
                }}>
                  All active Moderator Profiles, XP/Level parameters, Consensus ballots, custom typewriter templates, and priority log queues will be immediately wiped out.
                </p>
              </div>
            </div>

            {/* Footer controls */}
            <div style={{
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              borderTop: '1px solid rgba(255, 255, 255, 0.05)',
              padding: '16px 24px',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px'
            }}>
              <button 
                onClick={() => setShowConfirmModal(false)}
                className="glass-btn"
                style={{ width: '100px', fontWeight: 600 }}
              >
                Cancel
              </button>
              <button 
                onClick={handleResetExecute}
                className="glass-btn danger"
                style={{ width: '150px', fontWeight: 700 }}
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal Entrance Keyframes */}
      <style>{`
        @keyframes modalEntrance {
          from {
            opacity: 0;
            transform: scale(0.92) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
};
