// Hono app that mounts the Payload REST handler via the Frogbot class.

import { Hono } from 'hono';

import type { Frogbot } from '../frogbot.js';
import { handleGatewayRequest } from './gateway.js';

export function createServer(frogbot: Frogbot): Hono {
  const app = new Hono();

  // Request logging middleware
  app.use('*', async (c, next) => {
    const start = Date.now();
    const method = c.req.method;
    const path = new URL(c.req.url).pathname;

    try {
      await next();
    } catch (err) {
      const ms = Date.now() - start;
      frogbot.logger.error(`${method} ${path} 500 in ${ms}ms`);
      throw err;
    }

    const ms = Date.now() - start;
    const status = c.res.status;
    const contentLength = c.res.headers.get('content-length');
    const size = contentLength ? ` ${formatBytes(parseInt(contentLength, 10))}` : '';
    const msg = `${method} ${path} ${status} in ${ms}ms${size}`;

    if (status >= 500) {
      frogbot.logger.error(msg);
    } else if (status >= 400) {
      frogbot.logger.warn(msg);
    } else {
      frogbot.logger.info(msg);
    }
  });

  // Liveness check
  app.get('/', (c) => {
    return c.json({ ok: true, name: 'frogbot' });
  });

  app.all('/api/ai/*', async (c) => {
    return handleGatewayRequest({ frogbot, request: c.req.raw });
  });

  // Mount Payload REST handler on /api/*
  app.all('/api/*', async (c) => {
    return frogbot.handleRequest(c.req.raw.clone());
  });

  return app;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
