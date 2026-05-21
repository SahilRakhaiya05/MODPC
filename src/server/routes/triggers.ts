import { Hono } from 'hono';
import type { OnAppInstallRequest, TriggerResponse } from '@devvit/web/shared';
import { context, redis } from '@devvit/web/server';
import { createPost } from '../core/post';

export const triggers = new Hono();

const NS = 'moddesk-os:v1';
const LIVE_EVENTS_LIMIT = 50;
const subKey = () => `${NS}:${context.subredditName ?? 'unknown'}`;

type LiveEvent = {
  id: string;
  kind: 'post-report' | 'comment-report' | 'mod-action' | 'mod-mail' | 'app-install';
  createdAt: string;
  actor?: string | undefined;
  target?: string | undefined;
  summary: string;
  payload?: unknown;
};

const pushLiveEvent = async (event: LiveEvent): Promise<void> => {
  try {
    const indexKey = `${subKey()}:live-events:index`;
    const itemKey = `${subKey()}:live-events:${event.id}`;
    await redis.set(itemKey, JSON.stringify(event));

    const existing = await redis.get(indexKey);
    const ids: string[] = existing ? JSON.parse(existing) : [];
    const next = [event.id, ...ids].slice(0, LIVE_EVENTS_LIMIT);
    await redis.set(indexKey, JSON.stringify(next));
  } catch (error) {
    console.error('pushLiveEvent failed', error);
  }
};

const makeEventId = (kind: string) => `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

triggers.post('/on-app-install', async (c) => {
  try {
    const post = await createPost();
    const input = await c.req.json<OnAppInstallRequest>();
    await pushLiveEvent({
      id: makeEventId('install'),
      kind: 'app-install',
      createdAt: new Date().toISOString(),
      summary: `ModDesk OS installed — post ${post.id}`,
      payload: { trigger: input.type },
    });
    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: `Post created in subreddit ${context.subredditName} with id ${post.id} (trigger: ${input.type})`,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<TriggerResponse>(
      {
        status: 'error',
        message: 'Failed to create post',
      },
      400
    );
  }
});

// Inbound trigger payloads come from Devvit as JSON; types match the generated proto shapes.
type ReportPayload = {
  post?: { id?: string; title?: string; authorName?: string };
  comment?: { id?: string; body?: string; authorName?: string };
  reason?: string;
};

triggers.post('/on-post-report', async (c) => {
  try {
    const body = (await c.req.json()) as ReportPayload;
    const post = body.post ?? {};
    await pushLiveEvent({
      id: makeEventId('post-report'),
      kind: 'post-report',
      createdAt: new Date().toISOString(),
      actor: post.authorName,
      target: post.id,
      summary: `Post reported${post.title ? `: "${post.title.slice(0, 80)}"` : ''}${body.reason ? ` — ${body.reason}` : ''}`,
      payload: body,
    });
    return c.json({ status: 'ok' }, 200);
  } catch (error) {
    console.error('on-post-report failed', error);
    return c.json({ status: 'error', message: String(error) }, 500);
  }
});

triggers.post('/on-comment-report', async (c) => {
  try {
    const body = (await c.req.json()) as ReportPayload;
    const comment = body.comment ?? {};
    await pushLiveEvent({
      id: makeEventId('comment-report'),
      kind: 'comment-report',
      createdAt: new Date().toISOString(),
      actor: comment.authorName,
      target: comment.id,
      summary: `Comment reported${comment.body ? `: "${comment.body.slice(0, 80)}"` : ''}${body.reason ? ` — ${body.reason}` : ''}`,
      payload: body,
    });
    return c.json({ status: 'ok' }, 200);
  } catch (error) {
    console.error('on-comment-report failed', error);
    return c.json({ status: 'error', message: String(error) }, 500);
  }
});

type ModActionPayload = {
  action?: string;
  moderator?: { name?: string };
  targetUser?: { name?: string };
  targetPost?: { id?: string; title?: string };
  targetComment?: { id?: string };
  details?: string;
};

triggers.post('/on-mod-action', async (c) => {
  try {
    const body = (await c.req.json()) as ModActionPayload;
    const summary = [
      body.action ?? 'modaction',
      body.targetUser?.name ? `→ u/${body.targetUser.name}` : '',
      body.targetPost?.title ? `“${body.targetPost.title.slice(0, 60)}”` : '',
      body.details ? `(${body.details})` : '',
    ]
      .filter(Boolean)
      .join(' ');
    await pushLiveEvent({
      id: makeEventId('mod-action'),
      kind: 'mod-action',
      createdAt: new Date().toISOString(),
      actor: body.moderator?.name,
      target: body.targetPost?.id ?? body.targetComment?.id ?? body.targetUser?.name,
      summary,
      payload: body,
    });
    return c.json({ status: 'ok' }, 200);
  } catch (error) {
    console.error('on-mod-action failed', error);
    return c.json({ status: 'error', message: String(error) }, 500);
  }
});

type ModMailPayload = {
  conversationId?: string;
  messageAuthor?: { name?: string };
  subject?: string;
  bodyMarkdown?: string;
};

triggers.post('/on-mod-mail', async (c) => {
  try {
    const body = (await c.req.json()) as ModMailPayload;
    await pushLiveEvent({
      id: makeEventId('mod-mail'),
      kind: 'mod-mail',
      createdAt: new Date().toISOString(),
      actor: body.messageAuthor?.name,
      target: body.conversationId,
      summary: body.subject ? `Modmail: ${body.subject.slice(0, 80)}` : 'New modmail message',
      payload: body,
    });
    return c.json({ status: 'ok' }, 200);
  } catch (error) {
    console.error('on-mod-mail failed', error);
    return c.json({ status: 'error', message: String(error) }, 500);
  }
});
