import type { LanguageModelV4, LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';
import { finish, mockUsage } from './mockModel.js';

function createRetryableApiCallError(opts: {
  message: string;
  statusCode: number;
  responseHeaders: Record<string, string>;
  responseBody?: string;
}): Error {
  return Object.assign(new Error(opts.message), {
    name: 'AI_APICallError',
    url: 'https://upstream.example/v1/chat/completions',
    requestBodyValues: {},
    statusCode: opts.statusCode,
    responseHeaders: opts.responseHeaders,
    responseBody: opts.responseBody,
    isRetryable: true,
    [Symbol.for('vercel.ai.error')]: true,
    [Symbol.for('vercel.ai.error.AI_APICallError')]: true,
  });
}

function createRecordingModel(opts?: {
  text?: string;
  error?: Error;
  onCall?: (options: LanguageModelV4CallOptions) => void;
}): LanguageModelV4 {
  const { text = 'Hello from mock!', error, onCall } = opts ?? {};
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
      if (error) return Promise.reject(error);

      return Promise.resolve({
        content: [{ type: 'text' as const, text }],
        finishReason: finish('stop'),
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
      if (error) return Promise.reject(error);

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

describe('chat response_format forwarded upstream', () => {
  it('forwards response_format {type: json_object} as responseFormat {type: json}', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel(
      'openai',
      createRecordingModel({
        text: '{"ok":true}',
        onCall: (options) => {
          callOptions = options;
        },
      }),
    );

    const { status } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'return JSON' }],
      response_format: { type: 'json_object' },
    });

    expect(status).toBe(200);
    expect(callOptions?.responseFormat).toEqual({ type: 'json' });
  });

  it('forwards response_format {type: json_schema, strict} as responseFormat {type: json, schema}', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel(
      'openai',
      createRecordingModel({
        text: '{"city":"Paris"}',
        onCall: (options) => {
          callOptions = options;
        },
      }),
    );

    const schema = {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
      additionalProperties: false,
    };

    const { status } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'return JSON' }],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'weather', strict: true, schema },
      },
    });

    expect(status).toBe(200);
    expect(callOptions?.responseFormat).toEqual(
      expect.objectContaining({
        type: 'json',
        schema: expect.objectContaining({ type: 'object' }),
      }),
    );
  });
});

describe('messages thinking forwarded upstream', () => {
  it('maps thinking {type: enabled, budget_tokens} to providerOptions.anthropic.thinking.budgetTokens', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel(
      'anthropic',
      createRecordingModel({
        onCall: (options) => {
          callOptions = options;
        },
      }),
    );

    const { status } = await postJson(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'think hard' }],
      max_tokens: 4096,
      thinking: { type: 'enabled', budget_tokens: 2048 },
    });

    expect(status).toBe(200);

    const thinking = (callOptions?.providerOptions as any)?.anthropic?.thinking;

    expect(thinking).toEqual({ type: 'enabled', budgetTokens: 2048 });
  });

  it('maps adaptive thinking with its display to providerOptions.anthropic.thinking', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel(
      'anthropic',
      createRecordingModel({
        onCall: (options) => {
          callOptions = options;
        },
      }),
    );

    const { status } = await postJson(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-5',
      messages: [{ role: 'user', content: 'think hard' }],
      max_tokens: 4096,
      thinking: { type: 'adaptive', display: 'summarized' },
    });

    expect(status).toBe(200);

    const thinking = (callOptions?.providerOptions as any)?.anthropic?.thinking;

    expect(thinking).toEqual({ type: 'adaptive', display: 'summarized' });
  });
});

describe('responses tool-call round trip', () => {
  it('accepts function_call + function_call_output input items and delivers the tool result upstream', async () => {
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
      input: [
        { role: 'user', content: 'what is the weather in Paris?' },
        {
          type: 'function_call',
          id: 'fc_1',
          call_id: 'call_1',
          name: 'get_weather',
          arguments: '{"city":"Paris"}',
          status: 'completed',
        },
        {
          type: 'function_call_output',
          call_id: 'call_1',
          output: '{"temperature":"18C"}',
        },
      ],
      tools: [
        {
          type: 'function',
          name: 'get_weather',
          parameters: { type: 'object', properties: { city: { type: 'string' } } },
        },
      ],
    });

    expect(status, `expected 200, got ${status}: ${JSON.stringify(body)}`).toBe(200);

    const toolMessage = callOptions?.prompt.find((m) => m.role === 'tool');

    expect(toolMessage).toBeDefined();
    expect(JSON.stringify(toolMessage)).toContain('call_1');
  });
});

describe('RetryError unwraps to upstream 429 envelope', () => {
  it('returns 429 rate_limit_error with retry headers when upstream 429s exhaust SDK retries', async () => {
    const upstreamError = createRetryableApiCallError({
      message: 'Rate limit exceeded',
      statusCode: 429,
      responseHeaders: { 'retry-after-ms': '0', 'retry-after': '30' },
      responseBody: '{"error":{"message":"Rate limit exceeded"}}',
    });

    const app = makeAppWithModel('openai', createRecordingModel({ error: upstreamError }));

    const { status, headers, body } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(status, `expected 429, got ${status}: ${JSON.stringify(body)}`).toBe(429);
    expect(body).toHaveProperty('error.type', 'rate_limit_error');
    expect(headers.get('retry-after')).not.toBeNull();
    expect(headers.get('x-should-retry')).toBe('true');
  });
});
