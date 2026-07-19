// Embeddability & discoverability of the gateway as documented (D-class).
//
// These prove three distinct client/operator-observable claims against the
// public seams (`createApp` / `createGateway` / `gw.handler`):
//
//   G44 — the documented `host.mount('/v1', gw.handler)` embedding recipe.
//   G45 — `enabled_providers` / `disabled_providers` on `createGateway`.
//   G37 — the documented `GET /v1/models` discovery endpoint.
//
// The mock model resolves synchronously (Promise.resolve, no async) so the
// harness never needs the network; only routing/config behavior is exercised.

import { describe, expect, it } from 'vitest';
import type { LanguageModelV4, LanguageModelV4StreamPart } from '@ai-sdk/provider';

// `hono` lives in the gateway package's own node_modules; import it from there
// so the host-app half of the mount recipe uses the exact Hono the gateway does.
import { Hono } from '../../packages/gateway/node_modules/hono/dist/index.js';
import { createApp } from '../../packages/gateway/src/app.js';
import { createGateway } from '../../packages/gateway/src/gateway.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';

function createMockLanguageModel(): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    defaultObjectGenerationMode: undefined,
    get supportedUrls() { return Promise.resolve({}); },
    doGenerate: () =>
      Promise.resolve({
        content: [{ type: 'text', text: 'hi' }],
        finishReason: 'stop',
        usage: {
          inputTokens: { total: 1, noCache: 1 },
          outputTokens: { total: 1, text: 1 },
        },
        warnings: [],
        response: { id: 'r', modelId: 'mock-model', timestamp: new Date('2026-01-01T00:00:00Z') },
      }),
    doStream: () => Promise.resolve({ stream: new ReadableStream<LanguageModelV4StreamPart>() }),
  } as LanguageModelV4;
}

function makeAppWithMockProvider(providerName: string) {
  const fakeProvider = { languageModel: () => createMockLanguageModel() };
  const registry = { [providerName]: fakeProvider } as unknown as ProviderRegistry;
  return createApp({ registry });
}

// ---------------------------------------------------------------------------
// G44 (DX1) — `host.mount('/v1', gw.handler)` embedding recipe
// ---------------------------------------------------------------------------

describe('gateway embeddability — mount recipe (G44)', () => {
  // The vision doc's canonical Scenario B/C example is
  // `app.mount('/v1', gw.handler)`. Hono's mount strips the `/v1` mount
  // segment, so the mounted handler sees `/chat/completions` — which the
  // gateway serves because routes register bare paths (createApp mounts them
  // at both `/` and `basePath`, default `/v1`).
  it('reaches the gateway when mounted under /v1 and POSTing /v1/chat/completions', async () => {
    const gw = makeAppWithMockProvider('groq');
    const host = new Hono();
    host.mount('/v1', gw.fetch);

    const res = await host.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'groq/test-model',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });

    expect(res.status).toBe(200);
  });

  // The double prefix `/v1/v1/chat/completions` also resolves: the mount
  // strips one `/v1`, and the gateway's own `basePath` mount serves the
  // remaining `/v1/chat/completions` (direct-call backward compatibility).
  it('accidentally routes the double-prefixed /v1/v1/chat/completions instead', async () => {
    const gw = makeAppWithMockProvider('groq');
    const host = new Hono();
    host.mount('/v1', gw.fetch);

    const res = await host.request('http://localhost/v1/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'groq/test-model',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// G45 (DX2) — enabled_providers / disabled_providers on createGateway
// ---------------------------------------------------------------------------

describe('gateway config — provider allow/deny lists (G45)', () => {
  // `disabled_providers: ['anthropic']` promises (per the schema doc comment)
  // that anthropic is removed. createGateway applies finalizeConfig (which
  // runs applyAllowDeny) before building the registry, so a denied provider
  // 404s not_found like any unconfigured provider (G45).
  it('denies a provider named in disabled_providers with 404 not_found', async () => {
    const gw = createGateway({
      providers: {
        openai: { apiKey: 'sk-openai-test' },
        anthropic: { apiKey: 'sk-ant-test' },
      },
      disabled_providers: ['anthropic'],
    });

    const res = await gw.handler(new Request('http://localhost/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 100,
      }),
    }));

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: { type?: string } };
    expect(body.error?.type).toBe('not_found_error');
  });

  // Allow-list mirror: `enabled_providers: ['openai']` promises only openai
  // survives, so an anthropic request is excluded (404).
  it('excludes providers not named in enabled_providers with 404 not_found', async () => {
    const gw = createGateway({
      providers: {
        openai: { apiKey: 'sk-openai-test' },
        anthropic: { apiKey: 'sk-ant-test' },
      },
      enabled_providers: ['openai'],
    });

    const res = await gw.handler(new Request('http://localhost/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 100,
      }),
    }));

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: { type?: string } };
    expect(body.error?.type).toBe('not_found_error');
  });
});

// ---------------------------------------------------------------------------
// G37 (MD1) — the documented GET /v1/models discovery endpoint
// ---------------------------------------------------------------------------

describe('gateway discovery — GET /v1/models (G37)', () => {
  // GET /v1/models is a core documented endpoint. A client listing available
  // models gets the OpenAI-shaped `{ object: 'list', data: [...] }` list,
  // filtered to the configured providers.
  it('lists models as an OpenAI-shaped { object: "list", data: [...] }', async () => {
    const app = makeAppWithMockProvider('groq');

    const res = await app.request('http://localhost/v1/models', { method: 'GET' });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { object?: string; data?: unknown[] };
    expect(body.object).toBe('list');
    expect(Array.isArray(body.data)).toBe(true);
  });
});
