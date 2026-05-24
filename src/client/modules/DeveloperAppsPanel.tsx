import { navigateTo } from '@devvit/web/client';
import React from 'react';
import type { SessionResponse } from '../../shared/api';

type DeveloperAppsPanelProps = {
  session?: SessionResponse | undefined;
};

const openUrl = (url: string) => {
  navigateTo(url);
};

export const DeveloperAppsPanel: React.FC<DeveloperAppsPanelProps> = ({ session }) => {
  const subreddit = session?.subredditName ?? 'current subreddit';
  const role = session?.modDeskRole ?? 'observer';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', height: '100%', color: '#e2e8f0' }}>
      <header className="settings-header">
        <div>
          <span className="module-eyebrow">Community Apps</span>
          <h3>Reddit Developer Apps</h3>
          <p>Official Reddit Developer Platform links and install status for r/{subreddit}. App installation and removal are managed on Reddit when Devvit does not expose an in-app management API.</p>
        </div>
        <div className="settings-session">
          <span>Role</span>
          <strong>{role === 'owner' ? 'Owner' : role === 'admin' ? 'Admin' : role === 'moderator' ? 'Moderator' : role === 'trainee' ? 'Trainee' : 'Observer'}</strong>
        </div>
      </header>

      <section className="settings-card">
        <span className="module-eyebrow">Current install</span>
        <div className="settings-capability-grid">
          <article>
            <strong>Connected subreddit</strong>
            <span className="available">r/{subreddit}</span>
            <em>Devvit provides the active subreddit context to the server.</em>
          </article>
          <article>
            <strong>Install management</strong>
            <span className="limited">Managed on Reddit Developer Platform</span>
            <em>ModDesk links out instead of faking install, delete, or version controls that are not exposed in the app API.</em>
          </article>
          <article>
            <strong>Required permissions</strong>
            <span className="available">Reddit moderator scope</span>
            <em>Reddit API, Redis, and allow-listed Groq HTTP are declared in devvit.json.</em>
          </article>
        </div>
      </section>

      <section className="settings-card">
        <span className="module-eyebrow">Official links</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
          <button type="button" className="glass-btn primary" onClick={() => openUrl('https://developers.reddit.com/apps')}>
            Open Developer Apps
          </button>
          <button type="button" className="glass-btn" onClick={() => openUrl('https://developers.reddit.com/docs')}>
            Open Developer Docs
          </button>
          <button type="button" className="glass-btn" onClick={() => openUrl(`https://developers.reddit.com/r/${subreddit}/apps`)}>
            Manage r/{subreddit} Apps
          </button>
        </div>
      </section>

      <section className="settings-card">
        <span className="module-eyebrow">Boundary</span>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px', lineHeight: 1.6 }}>
          ModDesk can show app context and official deep links. If Reddit later exposes supported install, uninstall, or version-management APIs inside Devvit Web, those actions should be owner-only, confirmation-gated, and audited before enabling here.
        </p>
      </section>
    </div>
  );
};
