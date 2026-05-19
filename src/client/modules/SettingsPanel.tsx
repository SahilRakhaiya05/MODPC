import React, { useState } from 'react';
import type { AppSettings, ModeratorProfile } from '../types';
import { api } from '../utils/api';

type SettingsPanelProps = {
  settings: AppSettings;
  onSettingsUpdate: (settings: AppSettings) => void;
  profile: ModeratorProfile;
  triggerToast: (msg: string, type?: 'success' | 'warning' | 'error') => void;
  onReset: () => void;
};

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  onSettingsUpdate,
  profile,
  triggerToast,
  onReset,
}) => {
  const [subredditName, setSubredditName] = useState(settings.subredditName);
  const [consensusThresholdMode, setConsensusThresholdMode] = useState(settings.consensusThresholdMode);
  const [consensusFixedCount, setConsensusFixedCount] = useState(settings.consensusFixedCount);
  const [trainingRequiredLevel, setTrainingRequiredLevel] = useState(settings.trainingRequiredLevel);
  const [themeMode, setThemeMode] = useState(settings.themeMode);
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    try {
      const res = await api.updateSettings({
        subredditName,
        consensusThresholdMode,
        consensusFixedCount: Number(consensusFixedCount),
        trainingRequiredLevel: Number(trainingRequiredLevel),
        themeMode,
      });

      if (res.success) {
        onSettingsUpdate(res.settings);
        triggerToast('Settings saved.', 'success');
      }
    } catch (err) {
      console.error(err);
      triggerToast('Error saving settings.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetExecute = async () => {
    if (!confirmReset) {
      triggerToast('Confirm the reset before continuing.', 'warning');
      return;
    }
    setShowConfirmModal(false);
    setIsLoading(true);
    try {
      const res = await api.resetDb();
      if (res.success) {
        triggerToast('Workspace reseeded.', 'success');
        window.setTimeout(() => onReset(), 1000);
      }
    } catch (err) {
      console.error(err);
      triggerToast('Error resetting database.', 'error');
    } finally {
      setIsLoading(false);
      setConfirmReset(false);
    }
  };

  return (
    <div className="settings-panel">
      <header className="settings-header">
        <div>
          <span className="module-eyebrow">Settings system</span>
          <h3>Community configuration</h3>
          <p>Subreddit-scoped controls for consensus, training, display, and local ModDesk data.</p>
        </div>
        <div className="settings-session">
          <span>Operator</span>
          <strong>u/{profile.username}</strong>
        </div>
      </header>

      <form className="settings-form" onSubmit={handleSubmit}>
        <section className="settings-card">
          <span className="module-eyebrow">Subreddit scope</span>
          <div className="settings-fields">
            <label>
              <span>Subreddit bound name</span>
              <input
                type="text"
                value={subredditName}
                onChange={(event) => setSubredditName(event.target.value)}
                className="glass-input"
                placeholder="e.g. r/AskModerators"
              />
            </label>
            <label>
              <span>Active shift operator</span>
              <input type="text" value={profile.username} disabled className="glass-input" />
            </label>
          </div>
        </section>

        <section className="settings-card">
          <span className="module-eyebrow">Consensus escalation</span>
          <div className="settings-fields">
            <label>
              <span>Vote criteria threshold</span>
              <select
                value={consensusThresholdMode}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === 'fixed' || value === 'percent') setConsensusThresholdMode(value);
                }}
                className="glass-input"
              >
                <option value="fixed">Fixed vote quorum</option>
                <option value="percent">Percentage supermajority</option>
              </select>
            </label>
            <label>
              <span>Required approval threshold</span>
              <input
                type="number"
                min="1"
                max="10"
                value={consensusFixedCount}
                onChange={(event) => setConsensusFixedCount(Number(event.target.value))}
                className="glass-input"
              />
            </label>
          </div>
        </section>

        <section className="settings-card">
          <span className="module-eyebrow">Onboarding</span>
          <label className="settings-range">
            <span>Minimum training level</span>
            <div>
              <input
                type="range"
                min="1"
                max="10"
                value={trainingRequiredLevel}
                onChange={(event) => setTrainingRequiredLevel(Number(event.target.value))}
              />
              <strong>Lvl {trainingRequiredLevel}</strong>
            </div>
            <em>Mods below this level can train before working live queue actions.</em>
          </label>
        </section>

        <section className="settings-card">
          <span className="module-eyebrow">Display</span>
          <label>
            <span>Theme preset</span>
            <select
              value={themeMode}
              onChange={(event) => {
                const value = event.target.value;
                if (value === 'modern' || value === 'authentic' || value === 'high-contrast') setThemeMode(value);
              }}
              className="glass-input"
            >
              <option value="modern">Modern ModDesk</option>
              <option value="authentic">Retro document OS</option>
              <option value="high-contrast">High contrast</option>
            </select>
          </label>
        </section>

        <footer className="settings-actions">
          <button type="button" onClick={() => setShowConfirmModal(true)} disabled={isLoading} className="glass-btn danger">
            Factory reset
          </button>
          <button type="submit" disabled={isLoading} className="glass-btn primary">
            {isLoading ? 'Saving...' : 'Save settings'}
          </button>
        </footer>
      </form>

      {showConfirmModal && (
        <div className="settings-modal-backdrop">
          <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-reset-title">
            <header>
              <span className="module-eyebrow">Security directive</span>
              <button onClick={() => setShowConfirmModal(false)} aria-label="Close reset confirmation">x</button>
            </header>
            <div className="settings-modal-body">
              <h4 id="settings-reset-title">Factory reset ModDesk data?</h4>
              <p>This reseeds the subreddit-scoped Redis workspace: profiles, training progress, consensus tickets, templates, and queued local records.</p>
              <div>
                <span>Target process</span>
                <strong>ModDesk_DB_Seeding.reset_to_factory_defaults()</strong>
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={confirmReset}
                  onChange={(event) => setConfirmReset(event.target.checked)}
                />
                I understand this changes the current community workspace.
              </label>
            </div>
            <footer>
              <button onClick={() => setShowConfirmModal(false)} className="glass-btn">Cancel</button>
              <button onClick={handleResetExecute} disabled={!confirmReset || isLoading} className="glass-btn danger">
                Confirm reset
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
};
