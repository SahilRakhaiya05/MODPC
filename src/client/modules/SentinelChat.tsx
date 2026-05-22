import React, { useMemo, useRef, useState } from 'react';
import { api } from '../utils/api';
import type { AiChatMessage, AiContextSource } from '../../shared/api';

type SentinelChatProps = {
  triggerToast: (msg: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
};

type ChatBubble = AiChatMessage & {
  id: string;
  sources?: AiContextSource[];
  model?: string;
  status?: 'success' | 'fallback';
};

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
        },
      ]);
      setLastPromptPreview(response.promptPreview);
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
          <strong>{loading ? 'Thinking' : 'Ready'}</strong>
          <span>Server-side retrieval</span>
        </div>
      </header>

      <div className="sentinel-layout">
        <section className="sentinel-thread" aria-label="Sentinel chat messages">
          <div className="sentinel-messages">
            {messages.map((message) => (
              <article key={message.id} className={`sentinel-message ${message.role}`}>
                <div className="sentinel-message-meta">
                  <strong>{message.role === 'user' ? 'You' : 'Sentinel'}</strong>
                  {message.model && <span>{message.model}</span>}
                  {message.status === 'fallback' && <em>fallback</em>}
                </div>
                <p>{message.content}</p>
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

        <aside className="sentinel-rag" aria-label="Retrieved RAG sources">
          <div className="ph-panel-title">
            <span>Retrieved context</span>
          </div>
          {visibleSources.length === 0 ? (
            <p className="moddesk-empty">Ask a question to see which live Reddit and ModDesk records Sentinel retrieved.</p>
          ) : (
            <div className="sentinel-source-list">
              {visibleSources.map((source) => (
                <article key={source.id}>
                  <span>{source.type} / score {source.score}</span>
                  <strong>{source.title}</strong>
                  <p>{source.excerpt}</p>
                </article>
              ))}
            </div>
          )}

          <div className="sentinel-prompt-preview">
            <span>System prompt preview</span>
            <p>{lastPromptPreview || 'The assistant prompt is composed on the server with retrieved context and safety guardrails.'}</p>
          </div>
        </aside>
      </div>
    </section>
  );
};
