import { afterEach, describe, expect, it, vi } from 'vitest';

import { anthropicProvider } from '../../../../packages/gateway/src/providers/anthropic/index.js';
import { klingaiProvider } from '../../../../packages/gateway/src/providers/klingai/index.js';
import { openaiProvider } from '../../../../packages/gateway/src/providers/openai/index.js';
import { testEnv } from '../config/fixtures.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

const modelHeaders = (model: object) => Reflect.get(Reflect.get(model, 'config'), 'headers')();

describe('provider credential fallback', () => {
  it('leaves an omitted API key for the SDK to resolve at request time', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-boot');
    const model = openaiProvider.build({}).chat('gpt-4o');
    vi.stubEnv('OPENAI_API_KEY', 'sk-request');

    const headers = modelHeaders(model);

    expect(headers.authorization).toBe('Bearer sk-request');
  });

  it('authenticates Anthropic with authToken alone as a bearer token', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', undefined);
    const model = anthropicProvider.build({ authToken: 'ant-token' }).languageModel('claude-x');

    const headers = modelHeaders(model);

    expect(headers.authorization).toBe('Bearer ant-token');
    expect(headers['x-api-key']).toBeUndefined();
  });

  it('authenticates Kling AI with apiKey alone as a bearer token', async () => {
    vi.stubEnv('KLINGAI_ACCESS_KEY', undefined);
    vi.stubEnv('KLINGAI_SECRET_KEY', undefined);
    const model = klingaiProvider.build({ apiKey: 'kling-key' }).videoModel('kling-v2.6-t2v');

    const headers = await modelHeaders(model);

    expect(headers.authorization ?? headers.Authorization).toBe('Bearer kling-key');
  });
});

describe('provider env discovery', () => {
  it('discovers Kling AI from KLINGAI_API_KEY alone', () => {
    expect(klingaiProvider.fromEnv(testEnv({ KLINGAI_API_KEY: 'kling-env' }))).toEqual({
      apiKey: 'kling-env',
    });
  });

  it('discovers Kling AI from KLINGAI_ACCESS_KEY and KLINGAI_SECRET_KEY', () => {
    expect(
      klingaiProvider.fromEnv(
        testEnv({ KLINGAI_ACCESS_KEY: 'access', KLINGAI_SECRET_KEY: 'secret' }),
      ),
    ).toEqual({ accessKey: 'access', secretKey: 'secret' });
  });
});
