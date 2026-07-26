import { createServer } from 'node:http';
import { once } from 'node:events';
import { pieceContract } from 'frogbot/pieces/test';
import { afterEach, describe, expect, it } from 'vitest';
import { createHttp, httpActions } from './index.js';

const http = createHttp();

pieceContract({ piece: http, service: 'http', credentialType: 'none', actions: httpActions });
const servers: ReturnType<typeof createServer>[] = [];
afterEach(() => Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve())))));
describe('http execution', () => {
  it('calls a local server and returns non-2xx errors with failsafe', async () => {
    const server = createServer((_req, res) => { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"error":"missing"}'); });
    servers.push(server); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing fixture address.');
    const tool = http.sendRequest;
    const result = await tool.execute({ method: 'GET', url: `http://127.0.0.1:${address.port}`, headers: {}, queryParams: {}, authType: 'NONE', body_type: 'none', failsafe: true }, {} as never);
    expect(result).toMatchObject({ error: expect.stringContaining('404') });
  });
});
