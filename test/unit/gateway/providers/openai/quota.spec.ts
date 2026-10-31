import { generateText } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { openaiProvider } from '../../../../../packages/gateway/src/providers/openai/index.js';

function stubRateLimit(code: string) {
  const fetch = vi.fn(() =>
    Promise.resolve(
      Response.json(
        { error: { message: 'limited', type: code, code } },
        { status: 429, headers: { 'retry-after-ms': '0' } },
      ),
    ),
  );

  vi.stubGlobal('fetch', fetch);

  return fetch;
}

const generate = () =>
  generateText({
    model: openaiProvider.build({ apiKey: 'sk-test' }).languageModel('gpt-4o-mini'),
    prompt: 'hi',
    maxRetries: 2,
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('openai insufficient_quota', () => {
  it('does not retry a 429 insufficient_quota', async () => {
    const fetch = stubRateLimit('insufficient_quota');

    await expect(generate()).rejects.toMatchObject({ statusCode: 429, isRetryable: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('still retries any other 429', async () => {
    const fetch = stubRateLimit('rate_limit_exceeded');

    await expect(generate()).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
