import React, { useCallback, useEffect, useState } from 'react';
import { navigateTo } from '@devvit/web/client';
import type { OwnerWorkspaceConfig, SessionResponse, TeamMember } from '../../shared/api';
import { api } from '../utils/api';

type OwnerAdminPanelProps = {
  session?: SessionResponse | undefined;
  triggerToast: (msg: string, tone?: 'success' | 'warning' | 'error' | 'info') => void;
};

const fmtAgo = (iso: string | null): string => {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
};

const workspaceModes: OwnerWorkspaceConfig['defaultWorkspaceMode'][] = ['live', 'training'];
const themeModes: OwnerWorkspaceConfig['defaultThemeMode'][] = ['modern', 'authentic', 'high_contrast'];

const isWorkspaceMode = (value: string): value is OwnerWorkspaceConfig['defaultWorkspaceMode'] =>
  workspaceModes.some((item) => item === value);

const isThemeMode = (value: string): value is OwnerWorkspaceConfig['defaultThemeMode'] =>
  themeModes.some((item) => item === value);

const accessRules = [
  { tool: 'Owner Admin', owner: 'Full access', admin: 'Full access', moderator: 'Hidden', trainee: 'Hidden' },
  { tool: 'My Panel', owner: 'Personal prefs', admin: 'Personal prefs', moderator: 'Personal prefs', trainee: 'Personal prefs' },
  { tool: 'Team Chat', owner: 'Post, pin, delete', admin: 'Post, pin, delete', moderator: 'Post, delete own', trainee: 'Read/post if allowed' },
  { tool: 'Settings', owner: 'Edit app defaults', admin: 'Edit app defaults', moderator: 'Personal/community status', trainee: 'View status' },
  { tool: 'CommentCop', owner: 'Configure + review', admin: 'Configure + review', moderator: 'Review cases', trainee: 'View cases' },
  { tool: 'Native Reddit Bridge', owner: 'All links', admin: 'All links', moderator: 'Moderator-safe links', trainee: 'Moderator-safe links' },
  { tool: 'Live Reddit actions', owner: 'Allowed with guardrails', admin: 'Allowed with guardrails', moderator: 'Allowed with permissions', trainee: 'Blocked' },
];

