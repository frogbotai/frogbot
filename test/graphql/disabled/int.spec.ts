import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GRAPHQL_PLAYGROUND_GET, GRAPHQL_POST } from '@frogbotai/next/routes';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import config, { resolverCalls } from './config.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('GraphQL routes with graphQL.disable', () => {
  let booted: BootedFrogBot;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'graphql-disabled');
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('POST /api/graphql returns 404', async () => {
    const response = await GRAPHQL_POST(config)(
      new Request('http://localhost/api/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: '{ Users { totalDocs } }' }),
      }),
    );

    expect(response.status).toBe(404);
  });

  it('GET /api/graphql-playground still serves the page in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const response = await GRAPHQL_PLAYGROUND_GET(config)(
      new Request('http://localhost/api/graphql-playground'),
    );

    expect(response.status).toBe(200);
  });

  it.each(['{ disabledQuery }', 'mutation { disabledMutation }'])(
    'POST /api/graphql does not execute disabled custom resolvers: %s',
    async (query) => {
      const response = await GRAPHQL_POST(config)(
        new Request('http://localhost/api/graphql', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query }),
        }),
      );

      expect(response.status).toBe(404);
      expect(resolverCalls).toEqual({ queries: 0, mutations: 0 });
    },
  );

  it('GET /api/graphql-playground returns 404 in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const response = await GRAPHQL_PLAYGROUND_GET(config)(
      new Request('http://localhost/api/graphql-playground'),
    );

    expect(response.status).toBe(404);
  });
});
