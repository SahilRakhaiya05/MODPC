import type React from 'react';
import type { SessionResponse } from '../../shared/api';
import { navigateTo } from '@devvit/web/client';

type AccessGateProps = {
  session: SessionResponse;
  children?: React.ReactNode;
};

export const AccessGate: React.FC<AccessGateProps> = ({ session, children }) => {
  if (session.isModerator) return <>{children}</>;

  const sub = session.subredditName;
  const username = session.username;

  return (
    <main className="access-gate">
      <section className="access-card access-card-rich">
        <header className="access-rich-header">
          <div className="access-mark">MD</div>
          <div>
            <span className="ph-kicker">ModDesk OS</span>
            <h1>For moderators of r/{sub}</h1>
            <p className="access-tagline">
              This is the private moderator workspace. Regular community members don't have access.
            </p>
          </div>
        </header>

        <section className="access-rich-status">
          <article>
            <span className="access-label">Reddit session</span>
            <strong>{username ? `u/${username}` : 'not signed in'}</strong>
          </article>
          <article>
            <span className="access-label">Community</span>
            <strong>r/{sub}</strong>
          </article>
          <article>
            <span className="access-label">Your role</span>
            <strong>{username ? 'Subscriber / visitor' : '—'}</strong>
          </article>
        </section>

        <section className="access-rich-explainer">
          <h2>How to get in</h2>
          <ol>
            <li>
              <strong>Be a moderator of r/{sub}.</strong> Reddit identity is the only login — ModDesk does not have its
              own account system. If you should be a moderator, ask the community owner to add you.
            </li>
            <li>
              <strong>Open from the mod menu.</strong> ModDesk appears in the subreddit's moderator post menu after the
              owner installs it.
            </li>
            <li>
              <strong>Re-check permissions.</strong> If you were just added as a moderator, refresh — Reddit caches mod
              lists for a few minutes.
            </li>
          </ol>
        </section>

        {session.errors.length > 0 && (
          <section className="access-rich-errors">
            <span className="access-label">Server response</span>
            {session.errors.map((error) => (
              <div key={error.code} className="access-rich-error-row">
                <code>{error.code}</code>
                <span>{error.message}</span>
              </div>
            ))}
          </section>
        )}

        <footer className="access-rich-footer">
          <button
            type="button"
            className="glass-btn primary"
            onClick={() => navigateTo(`https://www.reddit.com/r/${sub}`)}
          >
            Visit r/{sub} ↗
          </button>
          <button
            type="button"
            className="glass-btn"
            onClick={() => navigateTo(`https://www.reddit.com/r/${sub}/about/moderators`)}
          >
            See moderators ↗
          </button>
          <button
            type="button"
            className="glass-btn"
            onClick={() => navigateTo('https://developers.reddit.com/apps')}
          >
            About ModDesk ↗
          </button>
        </footer>

        <p className="access-rich-note">
          ModDesk is a Devvit app. Each subreddit installs its own copy; your access is scoped to communities you
          actively moderate.
        </p>
      </section>
    </main>
  );
};
