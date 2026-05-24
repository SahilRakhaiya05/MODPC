import { Hono } from 'hono';
import type { OnAppInstallRequest, TriggerResponse } from '@devvit/web/shared';
import { context, reddit, redis } from '@devvit/web/server';
import { createPost } from '../core/post';

export const triggers = new Hono();

const NS = 'moddesk-os:v1';
const LIVE_EVENTS_LIMIT = 50;
const subKey = () => `${NS}:${context.subredditName ?? 'unknown'}`;

type LiveEvent = {
  id: string;
  kind: 'post-report' | 'comment-report' | 'comment-create' | 'mod-action' | 'mod-mail' | 'app-install';
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

type CommentCopSettings = {
  enabled: boolean;
  threshold: number;
  action: 'log_only' | 'remove';
  minTokenCount: number;
  rollingWindowSize: number;
  supabaseVerificationEnabled: boolean;
  supabaseUrlConfigured: boolean;
};

type StoredComment = {
  commentId: string;
  postId: string;
  author: string;
  body: string;
  tokens: string[];
  createdAt: string;
};

type CommentCopCase = {
  id: string;
  commentId: string;
  postId: string;
  author: string;
  createdAt: string;
  score: number;
  matchedCommentId: string;
  matchedAuthor: string;
  action: 'log_only' | 'remove' | 'ignored' | 'duplicate_trigger';
  source: 'redis' | 'supabase' | 'redis_and_supabase';
  excerpt: string;
  matchedExcerpt: string;
  reason: string;
};

type CommentCreatePayload = {
  comment?: {
    id?: string;
    body?: string;
    authorName?: string;
    postId?: string;
    linkId?: string;
    parentId?: string;
  };
  post?: {
    id?: string;
    title?: string;
  };
};

type CommentThingId = `t1_${string}`;

type LiveSettings = {
  liveWritesEnabled?: boolean;
};

const commentCopDefaultSettings = (): CommentCopSettings => ({
  enabled: true,
  threshold: 0.85,
  action: 'log_only',
  minTokenCount: 8,
  rollingWindowSize: 250,
  supabaseVerificationEnabled: false,
  supabaseUrlConfigured: Boolean(process.env.SUPABASE_COMMENTCOP_URL),
});

const commentCopKey = (name: string) => `${subKey()}:live:${name}`;

const tokenize = (text: string): string[] =>
  Array.from(new Set(
    text
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[^a-z0-9\s']/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2)
  ));

const jaccard = (left: string[], right: string[]): number => {
  if (left.length === 0 || right.length === 0) return 0;
  const a = new Set(left);
  const b = new Set(right);
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
};

const getCommentCopSettings = async (): Promise<CommentCopSettings> => {
  const raw = await redis.get(commentCopKey('commentcop:settings'));
  if (!raw) return commentCopDefaultSettings();
  try {
    return {
      ...commentCopDefaultSettings(),
      ...JSON.parse(raw),
      supabaseUrlConfigured: Boolean(process.env.SUPABASE_COMMENTCOP_URL),
    };
  } catch {
    return commentCopDefaultSettings();
  }
};

const getLiveSettings = async (): Promise<LiveSettings> => {
  const raw = await redis.get(commentCopKey('settings'));
  if (!raw) return {};
  try {
    return JSON.parse(raw) as LiveSettings;
  } catch {
    return {};
  }
};

const normalizeCommentId = (value?: string): CommentThingId | undefined => {
  if (!value) return undefined;
  if (value.startsWith('t1_')) return value as CommentThingId;
  return `t1_${value}` as CommentThingId;
};

const bumpCommentCopStat = async (field: string, amount = 1): Promise<void> => {
  await redis.hIncrBy(commentCopKey('commentcop:stats'), field, amount);
};

const pushCommentCopCase = async (item: CommentCopCase): Promise<void> => {
  await redis.set(commentCopKey(`commentcop:case:${item.id}`), JSON.stringify(item));
  const indexKey = commentCopKey('commentcop:cases:index');
  const raw = await redis.get(indexKey);
  const ids: string[] = raw ? JSON.parse(raw) : [];
  await redis.set(indexKey, JSON.stringify([item.id, ...ids.filter((id) => id !== item.id)].slice(0, 80)));
};

const pushAuditEvent = async (event: {
  eventType: string;
  entityId: string;
  summary: string;
  result: 'success' | 'failure';
  before?: unknown;
  after?: unknown;
}): Promise<void> => {
  const eventId = makeEventId('audit');
  const record = {
    eventId,
    actor: 'CommentCop',
    actorRole: 'automation',
    mode: 'live',
    subreddit: context.subredditName ?? 'unknown',
    createdAt: new Date().toISOString(),
    sourceModule: 'commentcop',
    ...event,
  };
  await redis.set(commentCopKey(`audit:${eventId}`), JSON.stringify(record));
  const indexKey = commentCopKey('index:audit');
  const raw = await redis.get(indexKey);
  const ids: string[] = raw ? JSON.parse(raw) : [];
  await redis.set(indexKey, JSON.stringify([eventId, ...ids].slice(0, 80)));
};

const querySupabaseSimilarity = async (
  settings: CommentCopSettings,
  text: string
): Promise<{ score: number; commentId: string; author: string; excerpt: string } | undefined> => {
  if (!settings.supabaseVerificationEnabled || !process.env.SUPABASE_COMMENTCOP_URL) return undefined;
  const url = `${process.env.SUPABASE_COMMENTCOP_URL.replace(/\/$/, '')}/functions/v1/commentcop-match`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.SUPABASE_COMMENTCOP_KEY ? { Authorization: `Bearer ${process.env.SUPABASE_COMMENTCOP_KEY}` } : {}),
    },
    body: JSON.stringify({ text, threshold: settings.threshold }),
  });
  if (!response.ok) return undefined;
  const body = await response.json();
  if (
    typeof body.score === 'number' &&
    typeof body.commentId === 'string' &&
    typeof body.author === 'string' &&
    typeof body.excerpt === 'string'
  ) {
    return {
      score: body.score,
      commentId: body.commentId,
      author: body.author,
      excerpt: body.excerpt,
    };
  }
  return undefined;
};

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

