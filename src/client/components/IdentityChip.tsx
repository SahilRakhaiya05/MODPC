import React, { useEffect, useRef, useState } from 'react';
import type { SessionResponse, SubredditInstall } from '../../shared/api';

type Props = {
  session: SessionResponse;
  onOpenSettings: () => void;
};

const formatSubs = (n: number | null | undefined): string => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};

export const IdentityChip: React.FC<Props> = ({ session, onOpenSettings }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const username = session.username ?? 'anon';
  const others = session.installs.filter((entry) => entry.subredditName !== session.subredditName);
  const subsLabel = formatSubs(session.subredditSubscribers);

  const switchTo = (install: SubredditInstall) => {
    const url = `https://www.reddit.com/r/${install.subredditName}/about/apps/`;
    window.open(url, '_blank', 'noopener');
    setOpen(false);
  };

  return (
    <div className="identity-chip-wrap" ref={wrapRef}>
      <button
        type="button"
        className="identity-chip"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={`Signed in as u/${username} — moderating r/${session.subredditName}`}
      >
        <span className="identity-sub-avatar" aria-hidden="true">
          {session.subredditIconUrl ? (
            <img src={session.subredditIconUrl} alt="" />
          ) : (
            session.subredditName.slice(0, 2).toUpperCase()
          )}
        </span>
        <span className="identity-text">
          <strong>r/{session.subredditName}</strong>
          <em>
            u/{username}
            {session.isModerator && <span className="identity-mod-pill">MOD</span>}
            {subsLabel && <span className="identity-subs">· {subsLabel}</span>}
          </em>
        </span>
        <svg className="identity-caret" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 4 L5 7 L8 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="identity-menu" role="menu">
          <div className="identity-menu-section">
            <span className="identity-menu-label">Current workspace</span>
            <strong>r/{session.subredditName}</strong>
            <em>
              {session.isModerator
                ? `Moderator${session.modPermissions.length ? ` · ${session.modPermissions.join(', ')}` : ''}`
                : 'Read-only — not a moderator of this community'}
            </em>
          </div>

          {others.length > 0 && (
            <div className="identity-menu-section">
              <span className="identity-menu-label">Switch subreddit ({others.length})</span>
              {others.map((install) => (
                <button
                  key={install.subredditName}
                  type="button"
                  className="identity-menu-item"
                  onClick={() => switchTo(install)}
                  role="menuitem"
                >
                  <span>r/{install.subredditName}</span>
                  {formatSubs(install.subscribers) && <em>{formatSubs(install.subscribers)} members</em>}
                </button>
              ))}
            </div>
          )}

          <div className="identity-menu-section">
            <a
              className="identity-menu-item primary"
              href="https://developers.reddit.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
            >
              Install ModDesk on another subreddit ↗
            </a>
            <button
              type="button"
              className="identity-menu-item"
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
              role="menuitem"
            >
              Workspace settings
            </button>
          </div>

          <p className="identity-menu-foot">
            Devvit installs are per-subreddit. ModDesk remembers communities you've opened so you can hop between them.
          </p>
        </div>
      )}
    </div>
  );
};
