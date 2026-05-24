import { navigateTo } from '@devvit/web/client';
import React, { useEffect, useMemo, useState } from 'react';
import type { AppSettings, ModeratorProfile } from '../types';
import type { SentinelSettingsResponse, SessionResponse, SubredditInstall } from '../../shared/api';
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
  const [themeMode, setThemeMode] = useState(settings.themeMode);
  const workspaceMode = 'live' as const;
  const [wallpaperId, setWallpaperId] = useState<'dotted' | 'wall1' | 'office-party' | 'plain'>(
    settings.wallpaperId ?? 'wall1'
  );
  const liveWritesEnabled = true;
  const [sentinelSettings, setSentinelSettings] = useState<SentinelSettingsResponse | null>(null);
  const [groqApiKey, setGroqApiKey] = useState('');
  const [groqModel, setGroqModel] = useState(settings.sentinelModel ?? 'llama-3.3-70b-versatile');
  const [groqTemperature, setGroqTemperature] = useState(settings.sentinelTemperature ?? 0.2);
  const [groqMaxTokens, setGroqMaxTokens] = useState(settings.sentinelMaxTokens ?? 900);
  const [ragEnabled, setRagEnabled] = useState(settings.sentinelRagEnabled ?? true);
  const [automationEnabled, setAutomationEnabled] = useState(Boolean(settings.sentinelAutomationEnabled));
  const [groqBusy, setGroqBusy] = useState(false);
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
    api.getSentinelSettings()
      .then((res) => {
        if (!isMounted) return;
        setSentinelSettings(res);
        setGroqModel(res.model);
        setGroqTemperature(res.temperature);
        setGroqMaxTokens(res.maxTokens);
        setRagEnabled(res.ragEnabled);
        setAutomationEnabled(res.automationEnabled);
      })
      .catch((err: unknown) => console.error(err));
    return () => {
      isMounted = false;
    };
  }, []);

  const saveGroqSettings = async () => {
    setGroqBusy(true);
    try {
      const payload = {
        model: groqModel,
        temperature: groqTemperature,
        maxTokens: groqMaxTokens,
        ragEnabled,
        automationEnabled,
        ...(groqApiKey.trim() ? { apiKey: groqApiKey.trim() } : {}),
      };
      const res = await api.updateSentinelSettings(payload);
      setSentinelSettings(res);
      setGroqApiKey('');
      triggerToast('Sentinel settings saved server-side.', 'success');
    } catch (err) {
      console.error(err);
      triggerToast('Failed to save Sentinel settings.', 'error');
    } finally {
      setGroqBusy(false);
    }
  };

  const testGroq = async () => {
    setGroqBusy(true);
    try {
      const res = await api.testGroqConnection();
      triggerToast(res.message, res.ok ? 'success' : 'error');
      const settingsResult = await api.getSentinelSettings();
      setSentinelSettings(settingsResult);
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : 'AI connection test failed.', 'error');
    } finally {
      setGroqBusy(false);
    }
  };

  const rebuildRag = async () => {
    setGroqBusy(true);
    try {
      const res = await api.rebuildSentinelRag();
      triggerToast(`Workspace context refreshed with ${res.count} chunks.`, 'success');
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : 'Context refresh failed.', 'error');
    } finally {
      setGroqBusy(false);
    }
  };

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
        trainingRequiredLevel: settings.trainingRequiredLevel,
        themeMode,
        workspaceMode,
        wallpaperId,
        liveWritesEnabled,
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
              <strong>AI Status</strong>
              <span className={sentinelSettings?.hasApiKey ? 'available' : 'unavailable'}>{sentinelSettings?.hasApiKey ? 'AI ready' : 'Needs key'}</span>
              <em>Sentinel supports Groq, OpenAI, and Gemini. OpenAI and Gemini are globally allowlisted by Reddit and work instantly!</em>
            </article>
          </div>
        </section>

        <section className="settings-card">
          <span className="module-eyebrow">Sentinel AI setup</span>
          <div className="settings-groq-box">
            <strong>{sentinelSettings?.hasApiKey ? 'AI API key saved server-side' : 'Sentinel AI is not configured'}</strong>
            <p>
              Sentinel supports multiple AI providers. 
        
            </p>
          </div>
          <div className="settings-fields">
            <label>
              <span>AI API key</span>
              <input type="password" value={groqApiKey} onChange={(event) => setGroqApiKey(event.target.value)} placeholder={sentinelSettings?.hasApiKey ? 'Saved server-side - enter a new key to replace' : 'Enter API key (gsk_..., sk-..., AIzaSy...)'} className="glass-input" autoComplete="off" />
            </label>
            <label>
              <span>Model</span>
              <select value={groqModel} onChange={(event) => setGroqModel(event.target.value)} className="glass-input">
                <optgroup label="OpenAI">
                  <option value="gpt-4o-mini">gpt-4o-mini (Fast & Recommended)</option>
                  <option value="gpt-4o">gpt-4o (High Intelligence)</option>
                </optgroup>
                <optgroup label="Gemini">
                  <option value="gemini-1.5-flash">gemini-1.5-flash (Fast & Native)</option>
                  <option value="gemini-2.0-flash">gemini-2.0-flash (Next-Gen)</option>
                </optgroup>
                <optgroup label="Groq">
                  <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
                  <option value="llama-3.1-8b-instant">llama-3.1-8b-instant</option>
                  <option value="mixtral-8x7b-32768">mixtral-8x7b-32768</option>
                  <option value="gemma2-9b-it">gemma2-9b-it</option>
                </optgroup>
              </select>
            </label>
            <label>
              <span>Temperature</span>
              <input type="number" min="0" max="1" step="0.1" value={groqTemperature} onChange={(event) => setGroqTemperature(Number(event.target.value))} className="glass-input" />
            </label>
            <label>
              <span>Max tokens</span>
              <input type="number" min="256" max="4096" value={groqMaxTokens} onChange={(event) => setGroqMaxTokens(Number(event.target.value))} className="glass-input" />
            </label>
          </div>
          <div className="settings-capability-grid">
            <article>
              <strong>Model status</strong>
              <span className={sentinelSettings?.lastError ? 'unavailable' : sentinelSettings?.lastSuccessAt ? 'available' : 'limited'}>
                {sentinelSettings?.lastSuccessAt ? 'Last test passed' : sentinelSettings?.lastError ? 'Needs attention' : 'Not tested'}
              </span>
              <em>{sentinelSettings?.lastError ?? (sentinelSettings?.lastLatencyMs ? `${sentinelSettings.lastLatencyMs}ms latency` : 'Use Test Connection before relying on Sentinel.')}</em>
            </article>
            <article>
              <strong>Workspace context</strong>
              <span className={ragEnabled ? 'available' : 'limited'}>{ragEnabled ? 'Enabled' : 'Disabled'}</span>
              <em>Indexes rules, Automod, queue, templates, modmail when allowed, consensus, audit, and live workspace context.</em>
            </article>
          </div>
          <label className="settings-live-write-toggle">
            <input type="checkbox" checked={ragEnabled} onChange={(event) => setRagEnabled(event.target.checked)} />
            <span>Enable workspace context and source citations. Turn this off when you only want a direct AI answer without ModDesk retrieval.</span>
          </label>
          <label className="settings-live-write-toggle">
            <input type="checkbox" checked={automationEnabled} onChange={(event) => setAutomationEnabled(event.target.checked)} />
            <span>Allow Sentinel automations to draft, summarize, classify, and recommend. Destructive live actions still require human confirmation.</span>
          </label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" className="glass-btn primary" disabled={groqBusy} onClick={() => void saveGroqSettings()}>Save AI settings</button>
            <button type="button" className="glass-btn" disabled={groqBusy} onClick={() => void testGroq()}>Test AI Connection</button>
            <button type="button" className="glass-btn" disabled={groqBusy} onClick={() => void rebuildRag()}>Refresh Context</button>
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
          <span className="module-eyebrow">Live Reddit writes</span>
          <p className="settings-card-note">
            ModDesk is configured to run as a live Reddit console. Moderation actions (such as approve, remove, ban, mute, save Automod, and modmail replies) are **live-enabled by default** for real-time moderator operations.
          </p>
          <div className="settings-live-writes-status-badge" style={{ marginTop: '12px', padding: '12px', borderRadius: '8px', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <strong style={{ color: 'rgb(34, 197, 94)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'rgb(34, 197, 94)', display: 'inline-block', boxShadow: '0 0 8px rgb(34, 197, 94)' }}></span>
              Console Status: Active & Writing Live
            </strong>
            <span style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.7)' }}>
              ModDesk is directly connected to the Reddit API. Actions will take effect immediately in r/{currentCommunity}.
            </span>
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

          <div className="settings-wallpaper-row">
            <span className="settings-wallpaper-label">Desktop background</span>
            <div className="settings-wallpaper-grid" role="radiogroup" aria-label="Desktop background">
              {(
                [
                  { id: 'wall1', label: 'ModDesk desk' },
                  { id: 'office-party', label: 'Office party' },
                  { id: 'dotted', label: 'Dotted paper' },
                  { id: 'plain', label: 'Plain' },
                ] as const
              ).map((wp) => (
                <button
                  key={wp.id}
                  type="button"
                  role="radio"
                  aria-checked={wallpaperId === wp.id}
                  className={`settings-wallpaper-card${wallpaperId === wp.id ? ' active' : ''}`}
                  data-wallpaper={wp.id}
                  onClick={() => {
                    setWallpaperId(wp.id);
                    onSettingsUpdate({ ...settings, wallpaperId: wp.id });
                  }}
                  title={wp.label}
                >
                  <span className="settings-wallpaper-thumb" aria-hidden="true" />
                  <em>{wp.label}</em>
                </button>
              ))}
            </div>
            <p className="settings-wallpaper-hint">
              Drop new image files into <code>public/wallpaper/</code> to add more presets.
            </p>
          </div>

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
              <p>This reseeds the subreddit-scoped Redis workspace: profiles, consensus tickets, templates, audit records, and queued local records.</p>
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
