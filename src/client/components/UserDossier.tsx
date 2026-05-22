import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';

type Props = {
  username: string | undefined | null;
};

type DossierUser = {
  username: string;
  id: string;
  createdAt: string;
  linkKarma: number;
  commentKarma: number;
  isAdmin: boolean;
  nsfw: boolean;
  hasVerifiedEmail: boolean;
  permalink: string;
};

const formatAccountAge = (iso: string): string => {
  const created = new Date(iso).getTime();
  if (!Number.isFinite(created)) return '—';
  const months = Math.max(0, Math.floor((Date.now() - created) / (1000 * 60 * 60 * 24 * 30.4375)));
  if (months < 1) return '< 1 month';
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem === 0 ? `${years}y` : `${years}y ${rem}m`;
};

const formatKarma = (n: number): string => {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};

const statusLabel = (user: DossierUser): { label: string; tone: 'admin' | 'new' | 'regular' | 'unverified' } => {
  if (user.isAdmin) return { label: 'Reddit admin', tone: 'admin' };
  const months = (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
  if (months < 1) return { label: 'New account', tone: 'new' };
  if (!user.hasVerifiedEmail) return { label: 'Unverified email', tone: 'unverified' };
  return { label: 'Regular user', tone: 'regular' };
};

export const UserDossier: React.FC<Props> = ({ username }) => {
  const [user, setUser] = useState<DossierUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const isUnknown = !username || username === 'deleted' || username === 'unknown';

    const run = async () => {
      if (isUnknown) {
        if (!cancelled) {
          setUser(null);
          setError(null);
          setLoading(false);
        }
        return;
      }
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await api.lookupUser(username);
        if (!cancelled) setUser(res.user ?? null);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Lookup failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (!username) {
    return (
      <aside className="user-dossier empty" aria-label="Participant dossier">
        <span className="user-dossier-eyebrow">Participant dossier</span>
        <p>Select an item to load the author profile.</p>
      </aside>
    );
  }

  if (loading) {
    return (
      <aside className="user-dossier loading" aria-label="Participant dossier">
        <span className="user-dossier-eyebrow">Participant dossier</span>
        <strong>u/{username}</strong>
        <p>Loading from Reddit…</p>
      </aside>
    );
  }

  if (error || !user) {
    return (
      <aside className="user-dossier error" aria-label="Participant dossier">
        <span className="user-dossier-eyebrow">Participant dossier</span>
        <strong>u/{username}</strong>
        <p>{error ?? 'No profile returned — account may be deleted or suspended.'}</p>
      </aside>
    );
  }

  const status = statusLabel(user);

  return (
    <aside className="user-dossier" aria-label="Participant dossier">
      <span className="user-dossier-eyebrow">Participant dossier</span>
      <strong>u/{user.username}</strong>
      <span className={`user-dossier-status tone-${status.tone}`}>{status.label}</span>
      <dl>
        <div>
          <dt>Karma</dt>
          <dd>{formatKarma(user.linkKarma + user.commentKarma)}</dd>
        </div>
        <div>
          <dt>Posts</dt>
          <dd>{formatKarma(user.linkKarma)}</dd>
        </div>
        <div>
          <dt>Comments</dt>
          <dd>{formatKarma(user.commentKarma)}</dd>
        </div>
        <div>
          <dt>Account age</dt>
          <dd>{formatAccountAge(user.createdAt)}</dd>
        </div>
      </dl>
      <p className="user-dossier-note">
        {user.nsfw ? 'Profile marked NSFW. ' : ''}
        Dossier sourced live from reddit.getUserByUsername().
      </p>
    </aside>
  );
};
