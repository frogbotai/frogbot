import { existsSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { createGatewayHandler, getFrogbot } from 'frogbot';
import { Hono } from 'hono';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const { default: config } = await import('../frogbot.config.js');

const frogbot = await getFrogbot({ config });
const gatewayHandler = createGatewayHandler(frogbot);

const app = new Hono();

app.get('/', (c) => c.json({ ok: true, name: 'frogbot' }));
app.all('/api/ai/*', (c) => gatewayHandler(c.req.raw));
app.all('/api/*', (c) => frogbot.handleRequest(c.req.raw.clone()));

const port = Number(process.env.PORT ?? 3000);

const server = serve({ fetch: app.fetch, port }, (info) => {
  frogbot.logger.info(`Ready on http://localhost:${info.port}`);
  frogbot.logger.info(`REST API: http://localhost:${info.port}/api`);
});

const shutdown = async () => {
  server.close();
  await frogbot.destroy();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