export const OwnerAdminPanel: React.FC<OwnerAdminPanelProps> = ({ session, triggerToast }) => {
  const role = session?.modDeskRole ?? 'observer';
  const canEdit = role === 'owner' || role === 'admin';

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [ownerUsername, setOwnerUsername] = useState<string | null>(null);
  const [config, setConfig] = useState<OwnerWorkspaceConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [team, cfg] = await Promise.all([api.getOwnerTeam(), api.getOwnerConfig()]);
      setMembers(team.members);
      setOwnerUsername(team.ownerUsername);
      setConfig(cfg.config);
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : 'Failed to load admin data.', 'error');
    } finally {
      setLoading(false);
    }
  }, [triggerToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const saveConfig = async (patch: Partial<OwnerWorkspaceConfig>) => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const res = await api.saveOwnerConfig(patch);
      setConfig(res.config);
      triggerToast('Workspace config saved.', 'success');
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateWelcomeDraft = (welcomeMessage: string) => {
    if (!config) return;
    setConfig({ ...config, welcomeMessage });
  };

  if (loading) {
    return <div className="owner-admin-panel"><p className="owner-admin-loading">Loading admin data…</p></div>;
  }

  return (
    <div className="owner-admin-panel">
      <header className="owner-admin-header">
        <div>
          <span className="module-eyebrow">Owner admin</span>
          <h3>Manage r/{session?.subredditName ?? 'community'}</h3>
          <p>
            Workspace defaults for every moderator. Personal preferences are separate — each moderator manages their own
            theme, layout, and notifications.
          </p>
        </div>
        <div className="owner-admin-role">
          <span>Your role</span>
          <strong>{role}</strong>
          {!canEdit && <em>Owner / admin required to edit</em>}
        </div>
      </header>

      <section className="owner-admin-card">
        <span className="module-eyebrow">Mod team ({members.length})</span>
        <p className="owner-admin-hint">
          Synced from Reddit's moderator list. Promoting / removing moderators happens on Reddit; this view shows who
          can use MODPC in r/{session?.subredditName}.
        </p>
        <ul className="owner-team-list">
          {members.map((m) => (
            <li key={m.username} className={m.isYou ? 'is-you' : ''}>
              <div className="owner-team-meta">
                <strong>u/{m.username}{m.isYou ? ' (you)' : ''}</strong>
                <span className={`owner-role-pill role-${m.role}`}>{m.role}</span>
                {m.isTopMod && <em className="owner-flag">Top mod</em>}
              </div>
              <div className="owner-team-stats">
                <span>Last active: {fmtAgo(m.lastActiveAt)}</span>
                <span>Permissions: {m.permissions.length > 0 ? m.permissions.join(', ') : 'standard'}</span>
              </div>
            </li>
          ))}
        </ul>
        <div className="owner-team-footer">
          <button
            type="button"
            className="glass-btn"
            onClick={() => navigateTo(`https://www.reddit.com/r/${session?.subredditName}/about/moderators`)}
          >
            Manage on Reddit ↗
          </button>
        </div>
      </section>

      <section className="owner-admin-card">
        <span className="module-eyebrow">Access rules</span>
        <p className="owner-admin-hint">
          These UI rules mirror the server endpoints: non-moderators never enter the workspace, moderators get private
          tools and shared review tools, and only owner/admin roles see install and admin controls.
        </p>
        <div className="owner-access-table" role="table" aria-label="MODPC role access rules">
          <div className="owner-access-row head" role="row">
            <strong>Tool</strong>
            <strong>Owner</strong>
            <strong>Admin</strong>
            <strong>Moderator</strong>
            <strong>Trainee</strong>
          </div>
          {accessRules.map((item) => (
            <div key={item.tool} className="owner-access-row" role="row">
              <strong>{item.tool}</strong>
              <span>{item.owner}</span>
              <span>{item.admin}</span>
              <span>{item.moderator}</span>
              <span>{item.trainee}</span>
            </div>
          ))}
        </div>
      </section>

      {config && (
        <section className="owner-admin-card">
          <span className="module-eyebrow">Workspace defaults</span>
          <p className="owner-admin-hint">
            These apply to every moderator unless they override in personal preferences. Owner sees everyone's data;
            moderators see only their own.
          </p>

          <label className="owner-admin-field">
            <span>Default workspace mode</span>
            <select
              disabled={!canEdit || saving}
              value={config.defaultWorkspaceMode}
              onChange={(e) => {
                if (isWorkspaceMode(e.target.value)) void saveConfig({ defaultWorkspaceMode: e.target.value });
              }}
            >
              <option value="live">Live (real Reddit data)</option>
              <option value="training">Training (sandbox scenarios)</option>
            </select>
          </label>

          <label className="owner-admin-field">
            <span>Default theme</span>
            <select
              disabled={!canEdit || saving}
              value={config.defaultThemeMode}
              onChange={(e) => {
                if (isThemeMode(e.target.value)) void saveConfig({ defaultThemeMode: e.target.value });
              }}
            >
              <option value="modern">Modern</option>
              <option value="authentic">Authentic</option>
              <option value="high_contrast">High contrast</option>
            </select>
          </label>

          <label className="owner-admin-toggle">
            <input
              type="checkbox"
              disabled={!canEdit || saving}
              checked={config.requireConfirmationOnLive}
              onChange={(e) => void saveConfig({ requireConfirmationOnLive: e.target.checked })}
            />
            <div>
              <strong>Require CONFIRM_LIVE_ACTION on destructive actions</strong>
              <span>Forces moderators to type a confirmation before bans, mass removals, or settings changes go through.</span>
            </div>
          </label>

          <label className="owner-admin-toggle">
            <input
              type="checkbox"
              disabled={!canEdit || saving}
              checked={config.allowTraineeAccess}
              onChange={(e) => void saveConfig({ allowTraineeAccess: e.target.checked })}
            />
            <div>
              <strong>Allow trainee role to view the workspace</strong>
              <span>Trainees can observe queue, modmail, and chat but can't take destructive actions.</span>
            </div>
          </label>

          <label className="owner-admin-field">
            <span>Welcome message (shown on home)</span>
            <textarea
              disabled={!canEdit || saving}
              rows={2}
              maxLength={500}
              value={config.welcomeMessage}
              onChange={(e) => updateWelcomeDraft(e.target.value)}
            />
            <button
              type="button"
              className="glass-btn"
              disabled={!canEdit || saving}
              onClick={() => void saveConfig({ welcomeMessage: config.welcomeMessage })}
            >
              Save welcome message
            </button>
          </label>

          <footer className="owner-admin-saved">
            {config.updatedBy
              ? <>Last updated by <strong>u/{config.updatedBy}</strong> · {fmtAgo(config.updatedAt)}</>
              : <>No changes yet — defaults in effect.</>}
          </footer>
        </section>
      )}

      <section className="owner-admin-card">
        <span className="module-eyebrow">Owner only</span>
        <p className="owner-admin-hint">
          {ownerUsername
            ? <>The top moderator of r/{session?.subredditName} is <strong>u/{ownerUsername}</strong>. Only they can change ownership on Reddit.</>
            : <>Could not determine the top moderator from Reddit's moderator list.</>}
        </p>
        <div className="owner-admin-actions">
          <button
            type="button"
            className="glass-btn"
            onClick={() => navigateTo(`https://www.reddit.com/r/${session?.subredditName}/about/edit`)}
          >
            Community settings ↗
          </button>
          <button
            type="button"
            className="glass-btn"
            onClick={() => navigateTo(`https://developers.reddit.com/r/${session?.subredditName}/apps`)}
          >
            App install settings ↗
          </button>
        </div>
      </section>
    </div>
  );
};
