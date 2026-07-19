// G38 (PR2 + DT3) — the Bedrock canonical-ID map (BEDROCK_CANONICAL_IDS) is
// wired into resolveProvider: a client sending a shorthand alias like
// `amazon-bedrock/claude-4-sonnet` gets the resolved canonical ID
// (`anthropic.claude-sonnet-4-20250514-v1:0`) forwarded upstream, not the
// raw alias Bedrock would reject.
//
// Mock int test (not a live Zen e2e): exercising Bedrock ID resolution needs
// AWS/Bedrock creds that Zen's free OpenAI-compatible models can't stand in for;
// the observable seam is "which model id did languageModel() receive".

import { describe, expect, it } from 'vitest';
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
} from '@ai-sdk/provider';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { BEDROCK_CANONICAL_IDS } from '../../packages/gateway/src/providers/bedrock/canonical.js';
import { postJson } from '../__helpers/gateway/post-json.js';

function createMockModel(): LanguageModelV4 {
  const usage = {
    inputTokens: { total: 1, noCache: 1 },
    outputTokens: { total: 1, text: 1 },
  };
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() { return Promise.resolve({}); },
    doGenerate: (_options: LanguageModelV4CallOptions) =>
      Promise.resolve({
        content: [{ type: 'text' as const, text: 'ok' }],
        finishReason: 'stop' as const,
        usage,
        warnings: [],
        response: { id: 'r', modelId: 'mock-model', timestamp: new Date('2026-01-01T00:00:00Z') },
      }),
    doStream: (_options: LanguageModelV4CallOptions) =>
      Promise.resolve({ stream: new ReadableStream() }),
  } as LanguageModelV4;
}

describe('bedrock shorthand alias resolves to canonical ID before upstream — G38', () => {
  // A client sends the documented shorthand `amazon-bedrock/claude-4-sonnet`.
  // The gateway resolves it through BEDROCK_CANONICAL_IDS in resolveProvider
  // and calls languageModel() with the full canonical ID that Bedrock
  // actually accepts.
  it('passes the resolved canonical Bedrock ID to languageModel(), not the shorthand alias', async () => {
    const alias = 'claude-4-sonnet';
    const canonical = BEDROCK_CANONICAL_IDS[alias];
    expect(canonical, 'fixture alias must exist in the canonical map').toBeDefined();

    let receivedModelId: string | undefined;
    const fakeProvider = {
      languageModel: (id: string) => {
        receivedModelId = id;
        return createMockModel();
      },
    };
    const registry = { 'amazon-bedrock': fakeProvider } as ProviderRegistry;
    const app = createApp({ registry });

    const { status } = await postJson(app, '/v1/chat/completions', {
      model: `amazon-bedrock/${alias}`,
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(status).toBe(200);
    expect(receivedModelId).toBe(canonical);
  });
});
