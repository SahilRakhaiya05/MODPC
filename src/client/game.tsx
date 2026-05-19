import './index.css';

/* eslint-disable react-hooks/set-state-in-effect */

import { StrictMode, useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { BootScreen } from './components/BootScreen';
import { DesktopShell } from './components/DesktopShell';
import { AccessGate } from './components/AccessGate';
import { SystemToast } from './components/SystemToast';
import { RetroWindow } from './components/RetroWindow';
import { api } from './utils/api';
import type { SystemStatus } from './types';
import type { SessionResponse } from '../shared/api';

type Toast = {
  id: string;
  message: string;
  tone: 'info' | 'success' | 'warning' | 'error';
};

const createPreviewStatus = (): SystemStatus => ({
  status: 'preview',
  redisStatus: 'offline-preview',
  settings: {
    subredditName: 'r/ProductMods (Standalone)',
    initializedAt: new Date().toISOString(),
    consensusThresholdMode: 'percent',
    consensusFixedCount: 3,
    consensusPercent: 66,
    highImpactActions: ['permanent ban', 'mass removal', 'settings change'],
    trainingRequiredLevel: 2,
    themeMode: 'modern',
    queueScoringConfig: { reportWeight: 1.5, ageWeight: 0.1, keyWeight: 5 },
    mobileCompactMode: true,
    anonymousVotesUntilClosed: true,
    templateApprovalRequired: false,
    scenarioDifficultyMix: 'balanced',
  },
  moderatorProfile: {
    username: 'u/preview_mod',
    firstSeenAt: new Date().toISOString(),
    roleLabel: 'Lead moderator',
    trainingLevel: 4,
    xp: 276,
    totalScenarios: 28,
    correctScenarios: 24,
    queueReviewed: 139,
    consensusVotesCast: 17,
    lastActiveAt: new Date().toISOString(),
    streak: 6,
    missedConcepts: ['edge-case harassment', 'brigade signals'],
  },
  recentAudits: [
    {
      eventId: 'preview-1',
      actor: 'u/preview_mod',
      eventType: 'queue.reviewed',
      entityType: 'comment',
      entityId: 't1_preview',
      summary: 'Cleared a reported comment after rule match review.',
      before: null,
      after: null,
      createdAt: new Date().toISOString(),
    },
    {
      eventId: 'preview-2',
      actor: 'u/senior_mod',
      eventType: 'consensus.created',
      entityType: 'user',
      entityId: 'preview-user',
      summary: 'Opened a consensus ticket for repeated spam behavior.',
      before: null,
      after: null,
      createdAt: new Date(Date.now() - 1000 * 60 * 16).toISOString(),
    },
    {
      eventId: 'preview-3',
      actor: 'u/automod_helper',
      eventType: 'automod.drafted',
      entityType: 'thread',
      entityId: 'preview-thread',
      summary: 'Drafted a link-frequency rule for moderator approval.',
      before: null,
      after: null,
      createdAt: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    },
  ],
});

const createPreviewSession = (): SessionResponse => ({
  username: 'preview_mod',
  subredditName: 'ProductMods',
  isModerator: true,
  errors: [],
  capabilities: {
    queue: { enabled: true, live: false, detail: 'Local preview data' },
    modmail: { enabled: true, live: false, detail: 'Local preview data' },
    automod: { enabled: true, live: false, detail: 'Local preview data' },
    modlog: { enabled: true, live: false, detail: 'Local preview data' },
    users: { enabled: true, live: false, detail: 'Local preview data' },
    flairs: { enabled: true, live: false, detail: 'Local preview data' },
    insights: { enabled: true, live: false, detail: 'Local preview data' },
  },
});

export function App() {
  const [data, setData] = useState<SystemStatus | null>(null);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [booting, setBooting] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    setToasts((items) => [...items, { id: `${Date.now()}-${Math.random()}`, message, tone }]);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const sessionData = await api.getSession();
      setSession(sessionData);
      if (!sessionData.isModerator) {
        setData(null);
        setBooting(false);
        return;
      }
      const statusData = await api.getStatus();
      setData(statusData);
    } catch (err) {
      if (import.meta.env.DEV) {
        setSession(createPreviewSession());
        setData(createPreviewStatus());
        return;
      }
      setError(err instanceof Error ? err.message : 'Unable to load ModDesk OS.');
    }
  }, []);

  const handleReset = useCallback(async () => {
    // Toggles the bootloader sequence for a clean React visual reset
    setBooting(true);
    try {
      const statusData = await api.getStatus();
      setData(statusData);
    } catch (err) {
      if (import.meta.env.DEV) {
        setSession(createPreviewSession());
        setData(createPreviewStatus());
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to refresh state after system reset.');
    } finally {
      // Allow a brief delay for system initialization feeling
      setTimeout(() => {
        setBooting(false);
      }, 1000);
    }
  }, []);

  useEffect(() => {
    refresh()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load ModDesk OS.');
      });
  }, [refresh]);

  const handleBootComplete = useCallback(() => {
    setBooting(false);
  }, []);

  if (error) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100vw',
        height: '100vh',
        backgroundColor: 'var(--desktop-bg)',
        fontFamily: 'var(--font-body)',
        color: '#fff',
        padding: '20px'
      }}>
        <div style={{ width: '100%', maxWidth: '520px', position: 'relative' }}>
          <RetroWindow
            id="error-fallback"
            title="Access Check Failed"
            icon="⚠️"
            isOpen={true}
            onClose={() => {}}
            isActive={true}
            onFocus={() => {}}
            defaultPosition={{ x: 0, y: 0 }}
            defaultSize={{ width: '100%', height: '360px' }}
          >
            <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#ef4444' }}>ModDesk OS is private.</h1>
              <p style={{ fontSize: '13px', lineHeight: '1.5', color: '#cbd5e1' }}>{error}</p>
              <p style={{ fontSize: '12px', lineHeight: '1.5', color: '#94a3b8' }}>
                Open this app from a subreddit moderator menu or ask a senior moderator to verify permissions.
              </p>
            </div>
          </RetroWindow>
        </div>
      </div>
    );
  }

  if (session && !session.isModerator) {
    return <AccessGate session={session} />;
  }

  if (!data) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100vw',
        height: '100vh',
        backgroundColor: 'var(--desktop-bg)',
        fontFamily: 'var(--font-body)',
        color: '#fff',
        padding: '20px'
      }}>
        <div style={{ width: '100%', maxWidth: '520px', position: 'relative' }}>
          <RetroWindow
            id="loading-fallback"
            title="Loading Operations Room"
            icon="⚙️"
            isOpen={true}
            onClose={() => {}}
            isActive={true}
            onFocus={() => {}}
            defaultPosition={{ x: 0, y: 0 }}
            defaultSize={{ width: '100%', height: '320px' }}
          >
            <div style={{ padding: '20px 0', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h1 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--accent-gold)' }}>Preparing ModDesk OS</h1>
              <p style={{ fontSize: '13px', color: 'var(--glass-text-muted)' }}>
                Loading Redis-backed moderator workspace...
              </p>
            </div>
          </RetroWindow>
        </div>
      </div>
    );
  }

  if (booting) {
    return (
      <BootScreen
        onComplete={handleBootComplete}
        subredditName={data.settings.subredditName}
      />
    );
  }

  return (
    <>
      <AccessGate session={session ?? createPreviewSession()}>
        <DesktopShell
          statusData={data}
          triggerToast={addToast}
          onReset={handleReset}
        />
      </AccessGate>
      <div style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 999999,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        pointerEvents: 'none'
      }}>
        {toasts.map((toast) => (
          <div key={toast.id} style={{ pointerEvents: 'auto' }}>
            <SystemToast
              message={toast.message}
              type={toast.tone}
              onClose={() => setToasts((items) => items.filter((item) => item.id !== toast.id))}
            />
          </div>
        ))}
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
