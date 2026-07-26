import { createServer } from 'node:http';
import { once } from 'node:events';
import { pieceContract } from 'frogbot/pieces/test';
import { afterEach, describe, expect, it } from 'vitest';
import { createGraphql, graphqlActions } from './index.js';

const graphql = createGraphql();

pieceContract({ piece: graphql, service: 'graphql', credentialType: 'none', actions: graphqlActions });
const servers: ReturnType<typeof createServer>[] = [];
afterEach(() => Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve())))));
describe('graphql execution', () => {
  it('calls a local GraphQL fixture', async () => {
    const server = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"data":{"frog":"bot"}}'); });
    servers.push(server); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing fixture address.');
    const [tool] = graphql.tools();
    const result = await tool.execute({ method: 'POST', url: `http://127.0.0.1:${address.port}`, headers: {}, queryParams: {}, query: '{ frog }', failsafe: true }, {} as never);
    expect(result).toMatchObject({ body: { data: { frog: 'bot' } }, status: 200 });
  });
});
