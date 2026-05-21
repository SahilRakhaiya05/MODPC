import { Hono } from 'hono';
import { context, redis } from '@devvit/web/server';

export const scheduler = new Hono();

const NS = 'moddesk-os:v1';
const subKey = () => `${NS}:${context.subredditName ?? 'unknown'}`;

/**
 * Periodic 5-minute heartbeat — bumps a Redis key with the last refresh timestamp so the client can show
 * "Server pulled fresh stats at X" and detect missed runs.
 */
scheduler.post('/refresh-live-stats', async (c) => {
  try {
    await redis.set(`${subKey()}:scheduler:last-refresh`, new Date().toISOString());
    return c.json({ status: 'ok' }, 200);
  } catch (error) {
    console.error('refresh-live-stats failed', error);
    return c.json({ status: 'error', message: String(error) }, 500);
  }
});

/**
 * One-shot queued mod action. Triggered via reddit.scheduler.runJob(...) with a future runAt and a payload like
 *   { name: 'moddesk-queued-action', data: { kind: 'unlock', targetId: 't3_xxx' }, runAt: <Date> }
 * The handler reads the payload and applies the action. Useful for "lock for 24h then auto-unlock" workflows.
 */
scheduler.post('/queued-action', async (c) => {
  try {
    const body = await c.req.json<{ data?: { kind?: string; note?: string; targetId?: string } }>();
    const data = body.data ?? {};
    const eventId = `sched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await redis.set(
      `${subKey()}:scheduler:events:${eventId}`,
      JSON.stringify({ kind: data.kind ?? 'unknown', note: data.note, targetId: data.targetId, ranAt: new Date().toISOString() })
    );
    return c.json({ status: 'ok', eventId }, 200);
  } catch (error) {
    console.error('queued-action failed', error);
    return c.json({ status: 'error', message: String(error) }, 500);
  }
});
