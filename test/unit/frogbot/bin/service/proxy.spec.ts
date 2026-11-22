import { createServer, request, type Server } from 'node:http';
import { connect } from 'node:net';
import type { Duplex } from 'node:stream';

import { afterEach, describe, expect, it } from 'vitest';

import { freePort } from '../../../../../packages/frogbot/src/bin/service/ports.js';
import { createProxy } from '../../../../../packages/frogbot/src/bin/service/proxy.js';

const closers: (() => Promise<unknown>)[] = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

async function upstream(): Promise<{ port: number; upgrades: string[] }> {
  const port = await freePort();
  const upgrades: string[] = [];
  const server: Server = createServer((_req, res) => res.end('upstream'));

  const sockets = new Set<Duplex>();

  server.on('upgrade', (req, socket) => {
    sockets.add(socket);
    upgrades.push(String(req.url));

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n',
    );

    socket.on('data', (chunk: Buffer) => socket.write(`echo ${String(chunk)}`));
  });

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));

  closers.push(
    () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();

        server.closeAllConnections();
        server.close(resolve);
      }),
  );

  return { port, upgrades };
}

async function proxyOn(): Promise<{ port: number; proxy: ReturnType<typeof createProxy> }> {
  const port = await freePort();
  const proxy = createProxy();

  await proxy.listen(port);
  closers.push(() => proxy.close());

  return { port, proxy };
}

describe('the proxy', () => {
  it("pipes a websocket upgrade, as Next's hot reload opens, to the current server", async () => {
    const target = await upstream();
    const { port, proxy } = await proxyOn();

    proxy.switchTo(target.port);

    const socket = connect({ host: '127.0.0.1', port });
    let received = '';

    socket.on('data', (chunk: Buffer) => (received += String(chunk)));

    socket.write(
      'GET /_next/webpack-hmr HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n',
    );

    await expect.poll(() => received).toContain('101 Switching Protocols');

    socket.write('ping');

    await expect.poll(() => received).toContain('echo ping');
    expect(target.upgrades).toEqual(['/_next/webpack-hmr']);

    socket.destroy();
  });

  it('answers 503 with retry-after once released, until the next switch', async () => {
    const target = await upstream();
    const { port, proxy } = await proxyOn();
    const get = () =>
      new Promise<{ status?: number; retry?: string }>((resolve, reject) => {
        request({ host: '127.0.0.1', port, path: '/' }, (res) => {
          res.resume();
          resolve({ status: res.statusCode, retry: res.headers['retry-after'] });
        })
          .on('error', reject)
          .end();
      });

    proxy.switchTo(target.port);

    expect((await get()).status).toBe(200);

    proxy.release();

    expect(await get()).toEqual({ status: 503, retry: '1' });

    proxy.switchTo(target.port);

    expect((await get()).status).toBe(200);
  });
});
