// Review 056 — G155: LIVE-UPSTREAM DISCOVERY (found by the Zen real-model
// e2e suite, 2026-07-11; missed by every mock test and both prior reviews).
//
// ai@7.0.0 renamed `system` → `instructions` (vercel/ai #15110) and
// `standardizePrompt` now THROWS `InvalidPromptError` on any `role: 'system'`
// message in `messages` unless `allowSystemInMessages: true` is passed.
// The responses handler passes it (responses/handler.ts:137); the
// chatCompletions and messages handlers do NOT — so on the two PRIMARY
// routes, EVERY request carrying a system prompt fails with:
//   400 {"error":{"message":"Invalid prompt: System messages are not
//   allowed...","code":"invalid_prompt"}}
//
// Why mocks never caught it: no int test posts a system prompt AND asserts
// 200 on chat/messages (int.spec.ts's two system tests only capture
// beforeUpstream hook args and never check the response status).
//
// Both tests below assert the CORRECT behavior and now serve as regression
// guards (fixed by passing `allowSystemInMessages: true` in both handlers,
// mirroring the responses handler).

import { describe, expect, it } from 'vitest';
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
} from '@ai-sdk/provider';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';

function createRecordingModel(opts?: {
  onCall?: (options: LanguageModelV4CallOptions) => void;
}): LanguageModelV4 {
  const usage = {
    inputTokens: { total: 5, noCache: 5 },
    outputTokens: { total: 4, text: 4 },
  };
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() { return Promise.resolve({}); },
    doGenerate: async (options: LanguageModelV4CallOptions) => {
      opts?.onCall?.(options);
      return {
        content: [{ type: 'text' as const, text: 'hi' }],
        finishReason: 'stop',
        usage,
        warnings: [],
        response: {
          id: 'mock-resp-1',
          modelId: 'mock-model',
          timestamp: new Date('2026-01-01T00:00:00Z'),
        },
      };
    },
    doStream: async () => {
      throw new Error('not used');
    },
  };
}

function makeAppWithModel(providerName: string, model: LanguageModelV4) {
  const fakeProvider = { languageModel: () => model };
  const registry = { [providerName]: fakeProvider } as unknown as ProviderRegistry;
  return createApp({ registry });
}

describe('system prompts must reach upstream on all text routes', () => {
  // G155 regression guard — ai@7 renamed system→instructions and standardizePrompt
  // rejects role:system in messages without allowSystemInMessages.
  it('chat completions: system message → 200 and system content reaches upstream', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel('openai', createRecordingModel({
      onCall: (options) => { callOptions = options; },
    }));

    const { status } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Be brief.' },
        { role: 'user', content: 'Say hi' },
      ],
    });

    expect(status).toBe(200);
    expect(callOptions?.prompt.some((m) => m.role === 'system')).toBe(true);
  });

  // G155 regression guard — same defect on /v1/messages via top-level `system` param.
  it('messages: top-level system param → 200 and system content reaches upstream', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel('anthropic', createRecordingModel({
      onCall: (options) => { callOptions = options; },
    }));

    const { status } = await postJson(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      max_tokens: 100,
      system: 'Be brief.',
      messages: [{ role: 'user', content: 'Say hi' }],
    });

    expect(status).toBe(200);
    expect(callOptions?.prompt.some((m) => m.role === 'system')).toBe(true);
  });
});
