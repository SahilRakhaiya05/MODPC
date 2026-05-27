import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context, redis } from '@devvit/web/server';
import { createPost } from '../core/post';

export const menu = new Hono();

const NS = 'moddesk-os:v1';

const writeLaunchIntent = async (kind: 'open' | 'escalate' | 'draft', payload: unknown): Promise<void> => {
  const subredditName = context.subredditName ?? 'unknown';
  await redis.set(
    `${NS}:${subredditName}:launch-intent`,
    JSON.stringify({
      kind,
      payload,
      createdAt: new Date().toISOString(),
    })
  );
};

const openDesk = async (kind: 'open' | 'escalate' | 'draft', payload: unknown): Promise<UiResponse> => {
  await writeLaunchIntent(kind, payload);
  const post = await createPost();
  return {
    navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
  };
};

menu.post('/post-create', async (c) => {
  try {
    return c.json<UiResponse>(await openDesk('open', await c.req.json().catch(() => undefined)), 200);
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<UiResponse>(
      {
        showToast: 'Failed to create post',
      },
      400
    );
  }
});

menu.post('/open', async (c) => {
  try {
    return c.json<UiResponse>(await openDesk('open', await c.req.json().catch(() => undefined)), 200);
  } catch (error) {
    console.error(`Error opening ModDesk: ${error}`);
    return c.json<UiResponse>({ showToast: 'Failed to open MODPC' }, 400);
  }
});

menu.post('/escalate', async (c) => {
  try {
    return c.json<UiResponse>(await openDesk('escalate', await c.req.json().catch(() => undefined)), 200);
  } catch (error) {
    console.error(`Error preparing escalation: ${error}`);
    return c.json<UiResponse>({ showToast: 'Failed to prepare consensus escalation' }, 400);
  }
});

menu.post('/draft', async (c) => {
  try {
    return c.json<UiResponse>(await openDesk('draft', await c.req.json().catch(() => undefined)), 200);
  } catch (error) {
    console.error(`Error preparing draft: ${error}`);
    return c.json<UiResponse>({ showToast: 'Failed to prepare safe response draft' }, 400);
  }
});
