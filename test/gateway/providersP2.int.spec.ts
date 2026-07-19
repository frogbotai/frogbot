// Providers P2 findings — G80–G83
//
// G80: CONFIRMED (D-class) — Pre-built provider instance not accepted; config/types gap
// G81: FIXED — enforcement of enabled_providers applied by createGateway (G45);
//      typos in the lists now raise a ConfigError instead of being silently ignored
// G82: CONFIRMED — Provider config type errors only surface at first request, not startup
// G83: REJECTED — registry keys ('vertex', 'anthropic-aws') ARE keys the AI SDK reads
//      (google reads legacy 'vertex'; anthropic reads custom 'anthropic-aws'); no 'google-vertex' key exists

import { describe, expect, it } from 'vitest';
import type { LanguageModelV4, LanguageModelV4CallOptions } from '@ai-sdk/provider';

import { createApp } from '../../packages/gateway/src/app.js';
import { createGateway } from '../../packages/gateway/src/gateway.js';
import { buildProviderRegistry, type ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeCapturingModel(capture: (opts: LanguageModelV4CallOptions) => void) {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    defaultObjectGenerationMode: undefined,
    get supportedUrls() { return Promise.resolve({}); },
    doGenerate: (options: LanguageModelV4CallOptions) => {
      capture(options);
      return Promise.resolve({
        content: [{ type: 'text', text: 'ok' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: { inputTokens: { total: 1, noCache: 1 }, outputTokens: { total: 1, text: 1 } },
        warnings: [],
        response: { id: 'r1', modelId: 'mock-model', timestamp: new Date('2026-01-01T00:00:00Z') },
      });
    },
    doStream: () => Promise.resolve({ stream: new ReadableStream() }),
  } as unknown as LanguageModelV4;
}

// ---------------------------------------------------------------------------
// G80 — Pre-built provider instance not accepted by createGateway (D-class)
//
// ProviderConfigMap accepts only config objects (e.g. { apiKey: '...' }).
// buildProviderRegistry calls providers[name].build(cfg) on every entry.
// Passing a pre-built SDK instance as the config would call build(instance)
// treating the instance as if it were a config shape, causing a runtime crash.
// This is a documentation/type safety gap: the TypeScript types don't
// express that provider instances cannot be passed here.
//
// D-class: confirmed by reading registry.ts:buildOne + types.ts:ProviderDefinition.
// No runtime test needed — structural analysis is sufficient.
// ---------------------------------------------------------------------------

describe('G80 — pre-built provider instance not accepted (D-class)', () => {
  it('buildProviderRegistry accepts config objects and builds instances from them', () => {
    // Documents the correct path: config objects → build() → instances
    const registry = buildProviderRegistry({ openai: { apiKey: 'sk-test' } });
    expect(registry.openai).toBeDefined();
    // The built instance has languageModel method — it is NOT the raw config
    expect(typeof registry.openai?.languageModel).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// G81 — enabled_providers allow/deny behavior in createGateway
//
// Functional enforcement fixed by G45: createGateway now calls finalizeConfig
// (config/parse.ts), which applies allow/deny filtering before building the
// registry. The remaining G81 defect is diagnostics: typos in the lists are
// silently ignored (see second test).
// ---------------------------------------------------------------------------

describe('G81 — createGateway applies enabled_providers (enforcement via G45)', () => {
  it(
    // enabled_providers: ['openai'] excludes all other providers (G45 fix)
    'createGateway respects enabled_providers allow list (excluded providers become unavailable)',
    async () => {
      // Configure two providers, but only allow 'openai' via enabled_providers
      const app = createGateway({
        providers: {
          openai: { apiKey: 'sk-test-openai' },
          groq: { apiKey: 'test-groq-key' },
        },
        enabled_providers: ['openai'],
      });

      // groq is excluded by enabled_providers — 404 "not configured" (G45 fix)
      const res = await app.handler(new Request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'groq/llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: 'hi' }],
        }),
      }));

      // 404: groq excluded from the registry by the allow list
      expect(res.status).toBe(404);
    },
  );

  it('createGateway throws when enabled_providers contains unknown provider names', () => {
    // G81 fix: unknown names in enabled_providers ('some-other-provider'
    // matches nothing) are now reported as a ConfigError instead of being
    // silently ignored. Filtering itself is still applied (G45).
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

// ---------------------------------------------------------------------------
// G82 — Provider config type errors surface at first request, not startup
//
// parseGatewayConfig validates only "at least one provider configured" but
// does NOT validate field types within provider configs. Passing api_key: 123
// (number instead of string) passes startup validation silently and only
// errors at first request when the AI SDK attempts to use the credential.
// ---------------------------------------------------------------------------

describe('G82 — provider config type errors surface at first request, not startup', () => {
  it(
    // G82: bad api_key type fails at createGateway (startup validation)
    'createGateway throws at startup when provider config has wrong field types',
    () => {
      // A gateway with api_key as a number should fail at config time,
      // not defer the error until the first actual API call.
      expect(() => {
        createGateway({
          // @ts-expect-error — intentionally passing wrong type to test runtime validation
          providers: { openai: { apiKey: 123 } },
        });
      }).toThrow(/apiKey|api_key|invalid|string/i);
    },
  );
});

// ---------------------------------------------------------------------------
// G83 — forwardLanguageParams namespaces by registry key (REJECTED / BUG-NOT-REAL)
//
// forwardLanguageParams (utils/params.ts:91-117) moves providerOptions.unknown
// → providerOptions[providerName] where providerName is the REGISTRY key
// (e.g. 'vertex', 'anthropic-aws').
//
// The original finding claimed these registry keys don't match the AI SDK's
// providerOptions namespace, so params never reach the model. Reading the AI
// SDK source proves that is FALSE for every provider PR11 named:
//
//   - registry 'vertex' → the Vertex language model reads providerOptions
//     under ['googleVertex', 'vertex'] with 'vertex' an explicitly-supported
//     LEGACY key (ai/packages/google/src/google-language-model.ts:131-134).
//     The key is NEVER 'google-vertex'. Filing under 'vertex' is VALID.
//
//   - registry 'anthropic-aws' → the model's config.provider is
//     'anthropic-aws.messages', so providerOptionsName is 'anthropic-aws'
//     (ai/packages/anthropic/src/anthropic-language-model.ts:193-197). It
//     parses providerOptions under both 'anthropic' AND the custom
//     'anthropic-aws' key (same file:266-282). Filing under 'anthropic-aws'
//     is VALID.
//
//   - registry 'amazon-bedrock' → Bedrock reads ['amazonBedrock', 'bedrock']
//     (ai/packages/amazon-bedrock/src/amazon-bedrock-chat-language-model.ts
//     :110-116). The gateway never files caching params here anyway because
//     'amazon-bedrock' is in CACHE_DROP_PROVIDERS (utils/params.ts:215).
//
// Conclusion: the registry key the gateway uses is a key the SDK actually
// reads. G83/PR11 is BUG-NOT-REAL. The tests below assert the correct,
// SDK-verified behavior for vertex.
// ---------------------------------------------------------------------------

describe('G83 — forwardLanguageParams registry key IS a key the SDK reads (REJECTED)', () => {
  it('prompt_cache_key for vertex lands under the SDK-read "vertex" namespace', async () => {
    // The Vertex language model reads providerOptions under
    // ['googleVertex', 'vertex']. The gateway files under the registry key
    // 'vertex' — which the SDK explicitly supports as the legacy key. So the
    // forwarded caching options DO reach the model. There is no 'google-vertex'
    // namespace anywhere in the SDK.
    let capturedOptions: LanguageModelV4CallOptions | undefined;
    const model = makeCapturingModel((opts) => { capturedOptions = opts; });

    const fakeProvider = { languageModel: () => model };
    const registry = { vertex: fakeProvider } as unknown as ProviderRegistry;
    const app = createApp({ registry });

    // prompt_cache_key flows: parsePromptCachingOptions → providerOptions.unknown
    // → forwardLanguageParams → providerOptions['vertex']
    const { status } = await postJson(app, '/v1/chat/completions', {
      model: 'vertex/gemini-2.0-flash',
      messages: [{ role: 'user', content: 'hi' }],
      prompt_cache_key: 'cache-key-1',
    });

    expect(status).toBe(200);
    // Params land under 'vertex' — a namespace the Vertex SDK reads
    // (google-language-model.ts:131-134). This is correct, not a bug.
    expect(capturedOptions?.providerOptions).toHaveProperty('vertex');
    expect(capturedOptions?.providerOptions?.['vertex']).toMatchObject({
      promptCacheKey: 'cache-key-1',
    });
    // There is no 'google-vertex' key in the AI SDK — it must NOT be produced.
    expect(capturedOptions?.providerOptions?.['google-vertex']).toBeUndefined();
  });
});
