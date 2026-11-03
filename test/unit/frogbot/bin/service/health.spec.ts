import type { ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import { checkHealth } from '../../../../../packages/frogbot/src/bin/service/health.js';

const running = { exitCode: null, signalCode: null } as ChildProcess;

describe('health check', () => {
  let server: Server | undefined;

  afterEach(async () => {
    await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
    server = undefined;
  });

  function serve(statuses: Record<string, number>): Promise<number> {
    server = createServer((req, res) => {
      res.writeHead(statuses[req.url ?? ''] ?? 404).end();
    });

    return new Promise((resolve) =>
      server!.listen(0, '127.0.0.1', () => resolve((server!.address() as { port: number }).port)),
    );
  }

  it('passes when the pages, the health route and the API answer', async () => {
    const port = await serve({ '/': 200, '/admin': 307, '/api/health': 200, '/api/access': 200 });

    await expect(checkHealth(port, running)).resolves.toBeUndefined();
  });

  it('skips a missing health route, for apps made before FrogBot 0.39', async () => {
    const port = await serve({ '/': 200, '/admin': 200, '/api/access': 403 });

    await expect(checkHealth(port, running)).resolves.toBeUndefined();
  });

  it('fails a build whose API catch-all throws', async () => {
    const port = await serve({ '/': 200, '/admin': 200, '/api/health': 200, '/api/access': 500 });

    await expect(checkHealth(port, running)).rejects.toThrow(
      'the server answered /api/access with 500',
    );
  });

  it('fails a health route that answers anything but 200', async () => {
    const port = await serve({ '/': 200, '/admin': 200, '/api/health': 503 });

    await expect(checkHealth(port, running)).rejects.toThrow(
      'the server answered /api/health with 503',
    );
  });
});
