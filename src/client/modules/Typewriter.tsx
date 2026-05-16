/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import React, { useState, useEffect } from 'react';
import { ResponseTemplate } from '../types';
import { api } from '../utils/api';

interface TypewriterProps {
  triggerToast: (msg: string, type?: 'success' | 'warning' | 'error') => void;
}

export const Typewriter: React.FC<TypewriterProps> = ({ triggerToast }) => {
  const [templates, setTemplates] = useState<ResponseTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ResponseTemplate | null>(null);
  
  // Editor State
  const [title, setTitle] = useState('');
  const [linkedRuleId, setLinkedRuleId] = useState('rule-1');
  const [tone, setTone] = useState<'neutral' | 'strict' | 'friendly' | 'educational'>('neutral');
  const [markdown, setMarkdown] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Seed default editor fields when template changes
  useEffect(() => {
    if (selectedTemplate) {
      setTitle(selectedTemplate.title);
      setLinkedRuleId(selectedTemplate.linkedRuleId);
      setTone(selectedTemplate.tone);
      setMarkdown(selectedTemplate.markdown);
    } else {
      setTitle('');
      setLinkedRuleId('rule-1');
      setTone('neutral');
      setMarkdown('');
    }
  }, [selectedTemplate]);

  const fetchTemplates = async () => {
    try {
      const data = await api.getTemplates();
      setTemplates(data.templates);
    } catch (err) {
      console.error(err);
      triggerToast('Error fetching canned templates', 'error');
    }
  };

  useEffect(() => {
    void fetchTemplates();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      triggerToast('Please supply a template title!', 'warning');
      return;
    }
    if (!markdown.trim()) {
      triggerToast('Response content body cannot be empty!', 'warning');
      return;
    }

    setIsLoading(true);
    try {
      await api.saveTemplate({
        ...(selectedTemplate?.templateId ? { templateId: selectedTemplate.templateId } : {}),
        title: title.trim(),
        linkedRuleId,
        tone,
        markdown: markdown.trim()
      });

      triggerToast('💾 Template synchronized with Response Disk!', 'success');
      void fetchTemplates();
      setSelectedTemplate(null);
    } catch (err) {
      console.error(err);
      triggerToast('Failed to save response template', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTemplate) return;
    if (!window.confirm(`Delete template '${selectedTemplate.title}' permanently?`)) return;

    setIsLoading(true);
    try {
      await api.deleteTemplate(selectedTemplate.templateId);
      triggerToast('❌ Template purged from active directories.', 'success');
      setSelectedTemplate(null);
      void fetchTemplates();
    } catch (err) {
      console.error(err);
      triggerToast('Error deleting template', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Markdown Helper Injection Function
  const injectMarkdown = (syntaxBefore: string, syntaxAfter: string = '') => {
    const textarea = document.getElementById('typewriter-textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);
    
    const replacement = syntaxBefore + selected + syntaxAfter;
    setMarkdown(text.substring(0, start) + replacement + text.substring(end));
    
    // Focus back & set selection offset
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + syntaxBefore.length, start + syntaxBefore.length + selected.length);
    }, 10);
  };

  // Simple Regex-based Markdown parser to HTML preview
  const parseMarkdownToHtml = (text: string) => {
    // Escape standard HTML
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Process headers
    html = html.replace(/^### (.*$)/gim, '<h3 style="font-size: 14px; font-weight: 700; color: #fff; margin-top: 12px; margin-bottom: 6px; font-family: var(--font-heading);">$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2 style="font-size: 16px; font-weight: 700; color: #fff; margin-top: 14px; margin-bottom: 8px; font-family: var(--font-heading);">$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1 style="font-size: 18px; font-weight: 800; color: var(--accent-gold); margin-top: 16px; margin-bottom: 10px; font-family: var(--font-heading); display: inline-block;">$1</h1>');

    // Process bold & italics
    html = html.replace(/\*\*(.*)\*\*/gim, '<strong style="color: #fff; fontWeight: 600;">$1</strong>');
    html = html.replace(/\*(.*)\*/gim, '<em style="color: #cbd5e1;">$1</em>');

    // Process code blocks
    html = html.replace(/`(.*)`/gim, '<code style="font-family: var(--font-mono); background: rgba(255,255,255,0.08); padding: 2px 6px; borderRadius: 4px; color: #f472b6; fontSize: 11px;">$1</code>');

    // Process blockquotes
    html = html.replace(/^> (.*$)/gim, '<blockquote style="border-left: 4px solid var(--primary); padding-left: 12px; margin: 8px 0; color: #94a3b8; font-style: italic;">$1</blockquote>');

    // Process list blocks
    html = html.replace(/^\* (.*$)/gim, '<li style="margin-left: 16px; margin-top: 4px;">$1</li>');
    html = html.replace(/^- (.*$)/gim, '<li style="margin-left: 16px; margin-top: 4px;">$1</li>');

    // Process links
    html = html.replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2" target="_blank" style="color: var(--accent-gold); text-decoration: none; border-bottom: 1px dashed var(--accent-border-pill); transition: border-color 0.2s;" onmouseover="this.style.borderBottomColor=\'var(--accent-gold)\'" onmouseout="this.style.borderBottomColor=\'var(--accent-border-pill)\'">$1</a>');

    // Replace macros with dummy styled spans
    html = html
      .replace(/{username}/g, '<span style="color: var(--accent-gold); font-weight: 700; font-family: var(--font-mono); padding: 1px 5px; background: var(--accent-bg-pill); border: 1px solid var(--accent-border-pill); border-radius: 4px;">u/User_Macro</span>')
      .replace(/{subreddit}/g, '<span style="color: var(--success); font-weight: 700; font-family: var(--font-mono); padding: 1px 5px; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 4px;">r/Subreddit_Macro</span>')
      .replace(/{post_title}/g, '<span style="color: var(--primary); font-weight: 700; font-family: var(--font-mono); padding: 1px 5px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 4px;">"Post_Title_Macro"</span>')
      .replace(/{rule_link}/g, '<span style="color: var(--warning); font-weight: 700; font-family: var(--font-mono); padding: 1px 5px; background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 4px;">[Rule_Link_Macro]</span>')
      .replace(/{modmail_link}/g, '<span style="color: var(--error); font-weight: 700; font-family: var(--font-mono); padding: 1px 5px; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 4px;">[Modmail_Link_Macro]</span>');

    // Paragraph returns
    html = html.replace(/\n/g, '<br/>');

    return { __html: html };
  };

  return (
    <div style={{ display: 'flex', gap: '16px', height: '100%', minHeight: 0, fontFamily: 'var(--font-body)' }}>
      {/* Sidebar List */}
      <div 
        className="glass-panel" 
        style={{ 
          width: '240px', 
          display: 'flex', 
          flexDirection: 'column', 
          minHeight: 0, 
          background: 'var(--glass-bg)', 
          borderColor: 'var(--glass-border)',
          borderRadius: '12px',
          overflow: 'hidden'
        }}
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: '11px', fontWeight: 700, color: 'var(--glass-text-muted)', letterSpacing: '0.05em' }}>
            TEMPLATES
          </span>
          <button 
            onClick={() => setSelectedTemplate(null)} 
            className="glass-btn success"
            style={{ padding: '4px 10px', fontSize: '10px', borderRadius: '6px' }}
          >
            + NEW
          </button>
        </div>

        <div style={{ flexGrow: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {templates.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--glass-text-muted)', textAlign: 'center', padding: '24px 0' }}>
              No templates loaded.
            </div>
          ) : (
            templates.map(temp => {
              const isSelected = selectedTemplate?.templateId === temp.templateId;
              const parts = temp.linkedRuleId.split('_');
              const secondPart = parts[1];
              const ruleName = secondPart
                ? secondPart
                : temp.linkedRuleId.replace('rule-', 'RULE ');
              return (
                <div
                  key={temp.templateId}
                  onClick={() => setSelectedTemplate(temp)}
                  style={{
                    padding: '10px 12px',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    background: isSelected ? 'var(--accent-bg-pill)' : 'rgba(255, 255, 255, 0.03)',
                    border: isSelected ? '1px solid var(--accent-border-pill)' : '1px solid rgba(255, 255, 255, 0.05)',
                    color: 'var(--glass-text)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    transition: 'all 0.2s ease',
                    boxShadow: isSelected ? '0 0 15px var(--accent-bg-pill)' : 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
                    }
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-heading)', color: '#fff' }}>
                    {temp.title}
                  </span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: isSelected ? 'var(--accent-gold)' : 'var(--glass-text-muted)' }}>
                    <span>Tone: {temp.tone.toUpperCase()}</span>
                    <span>Rule: {ruleName.toUpperCase()}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Workspace Split Editor / Previewer */}
      <div 
        style={{ 
          flexGrow: 1, 
          display: 'flex', 
          gap: '16px', 
          minWidth: 0, 
          height: '100%' 
        }}
      >
        {/* Left Side: Editor Form */}
        <form 
          onSubmit={handleSave} 
          className="glass-panel"
          style={{ 
            flex: '1 1 50%', 
            padding: '20px', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '12px', 
            backgroundColor: 'var(--glass-bg)', 
            borderColor: 'var(--glass-border)',
            borderRadius: '12px',
            minHeight: 0 
          }}
        >
          {/* Header Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '10px' }}>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: '14px', fontWeight: 700, color: 'var(--accent-gold)' }}>
              ⌨️ TYPEWRITER ENGINE
            </span>
            {selectedTemplate && (
              <button 
                type="button"
                onClick={handleDelete} 
                disabled={isLoading}
                className="glass-btn danger"
                style={{ padding: '4px 12px', fontSize: '10px', borderRadius: '6px' }}
              >
                ⛔ UNLINK / PURGE
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 180px' }}>
              <label className="glass-label">TEMPLATE DISPLAY TITLE</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Rule 1 Civility & removal"
                className="glass-input"
              />
            </div>

            <div style={{ width: '130px' }}>
              <label className="glass-label">LINKED POLICY</label>
              <select
                value={linkedRuleId}
                onChange={(e) => setLinkedRuleId(e.target.value)}
                className="glass-input"
                style={{ cursor: 'pointer' }}
              >
                <option value="rule-1">Rule 1: Civility</option>
                <option value="rule-2">Rule 2: Off-topic</option>
                <option value="rule-3">Rule 3: Spam</option>
                <option value="rule-4">Rule 4: Duplicates</option>
                <option value="rule-5">Rule 5: Politics</option>
                <option value="rule-8">Rule 8: Safety</option>
              </select>
            </div>

            <div style={{ width: '110px' }}>
              <label className="glass-label">COMMUNICATIVE TONE</label>
              <select
                value={tone}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'neutral' || val === 'strict' || val === 'friendly' || val === 'educational') {
                    setTone(val);
                  }
                }}
                className="glass-input"
                style={{ cursor: 'pointer' }}
              >
                <option value="neutral">Neutral</option>
                <option value="strict">Strict</option>
                <option value="friendly">Friendly</option>
                <option value="educational">Educational</option>
              </select>
            </div>
          </div>

          {/* Markdown Helper Toolbar */}
          <div 
            className="glass-panel" 
            style={{ 
              display: 'flex', 
              flexWrap: 'wrap', 
              gap: '6px', 
              padding: '6px 10px', 
              backgroundColor: 'rgba(0, 0, 0, 0.2)',
              borderColor: 'rgba(255,255,255,0.04)',
              borderRadius: '8px'
            }}
          >
            <button type="button" onClick={() => injectMarkdown('**', '**')} className="glass-btn" title="Bold text" style={{ padding: '4px 10px', fontSize: '10px' }}><strong>B</strong></button>
            <button type="button" onClick={() => injectMarkdown('*', '*')} className="glass-btn" title="Italic text" style={{ padding: '4px 10px', fontSize: '10px' }}><em>I</em></button>
            <button type="button" onClick={() => injectMarkdown('\n* ', '')} className="glass-btn" title="Bulleted list" style={{ padding: '4px 8px', fontSize: '10px' }}>• List</button>
            <button type="button" onClick={() => injectMarkdown('\n1. ', '')} className="glass-btn" title="Numbered list" style={{ padding: '4px 8px', fontSize: '10px' }}>1. List</button>
            <button type="button" onClick={() => injectMarkdown('\n> ', '')} className="glass-btn" title="Blockquote" style={{ padding: '4px 10px', fontSize: '10px' }}>” Quote</button>
            <button type="button" onClick={() => injectMarkdown('[Link text](', ')')} className="glass-btn" title="Insert hyperlink" style={{ padding: '4px 8px', fontSize: '10px' }}>🔗 Link</button>
          </div>

          {/* Markdown Text Area */}
          <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <label className="glass-label">MARKDOWN RESPONSE BODY (TYPEWRITER ROLL)</label>
            <textarea
              id="typewriter-textarea"
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              placeholder="Insert macro parameters or write canned removal details..."
              className="glass-input"
              style={{
                flexGrow: 1,
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                lineHeight: '1.6',
                resize: 'none',
                backgroundColor: 'rgba(0,0,0,0.3)',
                borderColor: 'rgba(255,255,255,0.08)',
                borderLeft: '4px solid var(--primary)',
                padding: '12px'
              }}
            />
          </div>

          {/* Macro Insertion Bar */}
          <div 
            className="glass-panel" 
            style={{ 
              padding: '10px 12px', 
              backgroundColor: 'rgba(0, 0, 0, 0.2)',
              borderColor: 'rgba(255, 255, 255, 0.04)',
              borderRadius: '8px',
              display: 'flex', 
              flexDirection: 'column', 
              gap: '6px' 
            }}
          >
            <span className="glass-label" style={{ marginBottom: 0 }}>QUICK MACRO INJECTION KEYPAD</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {[
                { label: '{username}', syntax: '{username}', color: 'var(--accent-gold)', bg: 'var(--accent-bg-pill)' },
                { label: '{subreddit}', syntax: '{subreddit}', color: '#34d399', bg: 'rgba(52, 211, 153, 0.1)' },
                { label: '{post_title}', syntax: '"{post_title}"', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.1)' },
                { label: '{rule_link}', syntax: '[Sub Rule Link]({rule_link})', color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.1)' },
                { label: '{modmail}', syntax: '[Contact Modmail]({modmail_link})', color: '#f87171', bg: 'rgba(239, 68, 68, 0.1)' }
              ].map(mac => (
                <button
                  key={mac.label}
                  type="button"
                  onClick={() => injectMarkdown(mac.syntax)}
                  className="glass-btn"
                  style={{
                    fontSize: '9px',
                    padding: '3px 8px',
                    color: mac.color,
                    background: mac.bg,
                    borderColor: 'transparent'
                  }}
                >
                  ➕ {mac.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button 
              type="submit" 
              disabled={isLoading}
              className="glass-btn success"
              style={{ width: '100%', padding: '10px', fontWeight: 600 }}
            >
              💾 SYNCHRONIZE TEMPLATE
            </button>
          </div>
        </form>

        {/* Right Side: Live Preview Pane */}
        <div 
          className="glass-panel"
          style={{ 
            flex: '1 1 50%', 
            padding: '20px', 
            display: 'flex', 
            flexDirection: 'column', 
            backgroundColor: 'var(--glass-bg)', 
            borderColor: 'var(--glass-border)',
            borderRadius: '12px',
            minHeight: 0 
          }}
        >
          <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '10px', marginBottom: '12px' }}>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: '14px', fontWeight: 700, color: 'var(--glass-text-muted)' }}>
              👁️ REAL-TIME PREVIEW
            </span>
          </div>

          <div 
            className="glass-panel"
            style={{
              flexGrow: 1,
              backgroundColor: 'rgba(0, 0, 0, 0.2)',
              borderColor: 'rgba(255, 255, 255, 0.04)',
              padding: '16px 20px',
              overflowY: 'auto',
              borderLeft: '4px solid #10b981',
              borderRadius: '8px'
            }}
          >
            {markdown.trim() ? (
              <div 
                className="markdown-rendered-view"
                style={{
                  fontSize: '13px',
                  color: 'var(--glass-text)',
                  lineHeight: '1.7',
                  fontFamily: 'var(--font-body)'
                }}
                dangerouslySetInnerHTML={parseMarkdownToHtml(markdown)}
              />
            ) : (
              <div style={{ color: 'var(--glass-text-muted)', textAlign: 'center', marginTop: '60px', fontSize: '12px', fontFamily: 'var(--font-heading)', lineHeight: '1.6' }}>
                ✍️ NO RESPONSE YET WRITTEN.<br/>
                <span style={{ fontSize: '10px' }}>START TYPING IN THE EDITOR TO WATCH IT RENDER LIVE.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
