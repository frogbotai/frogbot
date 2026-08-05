import type { LanguageModelV4, LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import type { Hooks } from '../../packages/gateway/src/hooks.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';

function createRecordingModel(onCall: (options: LanguageModelV4CallOptions) => void): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() { return Promise.resolve({}); },
    doGenerate: async (options) => {
      onCall(options);
      return {
        content: [{ type: 'text', text: 'ok' }],
        finishReason: 'stop',
        usage: {
          inputTokens: { total: 1, noCache: 1 },
          outputTokens: { total: 1, text: 1 },
        },
        warnings: [],
        response: {
          id: 'response-1',
          modelId: 'mock-model',
          timestamp: new Date('2026-01-01T00:00:00Z'),
        },
      };
    },
    doStream: () => Promise.reject(new Error('unused')),
  };
}

function makeApp(providerName: string, onCall: (options: LanguageModelV4CallOptions) => void, hooks?: Hooks) {
  const registry = {
    [providerName]: { languageModel: () => createRecordingModel(onCall) },
  } as unknown as ProviderRegistry;
  return createApp({ registry, hooks });
}

function cacheControlFrom(messages: unknown[] | undefined, namespace: string) {
  const message = messages?.[0] as { content?: Array<{ providerOptions?: Record<string, Record<string, unknown>> }> };
  return message.content?.[0]?.providerOptions?.[namespace]?.cache_control;
}

describe('message provider options ordering', () => {
  it('exposes chat content-part unknown options to hooks before draining them', async () => {
    let hookMessages: unknown[] | undefined;
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeApp('anthropic', (options) => { callOptions = options; }, {
      beforeUpstream: [(args) => { hookMessages = structuredClone(args.messages); }],
    });

    const { status } = await postJson(app, '/v1/chat/completions', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: 'hello', cache_control: { type: 'ephemeral' } }],
      }],
    });

    expect(status).toBe(200);
    expect(cacheControlFrom(hookMessages, 'unknown')).toEqual({ type: 'ephemeral' });
    expect(cacheControlFrom(callOptions?.prompt, 'unknown')).toBeUndefined();
    expect((callOptions?.prompt[0] as { content: Array<{ providerOptions?: Record<string, unknown> }> })
      .content[0]?.providerOptions?.anthropic).toEqual({ cacheControl: { type: 'ephemeral' } });
  });

  it('exposes messages content-part unknown options to hooks before draining them', async () => {
    let hookMessages: unknown[] | undefined;
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeApp('anthropic', (options) => { callOptions = options; }, {
      beforeUpstream: [(args) => { hookMessages = structuredClone(args.messages); }],
    });

    const { status } = await postJson(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: 'hello', cache_control: { type: 'ephemeral' } }],
      }],
    });

    expect(status).toBe(200);
    expect(cacheControlFrom(hookMessages, 'unknown')).toEqual({ type: 'ephemeral' });
    expect(cacheControlFrom(callOptions?.prompt, 'unknown')).toBeUndefined();
    expect((callOptions?.prompt[0] as { content: Array<{ providerOptions?: Record<string, unknown> }> })
      .content[0]?.providerOptions?.anthropic).toEqual({ cacheControl: { type: 'ephemeral' } });
  });

  it('forwards messages service_tier to Bedrock', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeApp('amazon-bedrock', (options) => { callOptions = options; });

    const { status } = await postJson(app, '/v1/messages', {
      model: 'amazon-bedrock/anthropic.claude-sonnet-4-20250514-v1:0',
      max_tokens: 100,
      service_tier: 'standard_only',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(status).toBe(200);
    expect(callOptions?.providerOptions?.bedrock?.serviceTier).toBe('standard_only');
  });
});
