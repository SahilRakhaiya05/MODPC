import React, { useMemo, useRef, useState } from 'react';
import { api } from '../utils/api';
import type { AiChatMessage, AiChatResponse, AiContextSource } from '../../shared/api';

type SentinelChatProps = {
  triggerToast: (msg: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
};

type ChatBubble = AiChatMessage & {
  id: string;
  sources?: AiContextSource[];
  model?: string;
  status?: 'success' | 'fallback';
  modelStatus?: AiChatResponse['modelStatus'];
};

type SentinelTab = 'ask' | 'sources' | 'prompt' | 'drafts' | 'status';

const starterPrompts = [
  'Summarize what needs moderator attention right now.',
  'Draft a safe response for the top modmail issue.',
  'Find risky queue items that should go to consensus.',
  'Suggest an Automod rule improvement from recent reports.',
];

const initialMessage: ChatBubble = {
  id: 'sentinel-welcome',
  role: 'assistant',
  content:
    'Sentinel is online. Ask about queue triage, Automod, saved responses, consensus tickets, modmail tone, or how to make this tool stronger for the hackathon judging criteria.',
  model: 'ModDesk Sentinel',
  sources: [],
};

export const SentinelChat: React.FC<SentinelChatProps> = ({ triggerToast }) => {
  const [messages, setMessages] = useState<ChatBubble[]>([initialMessage]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastPromptPreview, setLastPromptPreview] = useState('');
  const [activeTab, setActiveTab] = useState<SentinelTab>('ask');
  const [latestModelStatus, setLatestModelStatus] = useState<AiChatResponse['modelStatus']>({
    status: 'fallback',
    provider: 'local',
    model: 'local-rag',
    lastError: 'Ask Sentinel a question to check model status.',
  });
  const nextIdRef = useRef(0);

  const visibleSources = useMemo(() => {
    const latestWithSources = [...messages].reverse().find((message) => message.sources && message.sources.length > 0);
    return latestWithSources?.sources ?? [];
  }, [messages]);

  const sendPrompt = async (rawPrompt: string) => {
    const prompt = rawPrompt.trim();
    if (!prompt || loading) return;
    nextIdRef.current += 1;
    const userMessage: ChatBubble = { id: `user-${nextIdRef.current}`, role: 'user', content: prompt };
    const history = messages
      .filter((message) => message.id !== initialMessage.id)
      .map((message) => ({ role: message.role, content: message.content }));
    setMessages((items) => [...items, userMessage]);
    setInput('');
    setLoading(true);
    try {
      const response = await api.askAi({ prompt, history });
      nextIdRef.current += 1;
      setMessages((items) => [
        ...items,
        {
          id: `assistant-${nextIdRef.current}`,
          role: 'assistant',
          content: response.reply,
          sources: response.sources,
          model: response.model,
          status: response.status,
          modelStatus: response.modelStatus,
        },
      ]);
      setLastPromptPreview(response.promptPreview);
      setLatestModelStatus(response.modelStatus);
      if (response.status === 'fallback') {
        triggerToast('AI upstream was unavailable, so Sentinel used local RAG fallback.', 'warning');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sentinel could not answer that request.';
      triggerToast(message, 'error');
      nextIdRef.current += 1;
      setMessages((items) => [
        ...items,
        {
          id: `assistant-error-${nextIdRef.current}`,
          role: 'assistant',
          content: `I could not reach the moderation assistant. ${message}`,
          status: 'fallback',
          model: 'Local error',
          modelStatus: {
            status: 'error',
            provider: 'none',
            lastError: message,
          },
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="sentinel-chat">
      <header className="sentinel-hero">
        <div>
          <span className="module-eyebrow">RAG moderation assistant</span>
          <h3>Sentinel AI Chat</h3>
          <p>Retrieves live queue, rules, templates, consensus, audit, and modlog context before it asks the external model.</p>
        </div>
        <div className="sentinel-status">
          <strong>{loading ? 'Thinking' : latestModelStatus.status === 'connected' ? 'Groq connected' : 'Fallback active'}</strong>
          <span>{latestModelStatus.provider} / {latestModelStatus.model ?? 'unknown model'}</span>
        </div>
      </header>

      <nav className="sentinel-tabs" aria-label="Sentinel workspace tabs">
        {[
          ['ask', 'Ask Sentinel'],
          ['sources', 'Sources'],
          ['prompt', 'Prompt Preview'],
          ['drafts', 'Drafts'],
          ['status', 'Model Status'],
        ].map(([idValue, label]) => (
          <button
            key={idValue}
            type="button"
            className={activeTab === idValue ? 'active' : ''}
            onClick={() => setActiveTab(idValue as SentinelTab)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="sentinel-layout">
        <section className="sentinel-thread" aria-label="Sentinel chat messages" hidden={activeTab !== 'ask' && activeTab !== 'drafts'}>
          <div className="sentinel-messages">
            {messages.map((message) => (
              <article key={message.id} className={`sentinel-message ${message.role}`}>
                <div className="sentinel-message-meta">
                  <strong>{message.role === 'user' ? 'You' : 'Sentinel'}</strong>
                  {message.model && <span>{message.model}</span>}
                  {message.status === 'fallback' && <em>fallback</em>}
                </div>
                <p>{message.content}</p>
                {message.role === 'assistant' && message.id !== initialMessage.id && (
                  <div className="sentinel-action-row">
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(message.content);
                        triggerToast('Draft copied to clipboard.', 'success');
                      }}
                    >
                      Copy draft
                    </button>
                    <button type="button" onClick={() => triggerToast('Prepared as a draft only. Open Consensus to attach evidence.', 'info')}>
                      Send to Consensus
                    </button>
                    <button type="button" onClick={() => triggerToast('Action prepared. Use the module confirmation gate before any live write.', 'warning')}>
                      Prepare action
                    </button>
                  </div>
                )}
                {message.sources && message.sources.length > 0 && (
                  <small>Sources: {message.sources.slice(0, 4).map((source) => source.title).join(', ')}</small>
                )}
              </article>
            ))}
            {loading && (
              <article className="sentinel-message assistant pending">
                <div className="sentinel-message-meta">
                  <strong>Sentinel</strong>
                  <span>retrieving context</span>
                </div>
                <p>Building a RAG pack from live moderator data...</p>
              </article>
            )}
          </div>

          <div className="sentinel-prompts" aria-label="Starter prompts">
            {starterPrompts.map((prompt) => (
              <button key={prompt} type="button" onClick={() => void sendPrompt(prompt)} disabled={loading}>
                {prompt}
              </button>
            ))}
          </div>

          <form
            className="sentinel-input"
            onSubmit={(event) => {
              event.preventDefault();
              void sendPrompt(input);
            }}
          >
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask Sentinel to triage, draft, explain, or improve a moderator workflow..."
              disabled={loading}
            />
            <button type="submit" disabled={loading || input.trim().length === 0}>
              Send
            </button>
          </form>
        </section>

        <aside className="sentinel-rag" aria-label="Retrieved RAG sources" hidden={activeTab === 'ask' || activeTab === 'drafts' ? false : activeTab !== 'sources' && activeTab !== 'prompt' && activeTab !== 'status'}>
          <div className="ph-panel-title">
            <span>{activeTab === 'status' ? 'Model status' : activeTab === 'prompt' ? 'Prompt preview' : 'Retrieved context'}</span>
          </div>
          {activeTab === 'status' ? (
            <div className="sentinel-model-card">
              <strong>{latestModelStatus.status}</strong>
              <span>{latestModelStatus.provider} / {latestModelStatus.model ?? 'unknown model'}</span>
              <p>{latestModelStatus.lastError ?? 'No model error reported.'}</p>
              {latestModelStatus.latencyMs && <em>{latestModelStatus.latencyMs}ms</em>}
              <small>No Reddit action is performed by Sentinel chat.</small>
            </div>
          ) : activeTab === 'prompt' ? (
            <div className="sentinel-prompt-preview">
              <span>Sanitized server prompt preview</span>
              <p>{lastPromptPreview || 'The assistant prompt is composed on the server with retrieved context and safety guardrails.'}</p>
            </div>
          ) : visibleSources.length === 0 ? (
            <p className="moddesk-empty">Ask a question to see which live Reddit and ModDesk records Sentinel retrieved.</p>
          ) : (
            <div className="sentinel-source-list">
              {visibleSources.map((source) => (
                <article key={source.id}>
                  <span>{source.type} / confidence {source.score > 5 ? 'high' : source.score > 1 ? 'medium' : 'low'}</span>
                  <strong>{source.title}</strong>
                  <p>{source.excerpt}</p>
                  <button type="button" onClick={() => triggerToast(`Source opened: ${source.title}`, 'info')}>Details</button>
                </article>
              ))}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
};
