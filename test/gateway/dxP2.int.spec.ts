import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { LanguageModelV4, LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import { loadLayeredConfig } from '../../packages/gateway/src/config/layered.js';
import { createGateway } from '../../packages/gateway/src/gateway.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { finish, mockUsage } from './mockModel.js';

function makeMockModel(): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() {
      return Promise.resolve({});
    },
    doGenerate: () =>
      Promise.resolve({
        content: [{ type: 'text' as const, text: 'hi' }],
        finishReason: finish('stop'),
        usage: mockUsage({
          inputTokens: { total: 2, noCache: 2 },
          outputTokens: { total: 1, text: 1 },
        }),
        warnings: [],
        response: { id: 'r1', modelId: 'mock-model', timestamp: new Date() },
      }),
    doStream: () =>
      Promise.resolve({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'text-start', id: 'text-0' });

            controller.enqueue({
              type: 'text-delta',
              id: 'text-0',
              delta: 'hi',
            });

            controller.enqueue({ type: 'text-end', id: 'text-0' });

            controller.enqueue({
              type: 'finish',
              finishReason: finish('stop'),
              usage: mockUsage({
                inputTokens: { total: 2, noCache: 2 },
                outputTokens: { total: 1, text: 1 },
              }),
            });

            controller.close();
          },
        }),
      }),
  };
}

function makeApp() {
  const registry = {
    groq: { languageModel: () => makeMockModel() },
  } as unknown as ProviderRegistry;

  return createApp({ registry });
}

describe('G89 — gateway.routes present (DX4)', () => {
  it('createGateway() exposes a routes map for selective mounting (G89)', () => {
    const gw = createGateway({ providers: { openai: { apiKey: 'sk-test' } } });

    expect(typeof gw.routes['/chat/completions'].handler).toBe('function');
    expect(typeof gw.routes['/messages'].handler).toBe('function');
    expect(typeof gw.routes['/embeddings'].handler).toBe('function');
  });
});

describe('G90 — /health endpoint not implemented (DX8)', () => {
  it('GET /health returns 200 (G90)', async () => {
    const app = makeApp();
    const res = await app.request('http://localhost/health', { method: 'GET' });

    expect(res.status).toBe(200);
  });
});

describe('G92 — project config walk stops at the project root (DX10)', () => {
  it('does not merge a malicious ancestor config above the project root (G92)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'frogbotai-gateway-g92-'));
    const outer = join(dir, 'outer');
    const project = join(outer, 'project');
    mkdirSync(project, { recursive: true });

    writeFileSync(
      join(outer, 'gateway.config.json'),
      JSON.stringify({ providers: { openai: { apiKey: 'malicious-key', organization: 'evil' } } }),
    );

    mkdirSync(join(project, '.git'));

    writeFileSync(
      join(project, 'gateway.config.json'),
      JSON.stringify({ providers: { openai: { apiKey: 'project-key' } } }),
    );

    const result = await loadLayeredConfig({ cwd: project, env: { NODE_ENV: 'test' } });

    expect(result.config.providers.openai).toEqual({ apiKey: 'project-key' });

    const projectPaths = result.sources
      .filter((source) => source.kind === 'project')
      .map((source) => source.path);

    expect(projectPaths).toEqual([join(project, 'gateway.config.json')]);
  });
});

describe('G93 — provider-name typos silently accepted (DX11)', () => {
  it('createGateway with typo provider key "openaai" should warn or error (G93)', () => {
    expect(() => {
      createGateway({
        providers: {
          // @ts-expect-error intentional typo to test runtime validation
          openaai: { apiKey: 'sk-test' },
        },
      });
    }).toThrow(/unknown provider|invalid provider|openaai/i);
  });
});
