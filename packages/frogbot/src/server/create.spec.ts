import { describe, expect, it, vi } from 'vitest';

import { createServer } from './create.js';
import type { Frogbot } from '../frogbot.js';

const mocks = vi.hoisted(() => ({
  handleGatewayRequest: vi.fn(() => Promise.resolve(new Response('gateway'))),
}));

vi.mock('./gateway.js', () => mocks);

describe('createServer (Hono app)', () => {
  it.todo('GET / returns { ok: true, name: "frogbot" }');
  it.todo('mounts frogbot.handleRequest at /api/*');
  it('routes /api/ai requests through the embedded gateway', async () => {
    const handleRequest = vi.fn(() => Promise.resolve(new Response('payload')));
    const frogbot = {
      handleRequest,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as unknown as Frogbot;
    const app = createServer(frogbot);

    const response = await app.request('/api/ai/v1/chat/completions', { method: 'POST' });

    expect(await response.text()).toBe('gateway');
    expect(mocks.handleGatewayRequest).toHaveBeenCalledWith(expect.objectContaining({ frogbot }));
    expect(handleRequest).not.toHaveBeenCalled();
  });
  it.todo('forwards the cloned raw request to frogbot.handleRequest');
  it.todo('returns 404 for paths that are neither / nor /api/*');
  it.todo('logs every request with method, path, status, and duration');
  it.todo('appends a human-readable byte size when the response has a content-length header');
  it.todo('logs at info level for 2xx/3xx responses');
  it.todo('logs at warn level for 4xx responses');
  it.todo('logs at error level for 5xx responses');
  it.todo('logs a 500 error line and re-throws when downstream middleware throws');
});
