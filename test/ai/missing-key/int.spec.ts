import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed';
import { agentSlug, model, notesSlug } from './config.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const missingKey =
  'OpenAI has no API key. Set the OPENAI_API_KEY environment variable, or set ai.providers.openai.apiKey in the FrogBot config.';

describe('an enabled AI provider with no API key', () => {
  let booted: BootedFrogBot;
  let originalFetch: typeof fetch;
  const upstreamCalls: string[] = [];

  beforeAll(async () => {
    vi.stubEnv('OPENAI_API_KEY', '');

    originalFetch = globalThis.fetch;

    globalThis.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);

      if (url.startsWith('https://api.openai.com')) upstreamCalls.push(url);

      return originalFetch(input, init);
    };

    booted = await bootFrogBot(dirname);

    await clearAndSeed(booted.frogbot, 'empty');
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;

    await booted?.shutdown();

    vi.unstubAllEnvs();
  });

  it('boots, and the REST API serves records', async () => {
    const created = await booted.restClient.post<{ doc: { id: number | string } }>(
      `/api/${notesSlug}`,
      { title: 'Call Ada' },
    );

    expect(created.status).toBe(201);

    const list = await booted.restClient.get<{ docs: Array<{ title: string }> }>(
      `/api/${notesSlug}`,
    );

    expect(list.status).toBe(200);
    expect(list.body.docs.map(({ title }) => title)).toEqual(['Call Ada']);
  });

  it('serves the admin config and the agent list', async () => {
    const agents = await fetch(`${booted.baseUrl}/api/agents`);

    expect(agents.status).toBe(200);
  });

  it('answers a chat turn with an error that names the env var', async () => {
    const response = await fetch(`${booted.baseUrl}/api/agents/${agentSlug}`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'Hello' }),
    });

    expect(await response.json()).toEqual({ error: missingKey });
    expect(response.status).toBe(401);
    expect(upstreamCalls).toEqual([]);
  });

  it('answers the OpenAI-compatible gateway route with the same error', async () => {
    const response = await booted.restClient.post<{ error: { message: string; code: string } }>(
      '/api/v1/chat/completions',
      { model, messages: [{ role: 'user', content: 'Hello' }] },
    );

    expect(response.status).toBe(401);
    expect(response.body.error).toMatchObject({
      message: missingKey,
      code: 'credential_unavailable',
    });
    expect(upstreamCalls).toEqual([]);
  });
});
