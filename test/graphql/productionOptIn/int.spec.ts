import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GRAPHQL_PLAYGROUND_GET, GRAPHQL_POST } from '@frogbotai/next/routes';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import config from './config.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('GraphQL production opt-ins', () => {
  let booted: BootedFrogBot;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'graphql-production-opt-in');
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('GET /api/graphql-playground serves the page in production when explicitly enabled', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const response = await GRAPHQL_PLAYGROUND_GET(config)(
      new Request('http://localhost/api/graphql-playground'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html');
  });

  it('POST /api/graphql answers production introspection when explicitly enabled', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const response = await GRAPHQL_POST(config)(
      new Request('http://localhost/api/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: '{ __schema { queryType { name } } }' }),
      }),
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.errors).toBeUndefined();
    expect(body.data.__schema.queryType.name).toBe('Query');
  });
});
