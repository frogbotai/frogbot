import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import { bedrockProvider, type BedrockConfig } from '../../packages/gateway/src/providers/bedrock/index.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';

const upstreamBodies: unknown[] = [];

function makeApp() {
  const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    upstreamBodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({
      output: { message: { role: 'assistant', content: [{ text: 'ok' }] } },
      stopReason: 'end_turn',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      metrics: { latencyMs: 1 },
    }), { headers: { 'content-type': 'application/json' } });
  });
  const bedrock = bedrockProvider.build({ apiKey: 'test', region: 'us-east-1', fetch } as BedrockConfig);
  return createApp({
    registry: { 'amazon-bedrock': bedrock } as unknown as ProviderRegistry,
  });
}

beforeEach(() => {
  upstreamBodies.length = 0;
});

describe('Bedrock prompt caching wire contract', () => {
  it('emits cachePoint blocks for chat system and user markers', async () => {
    const { status } = await postJson(makeApp(), '/v1/chat/completions', {
      model: 'amazon-bedrock/anthropic.claude-sonnet-4-20250514-v1:0',
      messages: [
        { role: 'system', content: 'Reusable context', cache_control: { type: 'ephemeral' } },
        { role: 'user', content: 'Question', cache_control: { type: 'ephemeral' } },
      ],
    });

    expect(status).toBe(200);
    expect(upstreamBodies[0]).toMatchObject({
      system: [{ text: 'Reusable context' }, { cachePoint: { type: 'default' } }],
      messages: [{
        role: 'user',
        content: [{ text: 'Question' }, { cachePoint: { type: 'default' } }],
      }],
    });
  });

  it('emits cachePoint blocks for messages system, text, and tool_result markers', async () => {
    const { status } = await postJson(makeApp(), '/v1/messages', {
      model: 'amazon-bedrock/anthropic.claude-sonnet-4-20250514-v1:0',
      max_tokens: 100,
      system: [{ type: 'text', text: 'Reusable context', cache_control: { type: 'ephemeral' } }],
      tools: [{
        name: 'lookup',
        description: 'Look up a result',
        input_schema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
      }],
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Question', cache_control: { type: 'ephemeral' } }],
        },
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tool-1', name: 'lookup', input: { id: 1 } }],
        },
        {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: 'tool-1',
            content: 'Result',
            cache_control: { type: 'ephemeral' },
          }],
        },
      ],
    });

    expect(status).toBe(200);
    expect(upstreamBodies[0]).toMatchObject({
      system: [{ text: 'Reusable context' }, { cachePoint: { type: 'default' } }],
      messages: [
        { role: 'user', content: [{ text: 'Question' }, { cachePoint: { type: 'default' } }] },
        { role: 'assistant', content: [{ toolUse: { toolUseId: 'tool-1', name: 'lookup', input: { id: 1 } } }] },
        {
          role: 'user',
          content: [
            { toolResult: { toolUseId: 'tool-1', content: [{ text: 'Result' }] } },
            { cachePoint: { type: 'default' } },
          ],
        },
      ],
    });
  });
});
