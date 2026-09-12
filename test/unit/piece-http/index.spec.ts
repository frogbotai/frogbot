import { once } from 'node:events';
import { createServer } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import { createHttp } from '../../../packages/pieces/piece-http/src/index.js';

const http = createHttp();
const servers: ReturnType<typeof createServer>[] = [];

afterEach(() =>
  Promise.all(
    servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  ),
);

describe('http execution', () => {
  it('sends a request to a local server', async () => {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json', 'x-fixture': 'http' });
        res.end(
          JSON.stringify({
            method: req.method,
            url: req.url,
            authorization: req.headers.authorization,
            body: JSON.parse(Buffer.concat(chunks).toString()),
          }),
        );
      });
    });
    servers.push(server);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing fixture address.');

    const result = await http.sendRequest({
      input: {
        method: 'POST',
        url: `http://127.0.0.1:${address.port}/items?existing=yes`,
        queryParams: { tag: ['one', 'two'], page: 2 },
        authType: 'BEARER_TOKEN',
        authFields: { token: 'secret' },
        bodyType: 'json',
        body: { name: 'frog' },
      },
      req: {} as never,
    });
    expect(result).toMatchObject({
      status: 200,
      headers: { 'x-fixture': 'http' },
      body: {
        method: 'POST',
        url: '/items?existing=yes&tag=one&tag=two&page=2',
        authorization: 'Bearer secret',
        body: { name: 'frog' },
      },
    });
  });

  it('parses duplicate query parameters as arrays', async () => {
    await expect(
      http.parseUrl({
        input: { url: 'https://example.com/path?tag=one&tag=two#section', returnArrays: true },
        req: {} as never,
      }),
    ).resolves.toEqual({
      baseUrl: 'https://example.com',
      domain: 'example.com',
      path: '/path',
      queryParameters: { tag: ['one', 'two'] },
      hash: 'section',
    });
  });
});
