import type React from 'react';
import type { SessionResponse } from '../../shared/api';

type AccessGateProps = {
  session: SessionResponse;
  children?: React.ReactNode;
};

export const AccessGate: React.FC<AccessGateProps> = ({ session, children }) => {
  if (session.isModerator) return <>{children}</>;

  return (
    <main className="access-gate">
      <section className="access-card">
        <div className="access-mark">MD</div>
        <span className="ph-kicker">Moderator access required</span>
        <h1>ModDesk OS is locked for this account.</h1>
        <p>
          Reddit session: <strong>{session.username ? `u/${session.username}` : 'not logged in'}</strong>
        </p>
        <p>
          Community: <strong>r/{session.subredditName}</strong>
        </p>
        <div className="access-errors">
          {session.errors.map((error) => (
            <div key={error.code}>
              <strong>{error.code}</strong>
              <span>{error.message}</span>
            </div>
          ))}
        </div>
        <p className="access-note">
          Open the app from the subreddit moderator menu. Reddit handles account session and identity; ModDesk does not use a custom login.
        </p>
      </section>
    </main>
  );
};
