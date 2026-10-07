import type { LanguageModelV4, LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import { createGateway } from '../../packages/gateway/src/gateway.js';
import {
  buildProviderRegistry,
  type ProviderRegistry,
} from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';
import { providerMap } from '../unit/gateway/config/fixtures.js';
import { finish, mockUsage } from './mockModel.js';

function makeCapturingModel(capture: (opts: LanguageModelV4CallOptions) => void) {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() {
      return Promise.resolve({});
    },
    doGenerate: (options: LanguageModelV4CallOptions) => {
      capture(options);

      return Promise.resolve({
        content: [{ type: 'text', text: 'ok' }],
        finishReason: finish('stop', 'stop'),
        usage: mockUsage({
          inputTokens: { total: 1, noCache: 1 },
          outputTokens: { total: 1, text: 1 },
        }),
        warnings: [],
        response: { id: 'r1', modelId: 'mock-model', timestamp: new Date('2026-01-01T00:00:00Z') },
      });
    },
    doStream: () => Promise.resolve({ stream: new ReadableStream() }),
  } as unknown as LanguageModelV4;
}

describe('G80 — pre-built provider instance not accepted (D-class)', () => {
  it('buildProviderRegistry accepts config objects and builds instances from them', () => {
    const registry = buildProviderRegistry(providerMap({ openai: { apiKey: 'sk-test' } }));

    expect(registry.openai).toBeDefined();
    expect(typeof registry.openai?.languageModel).toBe('function');
  });
});

describe('G81 — createGateway applies enabled_providers (enforcement via G45)', () => {
  it('createGateway respects enabled_providers allow list (excluded providers become unavailable)', async () => {
    const app = createGateway({
      providers: {
        openai: { apiKey: 'sk-test-openai' },
        groq: { apiKey: 'test-groq-key' },
      },
      enabled_providers: ['openai'],
    });

    const res = await app.handler(
      new Request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'groq/llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: 'hi' }],
        }),
      }),
    );

    expect(res.status).toBe(404);
  });

  it('createGateway throws when enabled_providers contains unknown provider names', () => {
    expect(() => {
      createGateway({
        providers: { openai: { apiKey: 'sk-test' } },
        enabled_providers: ['openai', 'some-other-provider'],
      });
    }).toThrow(/unknown provider.*some-other-provider/i);
  });

  it('createGateway throws when disabled_providers contains unknown provider names', () => {
    expect(() => {
      createGateway({
        providers: { openai: { apiKey: 'sk-test' } },
        disabled_providers: ['nonexistent-provider'],
      });
    }).toThrow(/unknown provider.*nonexistent-provider/i);
  });
});

describe('G82 — provider config type errors surface at first request, not startup', () => {
  it('createGateway throws at startup when provider config has wrong field types', () => {
    expect(() => {
      createGateway({
        // @ts-expect-error — intentionally passing wrong type to test runtime validation
        providers: { openai: { apiKey: 123 } },
      });
    }).toThrow(/apiKey|api_key|invalid|string/i);
  });
});

describe('G83 — forwardLanguageParams registry key IS a key the SDK reads (REJECTED)', () => {
  it('prompt_cache_key for vertex lands under the SDK-read "vertex" namespace', async () => {
    let capturedOptions: LanguageModelV4CallOptions | undefined;
    const model = makeCapturingModel((opts) => {
      capturedOptions = opts;
    });

    const fakeProvider = { languageModel: () => model };
    const registry = { vertex: fakeProvider } as unknown as ProviderRegistry;
    const app = createApp({ registry });

    const { status } = await postJson(app, '/v1/chat/completions', {
      model: 'vertex/gemini-2.0-flash',
      messages: [{ role: 'user', content: 'hi' }],
      prompt_cache_key: 'cache-key-1',
    });

    expect(status).toBe(200);
    expect(capturedOptions?.providerOptions).toHaveProperty('vertex');
    expect(capturedOptions?.providerOptions?.['vertex']).toMatchObject({
      promptCacheKey: 'cache-key-1',
    });
    expect(capturedOptions?.providerOptions?.['google-vertex']).toBeUndefined();
  });
});
