import React, { useCallback, useEffect, useState } from 'react';
import type { ModPrefs, SessionResponse, ThemeMode, WallpaperId } from '../../shared/api';
import { api } from '../utils/api';

type PersonalModPanelProps = {
  session?: SessionResponse | undefined;
  triggerToast: (msg: string, tone?: 'success' | 'warning' | 'error' | 'info') => void;
  openTeamChat: () => void;
  openOwnerAdmin: () => void;
  canOpenOwnerAdmin: boolean;
};

const themeOptions: Array<{ value: ThemeMode; label: string }> = [
  { value: 'modern', label: 'Modern' },
  { value: 'authentic', label: 'Authentic' },
  { value: 'high_contrast', label: 'High contrast' },
];

const wallpaperOptions: Array<{ value: WallpaperId; label: string }> = [
  { value: 'wall1', label: 'Warm desktop' },
  { value: 'dotted', label: 'Dotted paper' },
  { value: 'office-party', label: 'Office party' },
  { value: 'plain', label: 'Plain' },
];

const dashboardOptions: Array<{ value: ModPrefs['dashboardLayout']; label: string }> = [
  { value: 'grid', label: 'Grid' },
  { value: 'list', label: 'List' },
];

const isThemeMode = (value: string): value is ThemeMode =>
  themeOptions.some((item) => item.value === value);

const isWallpaperId = (value: string): value is WallpaperId =>
  wallpaperOptions.some((item) => item.value === value);

const isDashboardLayout = (value: string): value is ModPrefs['dashboardLayout'] =>
  dashboardOptions.some((item) => item.value === value);

const moduleChoices = [
  'queue',
  'modmail',
  'teamchat',
  'handoff',
  'sentinel',
  'automod',
  'commentcop',
  'owneradmin',
];

export const PersonalModPanel: React.FC<PersonalModPanelProps> = ({
  session,
  triggerToast,
  openTeamChat,
  openOwnerAdmin,
  canOpenOwnerAdmin,
}) => {
  const [prefs, setPrefs] = useState<ModPrefs | null>(null);
  const [chatUnread, setChatUnread] = useState(0);
  const [mentionUnread, setMentionUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [prefsResult, counts] = await Promise.all([api.getModPrefs(), api.getNotifications()]);
      setPrefs(prefsResult.prefs);
      setChatUnread(counts.chatUnread);
      setMentionUnread(counts.mentionUnread);
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : 'Could not load your moderator panel.', 'error');
    } finally {
      setLoading(false);
    }
  }, [triggerToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const savePrefs = async (patch: Partial<ModPrefs>) => {
    if (!prefs) return;
    setSaving(true);
    try {
      const result = await api.saveModPrefs(patch);
      setPrefs(result.prefs);
      triggerToast('Your personal panel was saved.', 'success');
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : 'Could not save personal preferences.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const togglePinnedModule = (moduleId: string) => {
    if (!prefs) return;
    const pinned = prefs.pinnedModules.includes(moduleId)
      ? prefs.pinnedModules.filter((item) => item !== moduleId)
      : [...prefs.pinnedModules, moduleId];
    void savePrefs({ pinnedModules: pinned });
  };

  const markChatRead = async () => {
    try {
      await api.markNotificationsRead();
      setChatUnread(0);
      setMentionUnread(0);
      triggerToast('Team chat marked read.', 'success');
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : 'Could not mark notifications read.', 'error');
    }
  };

  if (loading || !prefs) {
    return (
      <div className="personal-panel">
        <p className="personal-panel-loading">Loading your private moderator panel...</p>
      </div>
    );
  }

  return (
    <div className="personal-panel">
      <header className="personal-header">
        <div>
          <span className="module-eyebrow">Personal moderator panel</span>
          <h3>u/{session?.username ?? 'moderator'} on r/{session?.subredditName ?? 'community'}</h3>
          <p>
            These settings are stored under your moderator account for this subreddit only. Other moderators keep their
            own layout, pins, and notification state.
          </p>
        </div>
        <div className="personal-role-card">
          <span>Role</span>
          <strong>{session?.modDeskRole ?? 'moderator'}</strong>
          <em>{session?.liveWritesEnabled ? 'Live writes available' : 'Live writes locked'}</em>
        </div>
      </header>

      <section className="personal-grid">
        <article className="personal-card">
          <span className="module-eyebrow">Notifications</span>
          <div className="personal-stat-row">
            <div>
              <strong>{chatUnread}</strong>
              <span>unread team messages</span>
            </div>
            <div>
              <strong>{mentionUnread}</strong>
              <span>mentions</span>
            </div>
          </div>
          <div className="personal-actions">
            <button type="button" className="glass-btn primary" onClick={openTeamChat}>Open #team</button>
            <button type="button" className="glass-btn" onClick={markChatRead}>Mark read</button>
          </div>
        </article>

        <article className="personal-card">
          <span className="module-eyebrow">Display</span>
          <label className="personal-field">
            <span>Theme</span>
            <select
              value={prefs.themeMode}
              disabled={saving}
              onChange={(event) => {
                if (isThemeMode(event.target.value)) void savePrefs({ themeMode: event.target.value });
              }}
            >
              {themeOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="personal-field">
            <span>Wallpaper</span>
            <select
              value={prefs.wallpaperId}
              disabled={saving}
              onChange={(event) => {
                if (isWallpaperId(event.target.value)) void savePrefs({ wallpaperId: event.target.value });
              }}
            >
              {wallpaperOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="personal-field">
            <span>Dashboard layout</span>
            <select
              value={prefs.dashboardLayout}
              disabled={saving}
              onChange={(event) => {
                if (isDashboardLayout(event.target.value)) void savePrefs({ dashboardLayout: event.target.value });
              }}
            >
              {dashboardOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
        </article>

        <article className="personal-card">
          <span className="module-eyebrow">Personal toggles</span>
          <label className="personal-toggle">
            <input
              type="checkbox"
              checked={prefs.notificationsEnabled}
              disabled={saving}
              onChange={(event) => void savePrefs({ notificationsEnabled: event.target.checked })}
            />
            <span>Enable unread counters</span>
          </label>
          <label className="personal-toggle">
            <input
              type="checkbox"
              checked={prefs.notificationSound}
              disabled={saving}
              onChange={(event) => void savePrefs({ notificationSound: event.target.checked })}
            />
            <span>Play notification sound</span>
          </label>
          <label className="personal-toggle">
            <input
              type="checkbox"
              checked={prefs.compactWindows}
              disabled={saving}
              onChange={(event) => void savePrefs({ compactWindows: event.target.checked })}
            />
            <span>Use compact windows</span>
          </label>
        </article>

        <article className="personal-card wide">
          <span className="module-eyebrow">Pinned modules</span>
          <div className="personal-pin-list">
            {moduleChoices.map((moduleId) => (
              <button
                key={moduleId}
                type="button"
                className={prefs.pinnedModules.includes(moduleId) ? 'active' : ''}
                onClick={() => togglePinnedModule(moduleId)}
                disabled={saving}
              >
                {moduleId}
              </button>
            ))}
          </div>
          <p>
            Pinned module choices are personal. They do not change the app layout for any other moderator in this
            community.
          </p>
        </article>
      </section>

      <footer className="personal-footer">
        <span>Last saved {new Date(prefs.updatedAt).toLocaleString()}</span>
        {canOpenOwnerAdmin && (
          <button type="button" className="glass-btn" onClick={openOwnerAdmin}>Open Owner Admin</button>
        )}
      </footer>
    </div>
  );
};
