import type { LanguageModelV4, LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';
import { requiredToolCall } from '../__helpers/gateway/required-tool-call.js';
import { finish, mockUsage } from './mockModel.js';

const TOOL_CALLS_FINISH = finish('tool-calls', 'tool_calls');

function createRecordingModel(opts?: {
  text?: string;
  onCall?: (options: LanguageModelV4CallOptions) => void;
}): LanguageModelV4 {
  const { text = 'Hello from mock!', onCall } = opts ?? {};
  const usage = mockUsage({
    inputTokens: { total: 5, noCache: 5 },
    outputTokens: { total: 4, text: 4 },
  });

  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() {
      return Promise.resolve({});
    },
    doGenerate: (options: LanguageModelV4CallOptions) => {
      onCall?.(options);

      const toolCalls = requiredToolCall(options);

      return Promise.resolve({
        content: toolCalls.length > 0 ? toolCalls : [{ type: 'text' as const, text }],
        finishReason: toolCalls.length > 0 ? TOOL_CALLS_FINISH : finish('stop'),
        usage,
        warnings: [],
        response: {
          id: 'mock-resp-1',
          modelId: 'mock-model',
          timestamp: new Date('2026-01-01T00:00:00Z'),
        },
      });
    },
    doStream: (options: LanguageModelV4CallOptions) => {
      onCall?.(options);

      return Promise.resolve({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] });
            controller.enqueue({ type: 'text-start', id: 'text-0' });
            controller.enqueue({ type: 'text-delta', id: 'text-0', delta: text });
            controller.enqueue({ type: 'text-end', id: 'text-0' });
            controller.enqueue({ type: 'finish', finishReason: finish('stop'), usage });
            controller.close();
          },
        }),
      });
    },
  };
}

function makeAppWithModel(providerName: string, model: LanguageModelV4) {
  const fakeProvider = { languageModel: () => model };
  const registry = { [providerName]: fakeProvider } as unknown as ProviderRegistry;

  return createApp({ registry });
}

describe('responses hosted tools forwarded upstream (openai)', () => {
  it('forwards tools:[{type: web_search}] as provider-defined tool id openai.web_search', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel(
      'openai',
      createRecordingModel({
        onCall: (options) => {
          callOptions = options;
        },
      }),
    );

    const { status, body } = await postJson(app, '/v1/responses', {
      model: 'openai/gpt-4o-mini',
      input: 'what happened in the news today?',
      tools: [{ type: 'web_search' }],
    });

    expect(status, `expected 200, got ${status}: ${JSON.stringify(body)}`).toBe(200);
    expect(callOptions?.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'provider', id: 'openai.web_search' }),
      ]),
    );
  });

  it('forwards tools:[{type: mcp, server_label, server_url}] as provider-defined tool id openai.mcp with server args', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel(
      'openai',
      createRecordingModel({
        onCall: (options) => {
          callOptions = options;
        },
      }),
    );

    const { status, body } = await postJson(app, '/v1/responses', {
      model: 'openai/gpt-4o-mini',
      input: 'use the deepwiki server',
      tools: [
        {
          type: 'mcp',
          server_label: 'deepwiki',
          server_url: 'https://mcp.deepwiki.com/mcp',
          require_approval: 'never',
        },
      ],
    });

    expect(status, `expected 200, got ${status}: ${JSON.stringify(body)}`).toBe(200);
    expect(callOptions?.tools).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'provider', id: 'openai.mcp' })]),
    );

    const serialized = JSON.stringify(callOptions?.tools ?? []);

    expect(serialized).toContain('deepwiki');
    expect(serialized).toContain('https://mcp.deepwiki.com/mcp');
  });

  it('keeps hosted tools when mixed with function tools', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel(
      'openai',
      createRecordingModel({
        onCall: (options) => {
          callOptions = options;
        },
      }),
    );

    const { status } = await postJson(app, '/v1/responses', {
      model: 'openai/gpt-4o-mini',
      input: 'search then compute',
      tools: [
        { type: 'web_search' },
        {
          type: 'function',
          name: 'get_weather',
          parameters: { type: 'object', properties: { city: { type: 'string' } } },
        },
      ],
    });

    expect(status).toBe(200);
    expect(callOptions?.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'function', name: 'get_weather' }),
        expect.objectContaining({ type: 'provider', id: 'openai.web_search' }),
      ]),
    );
  });
});

describe('responses hosted tool_choice forwarded upstream', () => {
  it('forwards tool_choice {type: web_search} as {type: tool, toolName: web_search}', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel(
      'openai',
      createRecordingModel({
        onCall: (options) => {
          callOptions = options;
        },
      }),
    );

    const { status, body } = await postJson(app, '/v1/responses', {
      model: 'openai/gpt-4o-mini',
      input: 'search the web for this',
      tools: [{ type: 'web_search' }],
      tool_choice: { type: 'web_search' },
    });

    expect(status, `expected 200, got ${status}: ${JSON.stringify(body)}`).toBe(200);
    expect(callOptions?.toolChoice).toEqual({ type: 'tool', toolName: 'web_search' });
  });
});

describe('responses hosted tools on non-OpenAI upstream', () => {
  it('rejects hosted tools with a typed 400 instead of silently degrading', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    let modelCalled = false;
    const app = makeAppWithModel(
      'anthropic',
      createRecordingModel({
        onCall: (options) => {
          modelCalled = true;
          callOptions = options;
        },
      }),
    );

    const { status, body } = await postJson<{ error?: { type?: string; message?: string } }>(
      app,
      '/v1/responses',
      {
        model: 'anthropic/claude-sonnet-4-20250514',
        input: 'what happened in the news today?',
        tools: [{ type: 'web_search' }],
      },
    );

    expect(
      status,
      `expected typed 400, got ${status}: ${JSON.stringify(body)} ` +
        `(modelCalled=${modelCalled}, tools=${JSON.stringify(callOptions?.tools)})`,
    ).toBe(400);
    expect(body).toHaveProperty('error.type', 'invalid_request_error');
    expect(modelCalled).toBe(false);
  });
});
