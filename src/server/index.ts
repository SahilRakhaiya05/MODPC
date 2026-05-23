import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort } from '@devvit/web/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { api } from './routes/api';
import { menu } from './routes/menu';
import { triggers } from './routes/triggers';
import { scheduler } from './routes/scheduler';
import { createTrpcContext } from './context';
import { appRouter } from './routers';

const app = new Hono();
const internal = new Hono();

internal.route('/menu', menu);
internal.route('/triggers', triggers);
internal.route('/scheduler', scheduler);

app.route('/api', api);
app.route('/internal', internal);
app.all('/trpc/*', async (c) =>
  fetchRequestHandler({
    endpoint: '/trpc',
    req: c.req.raw,
    router: appRouter,
    createContext: createTrpcContext,
  })
);

serve({
  fetch: app.fetch,
  createServer,
  port: getServerPort(),
});
