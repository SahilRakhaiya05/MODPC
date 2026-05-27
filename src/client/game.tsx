import './index.css';

/* eslint-disable react-hooks/set-state-in-effect */

import { StrictMode, useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { BootScreen } from './components/BootScreen';
import { DesktopShell } from './components/DesktopShell';
import { AccessGate } from './components/AccessGate';
import { FirstRunWizard } from './components/FirstRunWizard';
import { SystemToast } from './components/SystemToast';
import { api } from './utils/api';
import type { SystemStatus } from './types';
import type { FirstRunStatus, SessionResponse } from '../shared/api';

type Toast = {
  id: string;
  message: string;
  tone: 'info' | 'success' | 'warning' | 'error';
};

const createPreviewStatus = (): SystemStatus => ({
  status: 'preview',
  redisStatus: 'offline-preview',
  settings: {
    subredditName: 'ProductMods',
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
    workspaceMode: 'training',
    liveWritesEnabled: false,
    liveModeEnabledBy: null,
    liveModeEnabledAt: null,
    auditRetentionDays: 180,
    sentinelModel: 'llama-3.3-70b-versatile',
    sentinelTemperature: 0.2,
    sentinelMaxTokens: 900,
    sentinelRagEnabled: true,
    sentinelAllowedTools: ['summarize_queue', 'draft_modmail_reply', 'create_consensus_ticket'],
    sentinelAutomationEnabled: false,
  },
  moderatorProfile: {
    username: 'preview_mod',
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
  modPermissions: ['all'],
  modDeskRole: 'owner',
  workspaceMode: 'training',
  liveWritesEnabled: false,
  subredditIconUrl: null,
  subredditSubscribers: 12400,
  installs: [
    {
      subredditName: 'ProductMods',
      lastSeenAt: new Date().toISOString(),
      iconUrl: null,
      subscribers: 12400,
    },
  ],
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

const applyOwnerDefaults = async (statusData: SystemStatus): Promise<SystemStatus> => {
  const ownerConfig = await api.getOwnerConfig().catch(() => null);
  if (!ownerConfig) return statusData;
  const themeMode = ownerConfig.config.defaultThemeMode === 'high_contrast'
    ? 'high-contrast'
    : ownerConfig.config.defaultThemeMode;
  return {
    ...statusData,
    settings: {
      ...statusData.settings,
      workspaceMode: ownerConfig.config.defaultWorkspaceMode,
      themeMode,
    },
  };
};

export function App() {
  const [data, setData] = useState<SystemStatus | null>(null);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [booting, setBooting] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [setupStatus, setSetupStatus] = useState<FirstRunStatus | null>(null);

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
      const statusData = await applyOwnerDefaults(await api.getStatus());
      setData(statusData);
      if (sessionData.modDeskRole === 'owner' || sessionData.modDeskRole === 'admin') {
        const setup = await api.getSetupStatus().catch(() => null);
        setSetupStatus(setup);
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        setSession(createPreviewSession());
        setData(createPreviewStatus());
        setSetupStatus({ completed: true, completedAt: new Date().toISOString(), completedBy: 'preview_mod' });
        return;
      }
      setError(err instanceof Error ? err.message : 'Unable to load MODPC.');
    }
  }, []);

  const handleReset = useCallback(async () => {
    // Toggles the bootloader sequence for a clean React visual reset
    setBooting(true);
    try {
      const statusData = await applyOwnerDefaults(await api.getStatus());
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
        setError(err instanceof Error ? err.message : 'Unable to load MODPC.');
      });
  }, [refresh]);

  const handleBootComplete = useCallback(() => {
    setBooting(false);
  }, []);

  if (error) {
    return (
      <div className="boot-screen" role="alert">
        <div className="boot-screen-card boot-screen-card--error">
          <header>
            <div className="boot-screen-logo boot-screen-logo--error" aria-hidden="true">!</div>
            <div>
              <h1>MODPC is moderator-only</h1>
              <p>{error}</p>
            </div>
          </header>
          <p className="boot-screen-help">
            Open this app from a subreddit moderator menu, or ask a senior moderator to verify permissions.
          </p>
        </div>
      </div>
    );
  }

  if (session && !session.isModerator) {
    return <AccessGate session={session} />;
  }

  if (!data) {
    return (
      <div className="boot-screen" role="status" aria-live="polite">
        <div className="boot-screen-card boot-screen-card--minimal">
          <header>
            <div className="boot-screen-logo" aria-hidden="true">MD</div>
            <div>
              <h1>Preparing MODPC</h1>
              <p>Loading Redis-backed moderator workspace…</p>
            </div>
          </header>
          <div className="boot-screen-spinner" aria-hidden="true" />
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

  if (
    session &&
    (session.modDeskRole === 'owner' || session.modDeskRole === 'admin') &&
    setupStatus &&
    !setupStatus.completed
  ) {
    return (
      <FirstRunWizard
        session={session}
        onComplete={() => setSetupStatus({
          completed: true,
          completedAt: new Date().toISOString(),
          completedBy: session.username,
        })}
      />
    );
  }

  return (
    <>
      <AccessGate session={session ?? createPreviewSession()}>
        <DesktopShell
          statusData={data}
          session={session ?? createPreviewSession()}
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