triggers.post('/on-comment-create', async (c) => {
  try {
    const body = (await c.req.json()) as CommentCreatePayload;
    const comment = body.comment ?? {};
    const commentId = normalizeCommentId(comment.id);
    const postId = comment.postId ?? comment.linkId ?? body.post?.id ?? '';
    const author = comment.authorName ?? 'unknown';
    const text = comment.body ?? '';
    if (!commentId || !postId || !text.trim()) {
      return c.json({ status: 'ignored', reason: 'missing comment id, post id, or body' }, 200);
    }

    const lockAcquired = await redis.hSetNX(commentCopKey('commentcop:locks'), commentId, new Date().toISOString());
    if (!lockAcquired) {
      await bumpCommentCopStat('duplicateTriggersBlocked');
      await pushCommentCopCase({
        id: makeEventId('commentcop-dupe-trigger'),
        commentId,
        postId,
        author,
        createdAt: new Date().toISOString(),
        score: 1,
        matchedCommentId: commentId,
        matchedAuthor: author,
        action: 'duplicate_trigger',
        source: 'redis',
        excerpt: text.slice(0, 220),
        matchedExcerpt: text.slice(0, 220),
        reason: 'Duplicate Devvit trigger delivery blocked by Redis hSetNX lock.',
      });
      return c.json({ status: 'duplicate_trigger' }, 200);
    }

    const settings = await getCommentCopSettings();
    if (!settings.enabled) {
      return c.json({ status: 'disabled' }, 200);
    }

    await bumpCommentCopStat('scanned');
    const tokens = tokenize(text);
    const stored: StoredComment = {
      commentId,
      postId,
      author,
      body: text,
      tokens,
      createdAt: new Date().toISOString(),
    };

    const indexKey = commentCopKey(`commentcop:post:${postId}:index`);
    const rawIndex = await redis.get(indexKey);
    const ids: string[] = rawIndex ? JSON.parse(rawIndex) : [];
    let best: { score: number; comment: StoredComment } | undefined;
    if (tokens.length >= settings.minTokenCount) {
      for (const priorId of ids.slice(0, settings.rollingWindowSize)) {
        const rawPrior = await redis.get(commentCopKey(`commentcop:comment:${priorId}`));
        if (!rawPrior) continue;
        const prior = JSON.parse(rawPrior) as StoredComment;
        if (prior.author.toLowerCase() === author.toLowerCase()) continue;
        const score = jaccard(tokens, prior.tokens);
        if (!best || score > best.score) best = { score, comment: prior };
      }
    }

    let source: CommentCopCase['source'] = 'redis';
    let match = best && best.score >= settings.threshold
      ? {
          score: best.score,
          commentId: best.comment.commentId,
          author: best.comment.author,
          excerpt: best.comment.body,
        }
      : undefined;

    if (!match) {
      const supabaseMatch = await querySupabaseSimilarity(settings, text).catch((error: unknown) => {
        console.warn('CommentCop Supabase verification failed', error);
        return undefined;
      });
      if (supabaseMatch && supabaseMatch.score >= settings.threshold) {
        match = supabaseMatch;
        source = 'supabase';
      }
    } else if (settings.supabaseVerificationEnabled) {
      const supabaseMatch = await querySupabaseSimilarity(settings, text).catch(() => undefined);
      if (supabaseMatch && supabaseMatch.score >= settings.threshold) source = 'redis_and_supabase';
    }

    await redis.set(commentCopKey(`commentcop:comment:${commentId}`), JSON.stringify(stored));
    await redis.set(indexKey, JSON.stringify([commentId, ...ids.filter((id) => id !== commentId)].slice(0, settings.rollingWindowSize)));

    if (match) {
      await bumpCommentCopStat('flagged');
      let action: CommentCopCase['action'] = settings.action;
      if (settings.action === 'remove') {
        const liveSettings = await getLiveSettings();
        if (liveSettings.liveWritesEnabled) {
          try {
            await reddit.remove(commentId, false);
            await bumpCommentCopStat('removed');
          } catch (error) {
            console.error('CommentCop failed to remove comment', error);
            action = 'log_only';
          }
        } else {
          action = 'log_only';
        }
      }
      await pushCommentCopCase({
        id: makeEventId('commentcop'),
        commentId,
        postId,
        author,
        createdAt: new Date().toISOString(),
        score: match.score,
        matchedCommentId: match.commentId,
        matchedAuthor: match.author,
        action,
        source,
        excerpt: text.slice(0, 220),
        matchedExcerpt: match.excerpt.slice(0, 220),
        reason: `Jaccard similarity ${Math.round(match.score * 100)}% met threshold ${Math.round(settings.threshold * 100)}%.`,
      });
      await pushAuditEvent({
        eventType: 'commentcop.comment.flagged',
        entityId: commentId,
        summary: `CommentCop ${action === 'remove' ? 'removed' : 'flagged'} copied comment by u/${author} at ${Math.round(match.score * 100)}% similarity.`,
        result: 'success',
        before: { commentId, postId, author, excerpt: text.slice(0, 120) },
        after: { action, source, matchedCommentId: match.commentId, score: match.score },
      });
    }

    await pushLiveEvent({
      id: makeEventId('comment-create'),
      kind: 'comment-create',
      createdAt: new Date().toISOString(),
      actor: author,
      target: commentId,
      summary: match
        ? `CommentCop flagged u/${author} at ${Math.round(match.score * 100)}% similarity.`
        : `CommentCop scanned comment by u/${author}.`,
      payload: { commentId, postId, score: match?.score ?? 0 },
    });

    return c.json({ status: match ? 'flagged' : 'ok', score: match?.score ?? 0 }, 200);
  } catch (error) {
    console.error('on-comment-create failed', error);
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
