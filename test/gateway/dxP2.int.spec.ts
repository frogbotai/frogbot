// P2 triage — G89–G93 findings.
//
// G89 (DX4)  CONFIRMED D — createGateway() return type has no `routes` property.
//            `gw.routes` for selective mounting is absent from Gateway type.
//
// G90 (DX8)  CONFIRMED A — /health endpoint returns 404 (not implemented).
//            Docker HEALTHCHECK would fail.
//
// G91 (DX9)  CONFIRMED D — CLI discards serve() return value; no .close() on
//            SIGTERM. OTel setupTracing registers its own process.once('SIGTERM')
//            handler that calls process.exit(0) — but this is AFTER graceful
//            shutdown, NOT a force-exit racing drain. Finding is partially
//            incorrect: the OTel handler IS the graceful shutdown. The real
//            bug is that serve() result is discarded so there is no HTTP-layer
//            close/drain before process.exit.
//
// G92 (DX10) CONFIRMED D — projectConfigPaths walks up to filesystem root (64
//            iterations) and merges every ancestor config found. An ancestor-
//            dir stale/malicious .gateway.config.ts gets merged in silently.
//
// G93 (DX11) CONFIRMED D — provider-name typos (e.g. { openaai: {...} }) are
//            silently accepted. parseGatewayConfig only validates that at least
//            one provider is configured; unknown keys in providers pass through.
//            JSON path: GATEWAY_CONFIG_JSON is parsed with JSON.parse (no Zod)
//            so there is no structural validation beyond isRecord check.

import { describe, expect, it } from 'vitest';
import type { LanguageModelV4, LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApp } from '../../packages/gateway/src/app.js';
import { createGateway } from '../../packages/gateway/src/gateway.js';
import { loadLayeredConfig } from '../../packages/gateway/src/config/layered.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockModel(): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    defaultObjectGenerationMode: undefined,
    get supportedUrls() { return Promise.resolve({}); },
    doGenerate: async () => ({
      content: [{ type: 'text' as const, text: 'hi' }],
      finishReason: 'stop',
      usage: {
        inputTokens: { total: 2, noCache: 2 },
        outputTokens: { total: 1, text: 1 },
      },
      warnings: [],
      response: { id: 'r1', modelId: 'mock-model', timestamp: new Date() },
    }),
    doStream: async () => ({
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          controller.enqueue({ type: 'text-start', id: 'text-0' } as LanguageModelV4StreamPart);
          controller.enqueue({ type: 'text-delta', id: 'text-0', delta: 'hi' } as LanguageModelV4StreamPart);
          controller.enqueue({ type: 'text-end', id: 'text-0' } as LanguageModelV4StreamPart);
          controller.enqueue({
            type: 'finish',
            finishReason: 'stop',
            usage: {
              inputTokens: { total: 2, noCache: 2 },
              outputTokens: { total: 1, text: 1 },
            },
          });
          controller.close();
        },
      }),
    }),
  };
}

function makeApp() {
  const registry = { groq: { languageModel: () => makeMockModel() } } as unknown as ProviderRegistry;
  return createApp({ registry });
}

// ---------------------------------------------------------------------------
// G89 — gw.routes absent
// ---------------------------------------------------------------------------

describe('G89 — gateway.routes present (DX4)', () => {
  it('createGateway() exposes a routes map for selective mounting (G89)', () => {
    const gw = createGateway({ providers: { openai: { apiKey: 'sk-test' } } });
    expect(typeof gw.routes['/chat/completions'].handler).toBe('function');
    expect(typeof gw.routes['/messages'].handler).toBe('function');
    expect(typeof gw.routes['/embeddings'].handler).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// G90 — /health endpoint not implemented
// ---------------------------------------------------------------------------

describe('G90 — /health endpoint not implemented (DX8)', () => {
  it('GET /health returns 200 (G90)', async () => {
    const app = makeApp();
    const res = await app.request('http://localhost/health', { method: 'GET' });
    // Currently returns 404 — should be 200 for Docker HEALTHCHECK support.
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// G92 — config walk bounded to the project root (DX10)
// ---------------------------------------------------------------------------

describe('G92 — project config walk stops at the project root (DX10)', () => {
  it('does not merge a malicious ancestor config above the project root (G92)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'frogbotai-gateway-g92-'));
    const outer = join(dir, 'outer');
    const project = join(outer, 'project');
    mkdirSync(project, { recursive: true });
    // Untrusted ancestor config above the project root — must NOT be loaded.
    writeFileSync(
      join(outer, 'gateway.config.json'),
      JSON.stringify({ providers: { openai: { apiKey: 'malicious-key', organization: 'evil' } } }),
    );
    mkdirSync(join(project, '.git'));
    writeFileSync(
      join(project, 'gateway.config.json'),
      JSON.stringify({ providers: { openai: { apiKey: 'project-key' } } }),
    );

    const result = await loadLayeredConfig({ cwd: project, env: {} });

    expect(result.config.providers.openai).toEqual({ apiKey: 'project-key' });
    const projectPaths = result.sources
      .filter((source) => source.kind === 'project')
      .map((source) => source.path);
    expect(projectPaths).toEqual([join(project, 'gateway.config.json')]);
  });
});

// ---------------------------------------------------------------------------
// G93 — provider-name typos silently accepted
// ---------------------------------------------------------------------------

describe('G93 — provider-name typos silently accepted (DX11)', () => {
  it(
    'createGateway with typo provider key "openaai" should warn or error (G93)',
    () => {
      // parseGatewayConfig validates provider names against PROVIDER_NAMES. A
      // typo key like "openaai" is not a known provider, so validation throws
      // with a "did you mean" hint instead of silently dropping it.
      expect(() => {
        createGateway({
          providers: {
            // @ts-expect-error intentional typo to test runtime validation
            openaai: { apiKey: 'sk-test' },
          },
        });
      }).toThrow(/unknown provider|invalid provider|openaai/i);
    },
  );
});
