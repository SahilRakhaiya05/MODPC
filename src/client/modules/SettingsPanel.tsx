import { navigateTo } from '@devvit/web/client';
import React, { useEffect, useMemo, useState } from 'react';
import type { AppSettings, ModeratorProfile } from '../types';
import type { SessionResponse, SubredditInstall } from '../../shared/api';
import { api } from '../utils/api';

type SettingsPanelProps = {
  settings: AppSettings;
  onSettingsUpdate: (settings: AppSettings) => void;
  profile: ModeratorProfile;
  session?: SessionResponse | undefined;
  triggerToast: (msg: string, type?: 'success' | 'warning' | 'error') => void;
  onReset: () => void;
  onResetDesktop: () => void;
};

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  onSettingsUpdate,
  profile,
  session,
  triggerToast,
  onReset,
  onResetDesktop,
}) => {
  const currentCommunity = (session?.subredditName ?? settings.subredditName).replace(/^r\//i, '');
  const [subredditName, setSubredditName] = useState(currentCommunity);
  const [communities, setCommunities] = useState<SubredditInstall[]>(session?.installs ?? []);
  const [consensusThresholdMode, setConsensusThresholdMode] = useState(settings.consensusThresholdMode);
  const [consensusFixedCount, setConsensusFixedCount] = useState(settings.consensusFixedCount);
  const [trainingRequiredLevel, setTrainingRequiredLevel] = useState(settings.trainingRequiredLevel);
  const [themeMode, setThemeMode] = useState(settings.themeMode);
  const [workspaceMode, setWorkspaceMode] = useState<'live' | 'training'>(settings.workspaceMode ?? 'live');
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const selectedCommunity = subredditName.replace(/^r\//i, '');
  const selectedIsCurrent = selectedCommunity.toLowerCase() === currentCommunity.toLowerCase();
  const capabilityRows = [
    ['Queue', session?.capabilities.queue],
    ['Modmail', session?.capabilities.modmail],
    ['Automod', session?.capabilities.automod],
    ['Users', session?.capabilities.users],
    ['Modlog', session?.capabilities.modlog],
    ['Flairs', session?.capabilities.flairs],
    ['Insights', session?.capabilities.insights],
  ];

  const sortedCommunities = useMemo(() => {
    const byName = new Map<string, SubredditInstall>();
    for (const community of communities) {
      const normalized = community.subredditName.replace(/^r\//i, '');
      byName.set(normalized.toLowerCase(), { ...community, subredditName: normalized });
    }
    if (!byName.has(currentCommunity.toLowerCase())) {
      byName.set(currentCommunity.toLowerCase(), {
        subredditName: currentCommunity,
        iconUrl: session?.subredditIconUrl ?? null,
        subscribers: session?.subredditSubscribers ?? null,
        lastSeenAt: new Date().toISOString(),
      });
    }
    return Array.from(byName.values()).sort((a, b) => {
      if (a.subredditName.toLowerCase() === currentCommunity.toLowerCase()) return -1;
      if (b.subredditName.toLowerCase() === currentCommunity.toLowerCase()) return 1;
      return a.subredditName.localeCompare(b.subredditName);
    });
  }, [communities, currentCommunity, session?.subredditIconUrl, session?.subredditSubscribers]);

  useEffect(() => {
    let isMounted = true;
    const loadCommunities = async () => {
      try {
        const res = await api.getInstalls();
        if (isMounted) setCommunities(res.installs);
      } catch (err) {
        console.error(err);
      }
    };
    void loadCommunities();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedIsCurrent) {
      triggerToast(`Open ModDesk from r/${selectedCommunity} to load that community's live tools.`, 'warning');
      navigateTo(`https://www.reddit.com/r/${selectedCommunity}/about/modqueue`);
      return;
    }
    setIsLoading(true);
    try {
      const res = await api.updateSettings({
        subredditName,
        consensusThresholdMode,
        consensusFixedCount: Number(consensusFixedCount),
        trainingRequiredLevel: Number(trainingRequiredLevel),
        themeMode,
        workspaceMode,
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

  const handleLoadCommunity = () => {
    if (selectedIsCurrent) {
      triggerToast(`Loaded live tools for r/${currentCommunity}.`, 'success');
      onReset();
      return;
    }
    triggerToast(`Opening r/${selectedCommunity}. Launch ModDesk there to work that community.`, 'success');
    navigateTo(`https://www.reddit.com/r/${selectedCommunity}/about/modqueue`);
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
          <p>Pick a moderator community, verify live capability, and tune the workspace without oversized panels or cramped controls.</p>
        </div>
        <div className="settings-session">
          <span>Operator</span>
          <strong>u/{profile.username}</strong>
        </div>
      </header>

      <form className="settings-form" onSubmit={handleSubmit}>
        <section className="settings-card">
          <div className="settings-card-head">
            <span className="module-eyebrow">Community base</span>
            <button type="button" className="glass-btn" onClick={handleLoadCommunity}>
              {selectedIsCurrent ? 'Reload tools' : 'Open community'}
            </button>
          </div>
          <div className="settings-community-picker">
            <label>
              <span>Moderator community</span>
              <select
                value={selectedCommunity}
                onChange={(event) => setSubredditName(event.target.value)}
                className="glass-input"
              >
                {sortedCommunities.map((community) => (
                  <option key={community.subredditName} value={community.subredditName}>
                    r/{community.subredditName}
                    {community.subscribers ? ` · ${community.subscribers.toLocaleString()} members` : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="settings-community-status">
              <strong>{selectedIsCurrent ? 'Live tools loaded' : 'Open from community'}</strong>
              <span>
                {selectedIsCurrent
                  ? `Queue, modmail, automod, users, and logs are scoped to r/${currentCommunity}.`
                  : `Reddit runs Devvit mod tools inside the selected subreddit install. Open r/${selectedCommunity} to work it live.`}
              </span>
            </div>
          </div>
          <div className="settings-community-list" aria-label="Moderator communities">
            {sortedCommunities.map((community) => {
              const isSelected = community.subredditName.toLowerCase() === selectedCommunity.toLowerCase();
              const isCurrent = community.subredditName.toLowerCase() === currentCommunity.toLowerCase();
              return (
                <button
                  key={community.subredditName}
                  type="button"
                  className={isSelected ? 'active' : ''}
                  onClick={() => setSubredditName(community.subredditName)}
                >
                  <span className="settings-community-avatar">
                    {community.iconUrl ? <img src={community.iconUrl} alt="" /> : community.subredditName.slice(0, 2).toUpperCase()}
                  </span>
                  <strong>r/{community.subredditName}</strong>
                  <em>{isCurrent ? 'current install' : 'moderated'}</em>
                </button>
              );
            })}
          </div>
        </section>

        <section className="settings-card">
          <span className="module-eyebrow">Capability matrix</span>
          <div className="settings-capability-grid">
            {capabilityRows.map(([label, cap]) => {
              const enabled = typeof cap === 'object' && cap !== null && 'enabled' in cap ? cap.enabled : false;
              const live = typeof cap === 'object' && cap !== null && 'live' in cap ? cap.live : false;
              const detail = typeof cap === 'object' && cap !== null && 'detail' in cap ? cap.detail : undefined;
              return (
                <article key={String(label)}>
                  <strong>{String(label)}</strong>
                  <span className={enabled ? live ? 'available' : 'limited' : 'unavailable'}>
                    {enabled ? live ? 'Available' : 'Limited' : 'Unavailable'}
                  </span>
                  <em>{detail ?? (enabled ? 'Ready for this install context.' : 'This capability is not available for the current community or permissions.')}</em>
                </article>
              );
            })}
            <article>
              <strong>AI</strong>
              <span className="limited">Fallback available</span>
              <em>Groq runs server-side when configured. Local RAG fallback remains available and never performs Reddit actions.</em>
            </article>
          </div>
        </section>

        <section className="settings-card">
          <span className="module-eyebrow">Groq setup</span>
          <div className="settings-groq-box">
            <strong>API key status is server-side only</strong>
            <p>ModDesk never exposes <code>GROQ_API_KEY</code> to the client. Sentinel will show “Groq connected” after a successful model call, or “Fallback active” when the key is missing, rate-limited, timed out, or unavailable.</p>
          </div>
        </section>

        <section className="settings-card compact">
          <span className="module-eyebrow">Operator</span>
          <div className="settings-fields">
            <label>
              <span>Active shift operator</span>
              <input type="text" value={profile.username} disabled className="glass-input" />
            </label>
            <label>
              <span>Permission set</span>
              <input
                type="text"
                value={session?.modPermissions.length ? session.modPermissions.join(', ') : 'standard moderator'}
                disabled
                className="glass-input"
              />
            </label>
          </div>
        </section>

        <section className="settings-card">
          <span className="module-eyebrow">Workspace mode</span>
          <div className="settings-mode-toggle" role="radiogroup" aria-label="Workspace mode">
            <button
              type="button"
              role="radio"
              aria-checked={workspaceMode === 'live'}
              className={workspaceMode === 'live' ? 'active' : ''}
              onClick={() => setWorkspaceMode('live')}
            >
              <strong>Live</strong>
              <span>Only real Reddit data. Queue, modmail, mod log, users, automod all read from the Reddit API.</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={workspaceMode === 'training'}
              className={workspaceMode === 'training' ? 'active' : ''}
              onClick={() => setWorkspaceMode('training')}
            >
              <strong>Training</strong>
              <span>Unlocks Mod Academy + sandbox scenarios on fake content. No destructive actions affect the subreddit.</span>
            </button>
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
              <option value="modern">Modern ModDesk (light)</option>
              <option value="authentic">Retro document OS (light)</option>
              <option value="high-contrast">Dark mode</option>
            </select>
          </label>
          <button type="button" className="glass-btn" onClick={onResetDesktop}>
            Reset desktop layout
          </button>
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
