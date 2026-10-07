import type { LanguageModelV4 } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import { BEDROCK_CANONICAL_IDS } from '../../packages/gateway/src/providers/bedrock/canonical.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';
import { finish, mockModel, mockUsage } from './mockModel.js';

function createMockModel(): LanguageModelV4 {
  return mockModel({
    doGenerate: () =>
      Promise.resolve({
        content: [{ type: 'text', text: 'ok' }],
        finishReason: finish('stop'),
        usage: mockUsage({
          inputTokens: { total: 1, noCache: 1 },
          outputTokens: { total: 1, text: 1 },
        }),
        warnings: [],
        response: { id: 'r', modelId: 'mock-model', timestamp: new Date('2026-01-01T00:00:00Z') },
      }),
    doStream: () => Promise.resolve({ stream: new ReadableStream() }),
  });
}

describe('bedrock shorthand alias resolves to canonical ID before upstream — G38', () => {
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

    const registry = { bedrock: fakeProvider } as ProviderRegistry;
    const app = createApp({ registry });

    const { status } = await postJson(app, '/v1/chat/completions', {
      model: `bedrock/${alias}`,
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(status).toBe(200);
    expect(receivedModelId).toBe(canonical);
  });
});
