/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

type ModLogConsoleProps = {
  triggerToast: (msg: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
};

type ModLogEvent = {
  eventId: string;
  actor: string;
  eventType: string;
  entityType: string;
  entityId: string;
  summary: string;
  createdAt: string;
};

export const ModLogConsole: React.FC<ModLogConsoleProps> = ({ triggerToast }) => {
  const [logs, setLogs] = useState<ModLogEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterActor, setFilterActor] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await api.getLiveModlog();
      setLogs(res.logs);
      triggerToast('Moderation action logs synced successfully.', 'success');
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : 'Failed to fetch live moderation logs.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLogs();
  }, []);

  // Filter logic
  const filteredLogs = logs.filter(log => {
    const matchesActor = !filterActor || log.actor.toLowerCase().includes(filterActor.toLowerCase());
    const matchesType = filterType === 'all' || log.eventType.toLowerCase() === filterType.toLowerCase();
    
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = !searchQuery || 
      log.summary.toLowerCase().includes(searchLower) ||
      log.actor.toLowerCase().includes(searchLower) ||
      log.eventType.toLowerCase().includes(searchLower) ||
      log.entityId.toLowerCase().includes(searchLower);

    return matchesActor && matchesType && matchesSearch;
  });

  // Extract unique mod actors for filtering dropdown
  const uniqueActors = Array.from(new Set(logs.map(log => log.actor))).filter(Boolean);
  // Extract unique action types for filtering dropdown
  const uniqueTypes = Array.from(new Set(logs.map(log => log.eventType))).filter(Boolean);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', color: '#e2e8f0', fontFamily: 'var(--font-body)' }}>
      {/* Top Filter and Controls Bar */}
      <div 
        className="glass-panel" 
        style={{ 
          padding: '12px 16px', 
          background: 'rgba(0, 0, 0, 0.2)', 
          borderColor: 'var(--glass-border)',
          borderRadius: '10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Search input */}
          <input
            type="text"
            placeholder="Search modlog events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="glass-input"
            style={{ width: '180px', fontSize: '11px', padding: '6px 12px' }}
          />

          {/* Actor filter dropdown */}
          <select
            value={filterActor}
            onChange={(e) => setFilterActor(e.target.value)}
            style={{
              background: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '6px',
              padding: '5px 10px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              color: '#fff',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="">[Filter Moderator]</option>
            {uniqueActors.map(actor => (
              <option key={actor} value={actor}>{actor}</option>
            ))}
          </select>

          {/* Event type filter dropdown */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{
              background: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '6px',
              padding: '5px 10px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              color: '#fff',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="all">[Filter Action Type]</option>
            {uniqueTypes.map(type => (
              <option key={type} value={type}>{type.toUpperCase()}</option>
            ))}
          </select>
        </div>

        <button 
          className="glass-btn primary" 
          onClick={fetchLogs} 
          disabled={loading}
          style={{ padding: '6px 14px', fontSize: '10px' }}
        >
          {loading ? 'SYNCING...' : '🔄 SYNC MODLOG'}
        </button>
      </div>

      {/* Main Terminal Output Console */}
      <div 
        className="glass-panel"
        style={{
          flexGrow: 1,
          backgroundColor: '#040406',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          padding: '16px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          minHeight: 0
        }}
      >
        {loading && logs.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#10b981', fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '32px 0' }}>
            &gt; STABILIZING REDDIT ENDPOINT SECURITY BRIDGES...<br/>
            &gt; SYNCING REAL-TIME AUDIT LOG FEEDSTREAM...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--glass-text-muted)', fontFamily: 'var(--font-mono)', fontSize: '11px', padding: '32px 0' }}>
            &gt; NO RELEVANT EVENTS FOUND IN THE FILTERED TARGET SUBSET.
          </div>
        ) : (
          filteredLogs.map((log) => {
            let badgeBg = 'rgba(255,255,255,0.05)';
            let badgeColor = '#94a3b8';
            const action = log.eventType.toLowerCase();

            if (action.includes('remove') || action.includes('ban') || action.includes('mute')) {
              badgeBg = 'rgba(239, 68, 68, 0.12)';
              badgeColor = '#f87171';
            } else if (action.includes('approve') || action.includes('accept')) {
              badgeBg = 'rgba(16, 185, 129, 0.12)';
              badgeColor = '#34d399';
            } else if (action.includes('edit') || action.includes('config') || action.includes('wiki')) {
              badgeBg = 'rgba(56, 189, 248, 0.12)';
              badgeColor = '#38bdf8';
            }

            return (
              <div 
                key={log.eventId}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  lineHeight: '1.6',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.02)',
                  paddingBottom: '8px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px'
                }}
              >
                {/* Timestamp */}
                <span style={{ color: 'var(--glass-text-muted)', flexShrink: 0, width: '75px' }}>
                  [{new Date(log.createdAt).toLocaleTimeString()}]
                </span>

                {/* Actor */}
                <span style={{ color: '#fb923c', fontWeight: 600, flexShrink: 0, width: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  u/{log.actor}
                </span>

                {/* Event Type Badge */}
                <span 
                  style={{
                    backgroundColor: badgeBg,
                    color: badgeColor,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '8px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    flexShrink: 0,
                    width: '90px',
                    textAlign: 'center',
                    border: `1px solid ${badgeColor}20`
                  }}
                >
                  {log.eventType}
                </span>

                {/* Summary Description */}
                <span style={{ color: '#e2e8f0', flexGrow: 1 }}>
                  {log.summary}{' '}
                  {log.entityId && (
                    <span style={{ color: 'var(--glass-text-muted)', fontSize: '9px' }}>
                      (id: {log.entityId})
                    </span>
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Terminal Stats Footer */}
      <div 
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          fontSize: '9px', 
          fontFamily: 'var(--font-mono)', 
          color: 'var(--glass-text-muted)' 
        }}
      >
        <span>SYS_LOG_POINTER: {logs.length} RECORDS COMPILATION</span>
        <span>SECURITY FEED: SECURE ENCRYPTED HTTPS OVERRIDE</span>
      </div>
    </div>
  );
};
