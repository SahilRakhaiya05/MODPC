import React, { useEffect, useState } from 'react';
import type { CrisisRadarResponse } from '../../shared/api';
import { api } from '../utils/api';

type RiskRadarProps = {
  triggerToast: (msg: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
};

const formatAge = (seconds: number) => {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
};

export const RiskRadar: React.FC<RiskRadarProps> = ({ triggerToast }) => {
  const [data, setData] = useState<CrisisRadarResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRadar = async () => {
      setLoading(true);
      try {
        setData(await api.getRadar());
      } catch (error) {
        triggerToast(error instanceof Error ? error.message : 'Crisis Radar failed to refresh.', 'error');
      } finally {
        setLoading(false);
      }
    };
    void loadRadar();
    const interval = window.setInterval(() => void loadRadar(), 18000);
    return () => window.clearInterval(interval);
  }, [triggerToast]);

  const topRules = data?.rulePressure.slice(0, 4) ?? [];
  const pressure = data?.pressureScore ?? 0;

  return (
    <section className="risk-radar">
      <header className="risk-radar-hero">
        <div>
          <span className="module-eyebrow">New mod tool</span>
          <h3>Crisis Radar</h3>
          <p>Ranks urgent reports, rule pressure, trigger activity, audit context, and consensus-ready cases for the next moderator action.</p>
        </div>
        <div className={`risk-meter ${pressure >= 75 ? 'hot' : pressure >= 42 ? 'warm' : 'calm'}`}>
          <span>Pressure</span>
          <strong>{loading ? '...' : pressure}</strong>
          <em>live-only</em>
        </div>
      </header>

      <div className="risk-radar-grid">
        <section className="risk-radar-panel primary">
          <div className="ph-panel-title">
            <span>Action queue</span>
          </div>
          {!data || data.cases.length === 0 ? (
            <p className="moddesk-empty">
              No live reports are currently returned by Reddit for this install.
            </p>
          ) : (
            <div className="risk-case-list">
              {data.cases.map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>{item.title || item.excerpt}</strong>
                    <span>{item.itemType} / {item.reportCount} reports / {formatAge(item.ageSeconds)}</span>
                  </div>
                  <b className={`risk-severity ${item.severity}`}>{item.severity}</b>
                  <p>{item.excerpt}</p>
                  <small>
                    Signals: {item.signals.join(', ')} / Next: {item.recommendedAction.replace('-', ' ')}
                  </small>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="risk-radar-panel">
          <div className="ph-panel-title">
            <span>Rule pressure</span>
          </div>
          <div className="risk-rule-bars">
            {topRules.length === 0 ? (
              <p className="moddesk-empty compact">No rule pressure detected.</p>
            ) : (
              topRules.map((rule) => (
                <div key={rule.rule}>
                  <span>{rule.rule}</span>
                  <strong>{rule.count}</strong>
                  <i style={{ width: `${Math.max(8, rule.percentage)}%` }} />
                </div>
              ))
            )}
          </div>

          <div className="ph-panel-title">
            <span>Dispatch checklist</span>
          </div>
          <ol className="risk-checklist">
            <li>Confirm the report reason matches a written rule.</li>
            <li>Send high-impact user actions to Consensus Desk.</li>
            <li>Use Saved Responses before writing fresh modmail.</li>
            <li>Escalate safety, doxxing, brigade, and ban-evasion patterns.</li>
          </ol>
        </aside>

        <section className="risk-radar-panel events">
          <div className="ph-panel-title">
            <span>Live trigger feed</span>
          </div>
          <div className="risk-event-list">
            {!data || data.recentEvents.length === 0 ? (
              <p className="moddesk-empty compact">Reports, mod actions, and modmail triggers will appear here as Devvit fires them.</p>
            ) : (
              data.recentEvents.map((event) => (
                <article key={event.id}>
                  <strong>{event.kind.replace('-', ' ')}</strong>
                  <span>{event.actor ? `u/${event.actor} / ` : ''}{event.summary}</span>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </section>
  );
};
