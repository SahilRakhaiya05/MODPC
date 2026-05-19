/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import React, { useEffect, useState } from 'react';
import type { LiveInsightResponse } from '../../shared/api';
import { api } from '../utils/api';

type InsightsPanelProps = {
  triggerToast: (msg: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
};

export const InsightsPanel: React.FC<InsightsPanelProps> = ({ triggerToast }) => {
  const [data, setData] = useState<LiveInsightResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadInsights = async () => {
    setLoading(true);
    try {
      setData(await api.getLiveInsights());
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : 'Failed to load insights.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadInsights();
  }, []);

  if (loading && !data) {
    return <div className="module-empty">Loading moderation insights...</div>;
  }

  if (!data) {
    return <div className="module-empty">No insight data available.</div>;
  }

  const maxActivity = Math.max(...data.activityStats.map((point) => point.count), 1);

  return (
    <div className="insights-panel">
      <div className="insight-kpis">
        <button><strong>{data.queueOpen}</strong><span>open queue</span></button>
        <button><strong>{data.queueCritical}</strong><span>critical queue</span></button>
        <button><strong>{data.modmailOpen ?? 'n/a'}</strong><span>open modmail</span></button>
        <button><strong>{data.automodState}</strong><span>automod state</span></button>
      </div>

      <div className="insight-grid">
        <section className="glass-panel insight-card">
          <div className="ph-panel-title">
            <span>Workspace activity ({data.source})</span>
            <button onClick={loadInsights}>Refresh</button>
          </div>
          <div className="insight-bars">
            {data.activityStats.length === 0 ? (
              <div className="module-empty compact">No audit activity yet.</div>
            ) : (
              data.activityStats.map((point) => (
                <div key={point.label}>
                  <span style={{ height: `${Math.max(16, (point.count / maxActivity) * 150)}px` }} />
                  <em>{point.label}</em>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="glass-panel insight-card">
          <div className="ph-panel-title"><span>Rule pressure</span></div>
          <div className="insight-rules">
            {data.rulesViolated.length === 0 ? (
              <p>No mapped rule pressure from the current queue.</p>
            ) : (
              data.rulesViolated.map((rule) => (
                <div key={rule.rule}>
                  <strong>{rule.rule}</strong>
                  <span>{rule.count} report signals</span>
                  <i style={{ width: `${rule.percentage}%` }} />
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="glass-panel insight-card">
        <div className="ph-panel-title">
          <span>Live capability feed</span>
          <small>{new Date(data.generatedAt).toLocaleTimeString()}</small>
        </div>
        <div className="insight-log">
          {data.telemetryLogs.map((log) => (
            <div key={`${log.timestamp}-${log.message}`}>
              <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
              <p>{log.message}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
