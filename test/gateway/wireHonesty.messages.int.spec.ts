import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4FilePart,
  LanguageModelV4FinishReason,
  LanguageModelV4StreamPart,
  SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';
import { finish, mockUsage } from './mockModel.js';

function createApiCallError(opts: {
  message: string;
  statusCode: number;
  responseBody?: string;
}): Error {
  return Object.assign(new Error(opts.message), {
    name: 'AI_APICallError',
    url: 'https://upstream.example/v1/messages',
    requestBodyValues: {},
    statusCode: opts.statusCode,
    responseHeaders: {},
    responseBody: opts.responseBody,
    isRetryable: false,
    [Symbol.for('vercel.ai.error')]: true,
    [Symbol.for('vercel.ai.error.AI_APICallError')]: true,
  });
}

function createRecordingModel(opts?: {
  text?: string;
  error?: Error;
  finishReason?: LanguageModelV4FinishReason;
  providerMetadata?: SharedV4ProviderMetadata;
  streamParts?: LanguageModelV4StreamPart[];
  onCall?: (options: LanguageModelV4CallOptions) => void;
}): LanguageModelV4 {
  const {
    text = 'Hello from mock!',
    error,
    finishReason = finish('stop', 'end_turn'),
    providerMetadata,
    streamParts,
    onCall,
  } = opts ?? {};

  const usage = mockUsage({
    inputTokens: { total: 5, noCache: 5 },
    outputTokens: { total: 4, text: 4 },
  });

  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() {
      return Promise.resolve({ '*': [/.*/] });
    },
    doGenerate: (options: LanguageModelV4CallOptions) => {
      onCall?.(options);
      if (error) return Promise.reject(error);

      return Promise.resolve({
        content: [{ type: 'text' as const, text }],
        finishReason,
        usage,
        warnings: [],
        ...(providerMetadata ? { providerMetadata } : {}),
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
      const parts: LanguageModelV4StreamPart[] = streamParts ?? [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text-0' },
        { type: 'text-delta', id: 'text-0', delta: text },
        { type: 'text-end', id: 'text-0' },
        { type: 'finish', finishReason, usage },
      ];

      return Promise.resolve({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            for (const part of parts) {
              controller.enqueue(part);
            }

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

function postMessages(app: ReturnType<typeof createApp>, body: Record<string, unknown>) {
  return postJson(app, '/v1/messages', {
    model: 'anthropic/claude-sonnet-4-20250514',
    messages: [{ role: 'user', content: 'hi' }],
    max_tokens: 128,
    ...body,
  });
}

describe('messages content-filter → stop_reason refusal', () => {
  it('non-streaming: content-filter finish emits stop_reason refusal', async () => {
    const app = makeAppWithModel(
      'anthropic',
      createRecordingModel({
        text: 'I cannot help with that.',
        finishReason: finish('content-filter', 'refusal'),
      }),
    );

    const { status, body } = await postMessages(app, {});

    expect(status).toBe(200);
    expect(body).toHaveProperty('stop_reason', 'refusal');
  });

  it('streaming: content-filter finish emits message_delta stop_reason refusal', async () => {
    const usage = mockUsage({
      inputTokens: { total: 5, noCache: 5 },
      outputTokens: { total: 4, text: 4 },
    });

    const app = makeAppWithModel(
      'anthropic',
      createRecordingModel({
        streamParts: [
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 'text-0' },
          { type: 'text-delta', id: 'text-0', delta: 'nope' },
          { type: 'text-end', id: 'text-0' },
          {
            type: 'finish',
            finishReason: finish('content-filter', 'refusal'),
            usage,
          },
        ],
      }),
    );

    const res = await app.request('http://localhost/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 128,
        stream: true,
      }),
    });

    expect(res.status).toBe(200);

    const sse = await res.text();
    const deltaMatch = sse.match(/^event: message_delta\ndata: (.+)$/m);

    expect(deltaMatch).not.toBeNull();

    const delta = JSON.parse(deltaMatch![1]) as { delta: { stop_reason: string } };

    expect(delta.delta.stop_reason).toBe('refusal');
  });
});

describe('messages server tools not mis-translated', () => {
  it('does not register web_search_20250305 as a client function tool', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel(
      'anthropic',
      createRecordingModel({
        onCall: (options) => {
          callOptions = options;
        },
      }),
    );

    await postMessages(app, {
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
    });

    const tools = (callOptions?.tools ?? []) as Array<{ type: string; name: string }>;
    const fakeClientTool = tools.find((t) => t.type === 'function' && t.name === 'web_search');

    expect(fakeClientTool).toBeUndefined();
  });
});

describe('messages URL document defaults to application/pdf', () => {
  it('forwards a media_type-less URL document as application/pdf', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel(
      'anthropic',
      createRecordingModel({
        onCall: (options) => {
          callOptions = options;
        },
      }),
    );

    const { status } = await postMessages(app, {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'summarize this' },
            { type: 'document', source: { type: 'url', url: 'https://example.com/doc.pdf' } },
          ],
        },
      ],
    });

    expect(status).toBe(200);

    const userMessage = callOptions?.prompt.find((m) => m.role === 'user');
    const fileParts = (Array.isArray(userMessage?.content) ? userMessage.content : []).filter(
      (p): p is LanguageModelV4FilePart => p.type === 'file',
    );

    expect(fileParts).toHaveLength(1);
    expect(fileParts[0].mediaType).toBe('application/pdf');
  });
});

