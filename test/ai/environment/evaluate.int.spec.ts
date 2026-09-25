import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const upstreamUrl = 'https://api.typesafe.ai/v1/systemone';

describe('booted environment-configured TypeSafe evaluation', () => {
  let booted: BootedFrogBot;
  let originalFetch: typeof fetch;
  const upstreamCalls: { model: string; authorization: string | null }[] = [];

  beforeAll(async () => {
    originalFetch = globalThis.fetch;

    vi.stubEnv('TYPESAFE_AI_API_KEY', 'test-environment-key');

    globalThis.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);

      if (url !== upstreamUrl) return originalFetch(input, init);

      const body = JSON.parse(String(init?.body)) as { model: string };
      const headers = new Headers(init?.headers);

      upstreamCalls.push({ model: body.model, authorization: headers.get('authorization') });

      return Response.json({
        model: 'jev-1.13.0',
        answers: { refunded: { type: 'noul', noul: 0.93 } },
        usage: { input_tokens: 9, output_tokens: 0 },
      });
    };

    booted = await bootFrogBot(dirname);
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;

    await booted.shutdown();

    vi.unstubAllEnvs();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    upstreamCalls.length = 0;
  });

  it('resolves true config from TYPESAFE_AI_API_KEY and sends the native model', async () => {
    const result = await booted.frogbot.evaluate({
      model: 'typesafe-ai/jev',
      state: 'A refund was issued.',
      questions: { refunded: { type: 'boolean', instructions: 'Was the refund issued?' } },
      maxRetries: 0,
    });

    expect(booted.frogbot.config.ai?.providers['typesafe-ai']).toBe(true);
    expect(result.answers.refunded.probability).toBe(0.93);
    expect(upstreamCalls).toEqual([
      { model: 'jev-latest', authorization: 'Bearer test-environment-key' },
    ]);
    expect(
      (await booted.frogbot.find({ collection: 'usage-logs', overrideAccess: true })).docs,
    ).toHaveLength(0);
  });
});
