import { afterEach, describe, expect, it, vi } from 'vitest';

import { openaiProvider } from './openai/index.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('provider credential fallback', () => {
  it('leaves an omitted API key for the SDK to resolve at request time', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-boot');
    const model = openaiProvider.build({}).chat('gpt-4o');
    vi.stubEnv('OPENAI_API_KEY', 'sk-request');

    const headers = Reflect.get(Reflect.get(model, 'config'), 'headers')();
    expect(headers.authorization).toBe('Bearer sk-request');
  });
});