describe('messages service_tier round trip', () => {
  it('forwards request service_tier to the upstream call', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel(
      'anthropic',
      createRecordingModel({
        onCall: (options) => {
          callOptions = options;
        },
      }),
    );

    const { status } = await postMessages(app, { service_tier: 'standard_only' });

    expect(status).toBe(200);
    expect(JSON.stringify(callOptions?.providerOptions ?? {})).toContain('standard_only');
  });

  it('emits usage.service_tier from provider metadata on the response', async () => {
    const app = makeAppWithModel(
      'anthropic',
      createRecordingModel({
        providerMetadata: {
          anthropic: {
            usage: { input_tokens: 5, output_tokens: 4, service_tier: 'standard' },
            stopSequence: null,
          },
        },
      }),
    );

    const { status, body } = await postMessages(app, {});

    expect(status).toBe(200);
    expect(body).toHaveProperty('usage.service_tier', 'standard');
  });
});

describe('messages Anthropic error envelope fidelity', () => {
  function appWithUpstreamStatus(statusCode: number, message: string) {
    return makeAppWithModel(
      'anthropic',
      createRecordingModel({
        error: createApiCallError({ message, statusCode }),
      }),
    );
  }

  it('upstream 413 → request_too_large', async () => {
    const { status, body } = await postMessages(
      appWithUpstreamStatus(413, 'Request exceeds the maximum allowed number of bytes'),
      {},
    );

    expect(status).toBe(413);
    expect(body).toHaveProperty('error.type', 'request_too_large');
  });

  it('upstream 402 → billing_error', async () => {
    const { status, body } = await postMessages(appWithUpstreamStatus(402, 'Payment required'), {});

    expect(status).toBe(402);
    expect(body).toHaveProperty('error.type', 'billing_error');
  });

  it('upstream 504 → timeout_error', async () => {
    const { status, body } = await postMessages(
      appWithUpstreamStatus(504, 'Upstream timed out'),
      {},
    );

    expect(status).toBe(504);
    expect(body).toHaveProperty('error.type', 'timeout_error');
  });

  it('upstream 502 → api_error, not overloaded_error', async () => {
    const { status, body } = await postMessages(appWithUpstreamStatus(502, 'Bad gateway'), {});

    expect(status).toBe(502);
    expect(body).toHaveProperty('error.type', 'api_error');
  });

  it('upstream 529 passes through as 529 overloaded_error (runtime works despite GatewayHttpStatus excluding 529)', async () => {
    const { status, body } = await postMessages(appWithUpstreamStatus(529, 'Overloaded'), {});

    expect(status).toBe(529);
    expect(body).toHaveProperty('error.type', 'overloaded_error');
  });

  it('error body carries a top-level request_id matching x-request-id', async () => {
    const { headers, body } = await postMessages(appWithUpstreamStatus(429, 'Rate limited'), {});
    const requestId = headers.get('x-request-id');

    expect(requestId).not.toBeNull();
    expect(body).toHaveProperty('request_id', requestId);
  });

  it('streaming pre-first-byte upstream 529 re-materializes as HTTP 529', async () => {
    const app = makeAppWithModel(
      'anthropic',
      createRecordingModel({
        streamParts: [
          {
            type: 'error',
            error: Object.assign(new Error('Overloaded'), { statusCode: 529 }),
          },
        ],
      }),
    );

    const res = await app.request('http://localhost/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 128,
        stream: true,
      }),
    });

    const body = (await res.json()) as { error?: { type?: string } };

    expect(body).toHaveProperty('error.type', 'overloaded_error');
    expect(res.status).toBe(529);
  });
});

describe('messages structured output forwarded upstream', () => {
  const schema = {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city'],
    additionalProperties: false,
  };

  it('forwards output_config.format json_schema as responseFormat {type: json, schema}', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel(
      'anthropic',
      createRecordingModel({
        text: '{"city":"Paris"}',
        onCall: (options) => {
          callOptions = options;
        },
      }),
    );

    const { status } = await postMessages(app, {
      output_config: { format: { type: 'json_schema', schema } },
    });

    expect(status).toBe(200);
    expect(callOptions?.responseFormat).toEqual(
      expect.objectContaining({
        type: 'json',
        schema: expect.objectContaining({ type: 'object' }),
      }),
    );
  });

  it('forwards deprecated top-level output_format as responseFormat {type: json, schema}', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel(
      'anthropic',
      createRecordingModel({
        text: '{"city":"Paris"}',
        onCall: (options) => {
          callOptions = options;
        },
      }),
    );

    const { status } = await postMessages(app, {
      output_format: { type: 'json_schema', schema },
    });

    expect(status).toBe(200);
    expect(callOptions?.responseFormat).toEqual(expect.objectContaining({ type: 'json' }));
  });
});

describe('messages metadata.user_id explicit 400', () => {
  it('rejects metadata.user_id with a typed, param-attributed 400 (not a silent drop)', async () => {
    let upstreamCalled = false;
    const app = makeAppWithModel(
      'anthropic',
      createRecordingModel({
        onCall: () => {
          upstreamCalled = true;
        },
      }),
    );

    const { status, body } = await postMessages(app, {
      metadata: { user_id: 'user-123' },
    });

    expect(status).toBe(400);
    expect(body).toHaveProperty('type', 'error');
    expect(body).toHaveProperty('error.type', 'invalid_request_error');
    expect(body).toHaveProperty('error.param', 'metadata.user_id');
    expect(upstreamCalled).toBe(false);
  });
});
