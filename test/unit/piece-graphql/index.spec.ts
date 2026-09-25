import { once } from 'node:events';
import { createServer } from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../packages/frogbot/src/getFrogBot.js', () => ({
  createDefaultRequest: vi.fn(),
}));

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/pieces/definePiece.js'));

import { pieceActionDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import { createGraphql, graphqlActions } from '../../../packages/pieces/piece-graphql/src/index.js';

const graphql = createGraphql();
const servers: ReturnType<typeof createServer>[] = [];

async function listen(server: ReturnType<typeof createServer>) {
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();

  if (!address || typeof address === 'string') throw new Error('Missing fixture address.');

  return address.port;
}

afterEach(() =>
  Promise.all(
    servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  ),
);

describe('graphql', () => {
  it('exposes the semantic action name', () => {
    expect(graphqlActions).toEqual(['sendRequest']);
    expect(graphql.sendRequest).toBeTypeOf('function');

    const definition = pieceActionDefinition(graphql.sendRequest);

    expect(
      definition?.output.parse({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: { data: { frog: 'bot' } },
      }),
    ).toBeDefined();
  });

  it('rejects non-HTTP endpoints before transport', async () => {
    await expect(
      graphql.sendRequest({
        input: { url: 'file:///tmp/graphql', query: '{ frog }' },
        req: {} as never,
      }),
    ).rejects.toThrow('URL must use HTTP or HTTPS.');
  });

  it('maps a GraphQL request and returns the complete response', async () => {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];

      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json', 'x-fixture': 'graphql' });
        res.end(
          JSON.stringify({
            method: req.method,
            url: req.url,
            authorization: req.headers.authorization,
            request: JSON.parse(Buffer.concat(chunks).toString()),
          }),
        );
      });
    });
    const port = await listen(server);

    const result = await graphql.sendRequest({
      input: {
        url: `http://127.0.0.1:${port}/graphql?existing=yes`,
        queryParams: { tag: ['one', 'two'], page: 2 },
        headers: { authorization: 'Bearer secret' },
        query: 'query Frog($name: String!) { frog(name: $name) }',
        variables: { name: 'bot' },
      },
      req: {} as never,
    });

    expect(result).toMatchObject({
      status: 200,
      headers: { 'x-fixture': 'graphql' },
      body: {
        method: 'POST',
        url: '/graphql?existing=yes&tag=one&tag=two&page=2',
        authorization: 'Bearer secret',
        request: {
          query: 'query Frog($name: String!) { frog(name: $name) }',
          variables: { name: 'bot' },
        },
      },
    });
  });

  it('routes an HTTP request through an authenticated proxy', async () => {
    const proxy = createServer((req, res) => {
      const chunks: Buffer[] = [];

      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            url: req.url,
            authorization: req.headers['proxy-authorization'],
            request: JSON.parse(Buffer.concat(chunks).toString()),
          }),
        );
      });
    });
    const port = await listen(proxy);

    const result = await graphql.sendRequest({
      input: {
        url: 'http://graphql.example/query',
        query: '{ frog }',
        useProxy: true,
        proxySettings: { host: '127.0.0.1', port, username: 'frog', password: 'secret' },
      },
      req: {} as never,
    });

    expect(result.body).toEqual({
      url: 'http://graphql.example/query',
      authorization: `Basic ${Buffer.from('frog:secret').toString('base64')}`,
      request: { query: '{ frog }' },
    });
  });

  it('encodes GET operations in the URL without a request body', async () => {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];

      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: { url: req.url, bytes: Buffer.concat(chunks).length } }));
      });
    });
    const port = await listen(server);

    const result = await graphql.sendRequest({
      input: {
        method: 'GET',
        url: `http://127.0.0.1:${port}/graphql`,
        query: 'query Frog($name: String!) { frog(name: $name) }',
        variables: { name: 'bot' },
      },
      req: {} as never,
    });
    const responseUrl = new URL(
      (result.body as { data: { url: string } }).data.url,
      `http://127.0.0.1:${port}`,
    );

    expect(responseUrl.searchParams.get('query')).toBe(
      'query Frog($name: String!) { frog(name: $name) }',
    );
    expect(responseUrl.searchParams.get('variables')).toBe('{"name":"bot"}');
    expect(result.body).toMatchObject({ data: { bytes: 0 } });
  });

  it('throws a useful error for a failed response', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ errors: [{ message: 'Invalid token' }] }));
    });
    const port = await listen(server);

    await expect(
      graphql.sendRequest({
        input: { url: `http://127.0.0.1:${port}`, query: '{ viewer { id } }' },
        req: {} as never,
      }),
    ).rejects.toThrow(
      'GraphQL request failed with status 401: {"errors":[{"message":"Invalid token"}]}',
    );
  });

  it('returns failed responses and transport errors in failsafe mode', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(500, { 'content-type': 'text/plain', 'x-fixture': 'failure' });
      res.end('Unavailable');
    });
    const port = await listen(server);

    await expect(
      graphql.sendRequest({
        input: { url: `http://127.0.0.1:${port}`, query: '{ frog }', failsafe: true },
        req: {} as never,
      }),
    ).resolves.toMatchObject({
      status: 500,
      headers: { 'x-fixture': 'failure' },
      body: 'Unavailable',
    });

    const closedServer = createServer();
    const closedPort = await listen(closedServer);
    await new Promise<void>((resolve) => closedServer.close(() => resolve()));
    servers.splice(servers.indexOf(closedServer), 1);

    const result = await graphql.sendRequest({
      input: {
        url: `http://127.0.0.1:${closedPort}`,
        query: '{ frog }',
        failsafe: true,
      },
      req: {} as never,
    });

    expect(result).toMatchObject({
      status: 0,
      headers: {},
      body: {
        errors: [{ message: expect.stringContaining('GraphQL request failed:') }],
      },
    });
  });
});
