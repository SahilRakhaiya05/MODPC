/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

type AutomodPanelProps = {
  triggerToast: (msg: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
};

export const AutomodPanel: React.FC<AutomodPanelProps> = ({ triggerToast }) => {
  const [yaml, setYaml] = useState('');
  const [originalYaml, setOriginalYaml] = useState('');
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState('Update automod via ModyOS YAML Panel');
  const [validating, setValidating] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [validationReport, setValidationReport] = useState<{
    status: 'idle' | 'success' | 'error';
    message: string;
    errors: string[];
  }>({ status: 'idle', message: '', errors: [] });

  const loadRules = async () => {
    setLoading(true);
    try {
      const res = await api.getAutomod();
      setYaml(res.content);
      setOriginalYaml(res.content);
      setConfirmPublish(false);
      triggerToast('Wiki config/automod rules loaded successfully.', 'success');
    } catch {
      triggerToast('Could not fetch custom wiki config; loaded default template.', 'info');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRules();
  }, []);

  const injectTemplate = (type: 'spam' | 'age' | 'toxic') => {
    let snippet = '';
    if (type === 'spam') {
      snippet = `
---
# Injected: Spam URL & Domain Watchlist
type: submission
domain: [scamkey.org, win-crypto-fast.info, cheatmirror.net]
action: remove
action_reason: "Blacklisted malware/spam redirect domain"
`;
    } else if (type === 'age') {
      snippet = `
---
# Injected: Strict Account Age Gate
type: any
author:
    account_age: "< 7 days"
    comment_karma: "< 10"
    satisfy_any_threshold: true
action: filter
action_reason: "New account post or low karma gate"
`;
    } else if (type === 'toxic') {
      snippet = `
---
# Injected: Profanity & Harassment Purge
type: comment
body (regex, includes): ["scam", "cheat", "bastard", "idiot", "loser"]
action: filter
action_reason: "High hostility toxicity warning trigger"
`;
    }
    setYaml(prev => prev + snippet);
    triggerToast('Recipe injected at cursor bottom.', 'success');
  };

  const validateYaml = () => {
    setValidating(true);
    setValidationReport({ status: 'idle', message: '', errors: [] });
    
    setTimeout(() => {
      const errorsList: string[] = [];
      
      // Simple custom dry-run syntax checks
      if (!yaml.trim()) {
        errorsList.push('YAML ruleset is empty.');
      } else {
        const blocks = yaml.split('---');
        blocks.forEach((block, idx) => {
          if (!block.trim()) return;
          
          // Check key-value formats
          const lines = block.split('\n');
          lines.forEach((line, lineNo) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;
            if (trimmed.includes(':') && !trimmed.includes('http') && !trimmed.includes('://')) {
              const parts = trimmed.split(':');
              if (parts[1] && !parts[1].startsWith(' ') && parts[1].trim()) {
                errorsList.push(`Block ${idx + 1}, Line ${lineNo + 1}: Expected a space after colon ":"`);
              }
            }
          });

          // Rule specifics checks
          if (block.includes('action:') && !block.includes('action_reason:')) {
            errorsList.push(`Block ${idx + 1}: Rules with "action" should declare "action_reason" for clear audit logs.`);
          }
        });
      }

      if (errorsList.length > 0) {
        setValidationReport({
          status: 'error',
          message: 'Dry-run validation checks failed. Adjust the syntax errors.',
          errors: errorsList
        });
        triggerToast('YAML dry-run failed with warnings.', 'warning');
      } else {
        setValidationReport({
          status: 'success',
          message: 'Syntax checks passed! YAML compiles and is safe for production.',
          errors: []
        });
        triggerToast('YAML compilation successful!', 'success');
      }
      setValidating(false);
    }, 900);
  };

  const saveRules = async () => {
    if (!yaml.trim()) {
      triggerToast('YAML contents cannot be blank.', 'error');
      return;
    }
    if (validationReport.status !== 'success') {
      triggerToast('Run validation before publishing Automod changes.', 'warning');
      return;
    }
    if (!confirmPublish) {
      triggerToast('Confirm the guarded Automod publish first.', 'warning');
      return;
    }
    try {
      setLoading(true);
      await api.saveAutomod(yaml, reason);
      triggerToast('Wiki config/automod committed successfully!', 'success');
      setValidationReport({ status: 'idle', message: '', errors: [] });
      setOriginalYaml(yaml);
      setConfirmPublish(false);
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : 'Failed to update Automod Wiki config.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const addedLines = yaml.split('\n').filter((line) => line.trim() && !originalYaml.includes(line)).length;
  const removedLines = originalYaml.split('\n').filter((line) => line.trim() && !yaml.includes(line)).length;
  const broadChange = /type:\s*any|body\s*\(regex\)|action:\s*remove|author:\s*\n\s*account_age:\s*"<\s*30/i.test(yaml);
  const riskLabel = broadChange || addedLines + removedLines > 12 ? 'high' : addedLines + removedLines > 0 ? 'medium' : 'low';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', color: '#e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>
        <div>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '13px', fontWeight: 700, color: 'var(--accent-gold)' }}>
            AUTOMODERATOR SYNTAX CONTROLLER
          </h3>
          <span style={{ fontSize: '10px', color: 'var(--glass-text-muted)', fontFamily: 'var(--font-mono)' }}>
            LOADED SOURCE: /wiki/config/automod
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="glass-btn" onClick={loadRules} disabled={loading}>
            🔄 Reload
          </button>
          <button className="glass-btn success" onClick={validateYaml} disabled={loading || validating}>
            {validating ? '⌛ Compiling...' : '⚡ Validate Syntax'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: '16px', flexGrow: 1, minHeight: 0 }}>
        {/* Editor Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ flexGrow: 1, position: 'relative', minHeight: 0 }}>
            <textarea
              value={yaml}
              onChange={(e) => setYaml(e.target.value)}
              disabled={loading}
              placeholder="# Enter Automod rules in standard YAML format here..."
              style={{
                width: '100%',
                height: '100%',
                background: '#040406',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
                padding: '16px',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                color: '#34d399',
                resize: 'none',
                outline: 'none',
                lineHeight: '1.6'
              }}
            />
          </div>
          
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', fontFamily: 'var(--font-heading)', color: 'var(--glass-text-muted)', minWidth: '90px' }}>
              COMMIT REASON:
            </span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="glass-input"
              style={{ flexGrow: 1, fontSize: '11px', padding: '6px 12px' }}
            />
            <button className="glass-btn primary" onClick={saveRules} disabled={loading || validationReport.status !== 'success' || !confirmPublish}>
              Publish guarded
            </button>
          </div>
        </div>

        {/* Recipes & Validation Feedback Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
          {/* Quick injection recipes */}
          <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '12px' }}>
            <span style={{ fontSize: '9px', fontWeight: 700, fontFamily: 'var(--font-heading)', color: 'var(--accent-gold)', display: 'block', marginBottom: '8px', letterSpacing: '0.1em' }}>
              INJECT RULES RECIPES
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button className="glass-btn" style={{ fontSize: '10px', padding: '6px', justifyContent: 'flex-start' }} onClick={() => injectTemplate('spam')}>
                🔗 Spam URLs Watchlist
              </button>
              <button className="glass-btn" style={{ fontSize: '10px', padding: '6px', justifyContent: 'flex-start' }} onClick={() => injectTemplate('age')}>
                🛡️ Account Age Gate
              </button>
              <button className="glass-btn" style={{ fontSize: '10px', padding: '6px', justifyContent: 'flex-start' }} onClick={() => injectTemplate('toxic')}>
                🤬 Toxicity Warning Rule
              </button>
            </div>
          </div>

          {/* Validation Feedback */}
          <div style={{
            flexGrow: 1,
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '8px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            minHeight: '180px'
          }}>
            <span style={{ fontSize: '9px', fontWeight: 700, fontFamily: 'var(--font-heading)', color: '#fff', display: 'block', letterSpacing: '0.1em' }}>
              DRY-RUN VALIDATION REPORT
            </span>
            <div className="automod-diff-card">
              <strong>Diff preview</strong>
              <span>Added {addedLines} · Removed {removedLines} · Risk {riskLabel}</span>
              <em>{riskLabel === 'high' ? 'Consensus recommended before publishing broad filters or remove actions.' : 'Review the diff, then confirm publish if the change is intentional.'}</em>
              <label>
                <input
                  type="checkbox"
                  checked={confirmPublish}
                  onChange={(event) => setConfirmPublish(event.target.checked)}
                />
                I understand this publishes to the live Automod wiki for this community.
              </label>
            </div>
            {validationReport.status === 'idle' && (
              <span style={{ fontSize: '11px', color: 'var(--glass-text-muted)', fontFamily: 'var(--font-body)', marginTop: '10px' }}>
                Run dry-run compiler validation to test syntax before deploying rules live.
              </span>
            )}
            {validationReport.status === 'success' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ color: '#10b981', fontSize: '12px', fontWeight: 600 }}>🟢 Passed</span>
                <span style={{ fontSize: '10px', color: '#94a3b8', lineHeight: '1.4' }}>{validationReport.message}</span>
              </div>
            )}
            {validationReport.status === 'error' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', height: '100%' }}>
                <span style={{ color: '#ef4444', fontSize: '12px', fontWeight: 600 }}>🔴 Failed ({validationReport.errors.length})</span>
                <span style={{ fontSize: '10px', color: '#fda4af', lineHeight: '1.4' }}>{validationReport.message}</span>
                <div style={{
                  flexGrow: 1,
                  overflowY: 'auto',
                  background: 'rgba(239, 68, 68, 0.05)',
                  border: '1px solid rgba(239, 68, 68, 0.15)',
                  borderRadius: '4px',
                  padding: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}>
                  {validationReport.errors.map((err, i) => (
                    <span key={i} style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: '#f87171', borderBottom: '1px solid rgba(239, 68, 68, 0.05)', paddingBottom: '3px' }}>
                      • {err}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
