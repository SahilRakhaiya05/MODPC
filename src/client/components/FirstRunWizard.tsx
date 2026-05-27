import React, { useState } from 'react';
import { navigateTo } from '@devvit/web/client';
import type { OwnerWorkspaceConfig, SessionResponse } from '../../shared/api';
import { api } from '../utils/api';

type FirstRunWizardProps = {
  session: SessionResponse;
  onComplete: () => void;
};

type Step = 0 | 1 | 2 | 3;

export const FirstRunWizard: React.FC<FirstRunWizardProps> = ({ session, onComplete }) => {
  const [step, setStep] = useState<Step>(0);
  const [config, setConfig] = useState<Partial<OwnerWorkspaceConfig>>({
    defaultWorkspaceMode: 'live',
    requireConfirmationOnLive: true,
    allowTraineeAccess: true,
    defaultThemeMode: 'modern',
    welcomeMessage: `Welcome to MODPC for r/${session.subredditName}. Pick your queue from the dock and keep good notes.`,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const finish = async () => {
    setSaving(true);
    setError('');
    try {
      await api.saveOwnerConfig(config);
      await api.completeSetup();
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed.');
    } finally {
      setSaving(false);
    }
  };

  const skip = async () => {
    setSaving(true);
    try {
      await api.completeSetup();
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not finalize setup.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="wizard-shell">
      <section className="wizard-card">
        <header className="wizard-header">
          <div className="wizard-mark">MD</div>
          <div>
            <span className="ph-kicker">First-run setup · {step + 1} / 4</span>
            <h1>Welcome to MODPC, u/{session.username ?? 'owner'}</h1>
            <p>Configure workspace defaults for the moderators of r/{session.subredditName}. You can change anything later from Owner Admin.</p>
          </div>
        </header>

        <div className="wizard-progress">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={i <= step ? 'on' : ''} />
          ))}
        </div>

        {step === 0 && (
          <section className="wizard-step">
            <h2>1 · Workspace mode</h2>
            <p>Choose how moderators start each session.</p>
            <label className={`wizard-choice ${config.defaultWorkspaceMode === 'live' ? 'on' : ''}`}>
              <input
                type="radio"
                name="mode"
                checked={config.defaultWorkspaceMode === 'live'}
                onChange={() => setConfig({ ...config, defaultWorkspaceMode: 'live' })}
              />
              <div>
                <strong>Live</strong>
                <span>Real Reddit data. Recommended for experienced mod teams.</span>
              </div>
            </label>
            <label className={`wizard-choice ${config.defaultWorkspaceMode === 'training' ? 'on' : ''}`}>
              <input
                type="radio"
                name="mode"
                checked={config.defaultWorkspaceMode === 'training'}
                onChange={() => setConfig({ ...config, defaultWorkspaceMode: 'training' })}
              />
              <div>
                <strong>Training</strong>
                <span>Sandbox scenarios + Mod Academy. Good for onboarding new mods before they touch the live queue.</span>
              </div>
            </label>
            <div className="wizard-actions">
              <button
                type="button"
                className="glass-btn primary"
                onClick={() => navigateTo('https://www.reddit.com/subreddits/create')}
              >
                Create a subreddit on Reddit
              </button>
              <p className="wizard-hint">
                MODPC cannot create a subreddit automatically. Use Reddit's community creation page first, then install
                MODPC into the new subreddit as an owner or admin.
              </p>
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="wizard-step">
            <h2>2 · Safety guardrails</h2>
            <label className="wizard-toggle">
              <input
                type="checkbox"
                checked={config.requireConfirmationOnLive ?? true}
                onChange={(e) => setConfig({ ...config, requireConfirmationOnLive: e.target.checked })}
              />
              <div>
                <strong>Require confirmation on destructive actions</strong>
                <span>Bans, mass removals, and settings changes need a typed confirmation. Recommended.</span>
              </div>
            </label>
            <label className="wizard-toggle">
              <input
                type="checkbox"
                checked={config.allowTraineeAccess ?? true}
                onChange={(e) => setConfig({ ...config, allowTraineeAccess: e.target.checked })}
              />
              <div>
                <strong>Allow trainees to view the workspace</strong>
                <span>Read-only access to queue, modmail, and #team chat. No destructive actions.</span>
              </div>
            </label>
          </section>
        )}

        {step === 2 && (
          <section className="wizard-step">
            <h2>3 · Look and feel</h2>
            <p>Default theme. Each moderator can override in their personal preferences.</p>
            {(['modern', 'authentic', 'high_contrast'] as const).map((t) => (
              <label key={t} className={`wizard-choice ${config.defaultThemeMode === t ? 'on' : ''}`}>
                <input
                  type="radio"
                  name="theme"
                  checked={config.defaultThemeMode === t}
                  onChange={() => setConfig({ ...config, defaultThemeMode: t })}
                />
                <div>
                  <strong>{t === 'modern' ? 'Modern' : t === 'authentic' ? 'Authentic' : 'High contrast'}</strong>
                  <span>
                    {t === 'modern' ? 'Cream paper, soft shadows. Default.' :
                     t === 'authentic' ? 'Classic terminal palette.' :
                     'Higher contrast for accessibility.'}
                  </span>
                </div>
              </label>
            ))}
          </section>
        )}

        {step === 3 && (
          <section className="wizard-step">
            <h2>4 · Welcome message</h2>
            <p>Shown on the MODPC home screen for every moderator.</p>
            <textarea
              rows={4}
              maxLength={500}
              value={config.welcomeMessage ?? ''}
              onChange={(e) => setConfig({ ...config, welcomeMessage: e.target.value })}
            />
            <p className="wizard-hint">{(config.welcomeMessage ?? '').length}/500</p>
          </section>
        )}

        {error && <p className="wizard-error">{error}</p>}

        <footer className="wizard-footer">
          <button type="button" className="glass-btn" onClick={skip} disabled={saving}>
            Skip — use defaults
          </button>
          <div className="wizard-footer-right">
            {step > 0 && (
              <button type="button" className="glass-btn" onClick={() => setStep((s) => (s - 1) as Step)} disabled={saving}>
                Back
              </button>
            )}
            {step < 3 ? (
              <button type="button" className="glass-btn primary" onClick={() => setStep((s) => (s + 1) as Step)} disabled={saving}>
                Next
              </button>
            ) : (
              <button type="button" className="glass-btn primary" onClick={finish} disabled={saving}>
                {saving ? 'Saving…' : 'Finish setup'}
              </button>
            )}
          </div>
        </footer>
      </section>
    </main>
  );
};
