// Gateway integration tests — in-process createGateway() + Hono fetch.
//
// Tests exercise the full request → translate → (mocked upstream) → translate → response
// pipeline without real HTTP or real provider calls.
//
// Matrix: 2 endpoints × {same-provider, cross-provider} × {non-streaming, error}
// M2 additions: provider-sprawl cases for groq, bedrock, vertex, azure,
// openai-compatible — validation, credential errors, and mock model injection.

import { describe, expect, it, vi } from 'vitest';
import type {
  EmbeddingModelV4,
  EmbeddingModelV4CallOptions,
  ImageModelV4,
  ImageModelV4CallOptions,
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';

import { createApp } from '../../packages/gateway/src/app.js';
import { createGateway } from '../../packages/gateway/src/gateway.js';
import { buildProviderRegistry, type ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import type { AfterErrorHookArgs, AfterOperationHookArgs, BeforeUpstreamHookArgs, Hooks } from '../../packages/gateway/src/hooks.js';
import { postJson } from '../__helpers/gateway/post-json.js';

// ---------------------------------------------------------------------------
// Shared test app — providers configured but never actually called for
// validation-only tests. Provider calls would require mock model injection.
// ---------------------------------------------------------------------------

function makeApp() {
  return createApp({
    registry: buildProviderRegistry({
      openai: { apiKey: 'sk-test-int' },
      anthropic: { apiKey: 'sk-ant-test-int' },
    }),
  });
}

/**
 * Lightweight mock LanguageModelV4 — avoids importing ai/test from the root
 * workspace. Returns canned text response for doGenerate.
 */
function createMockLanguageModel(opts?: {
  text?: string;
  toolCalls?: Array<{ toolCallId: string; toolName: string; input: unknown }>;
  finishReason?: string;
  inputTokens?: number;
  outputTokens?: number;
  inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number };
  outputTokenDetails?: { reasoningTokens?: number };
  error?: unknown;
  warnings?: Array<{ type: string; message?: string }>;
  onCall?: (options: LanguageModelV4CallOptions) => void;
}): LanguageModelV4 {
  const {
    text = 'Hello from mock!',
    toolCalls,
    finishReason = toolCalls ? 'tool-calls' : 'stop',
    inputTokens = 5,
    outputTokens = 4,
    inputTokenDetails,
    outputTokenDetails,
    error,
    warnings = [],
    onCall,
  } = opts ?? {};

  const content: LanguageModelV4['doGenerate'] extends (opts: any) => Promise<infer R> ? R['content'] : never =
    toolCalls
      ? toolCalls.map((tc) => ({ type: 'tool-call' as const, ...tc }))
      : [{ type: 'text' as const, text }];
  const usage = {
    inputTokens: {
      total: inputTokens,
      noCache: inputTokens - (inputTokenDetails?.cacheReadTokens ?? 0),
      cacheRead: inputTokenDetails?.cacheReadTokens,
      cacheWrite: inputTokenDetails?.cacheWriteTokens,
    },
    outputTokens: {
      total: outputTokens,
      text: outputTokens - (outputTokenDetails?.reasoningTokens ?? 0),
      reasoning: outputTokenDetails?.reasoningTokens,
    },
  };

  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    defaultObjectGenerationMode: undefined,
    get supportedUrls() { return Promise.resolve({}); },
    doGenerate: async (options) => {
      onCall?.(options);
      if (error) throw error;
      return {
        content,
        finishReason,
        usage,
        warnings,
        response: {
          id: 'mock-resp-1',
          modelId: 'mock-model',
          timestamp: new Date('2026-01-01T00:00:00Z'),
        },
      };
    },
    doStream: async (options) => {
      onCall?.(options);
      const parts: LanguageModelV4StreamPart[] = [
        { type: 'stream-start' as const, warnings },
        ...(text ? [
          { type: 'text-start' as const, id: 'text-0' },
          { type: 'text-delta' as const, id: 'text-0', delta: text },
          { type: 'text-end' as const, id: 'text-0' },
        ] : []),
        { type: 'finish' as const, finishReason, usage },
      ];
      return {
        stream: new ReadableStream({
          start(controller) {
            for (const part of parts) controller.enqueue(part);
            controller.close();
          },
        }),
      };
    },
  } as unknown as LanguageModelV4;
}

/**
 * Creates an app with a mock language model injected as the given provider.
 */
function makeAppWithMockProvider(providerName: string, mockModel?: LanguageModelV4, hooks?: Hooks) {
  const model = mockModel ?? createMockLanguageModel();
  const fakeProvider = { languageModel: () => model };
  const registry = { [providerName]: fakeProvider } as unknown as ProviderRegistry;
  return createApp({ registry, hooks });
}

/**
 * A streaming mock model whose `doStream` emits an initial text chunk
 * immediately, then delays `delayMs` before emitting the `finish` chunk
 * (with real usage numbers) and closing. Used to prove `afterOperation`'s
 * `durationMs` reflects the full stream duration, not time-to-first-byte —
 * a fixed synchronous mock (like `createMockLanguageModel`) can't
 * distinguish the two since everything resolves in the same microtask.
 */
function createDelayedStreamModel(opts: {
  delayMs: number;
  text?: string;
  finishReason?: string;
  inputTokens?: number;
  outputTokens?: number;
}): LanguageModelV4 {
  const { delayMs, text = 'hello', finishReason = 'stop', inputTokens = 42, outputTokens = 17 } = opts;
  return {
    ...createMockLanguageModel(),
    doStream: async () => ({
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          controller.enqueue({ type: 'text-start', id: 'text-0' } as LanguageModelV4StreamPart);
          controller.enqueue({ type: 'text-delta', id: 'text-0', delta: text } as LanguageModelV4StreamPart);
          controller.enqueue({ type: 'text-end', id: 'text-0' } as LanguageModelV4StreamPart);
          setTimeout(() => {
            controller.enqueue({
              type: 'finish',
              // `LanguageModelV4FinishReason` is `{ unified, raw }`, not a
              // plain string — real providers always shape it this way.
              finishReason: { unified: finishReason, raw: finishReason },
              usage: {
                inputTokens: { total: inputTokens, noCache: inputTokens },
                outputTokens: { total: outputTokens, text: outputTokens },
              },
            } as LanguageModelV4StreamPart);
            controller.close();
          }, delayMs);
        },
      }),
    }),
  } as unknown as LanguageModelV4;
}

/**
 * A streaming mock model whose `doStream` emits a well-behaved mid-stream
 * provider error: a real content chunk, then an `{type:'error'}` part, then
 * the raw stream closes with no explicit `finish` part (the AI SDK
 * synthesizes `finishReason: 'error'` for the step itself).
 */
function createMidStreamErrorModel(error: unknown): LanguageModelV4 {
  return {
    ...createMockLanguageModel(),
    doStream: async () => ({
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          controller.enqueue({ type: 'text-start', id: 'text-0' } as LanguageModelV4StreamPart);
          controller.enqueue({ type: 'text-delta', id: 'text-0', delta: 'hello' } as LanguageModelV4StreamPart);
          controller.enqueue({ type: 'error', error } as LanguageModelV4StreamPart);
          controller.close();
        },
      }),
    }),
  } as unknown as LanguageModelV4;
}

function createMockEmbeddingModel(opts?: {
  embeddings?: number[][];
  tokens?: number;
  maxEmbeddingsPerCall?: number;
  error?: unknown;
  onCall?: (options: EmbeddingModelV4CallOptions) => void;
}): EmbeddingModelV4 {
  const { embeddings, tokens = 8, maxEmbeddingsPerCall, error, onCall } = opts ?? {};
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-embed-model',
    maxEmbeddingsPerCall,
    supportsParallelCalls: true,
    doEmbed: async (options) => {
      onCall?.(options);
      if (error) throw error;
      return {
        embeddings: embeddings ?? options.values.map((_, index) => [index + 0.25, index + 0.5]),
        usage: { tokens },
        response: { headers: {} },
        warnings: [],
      };
    },
  };
}

function createMockImageModel(opts?: {
  images?: string[];
  warnings?: Array<{ type: 'other'; message: string }>;
  error?: unknown;
  onCall?: (options: ImageModelV4CallOptions) => void;
}): ImageModelV4 {
  const { images, warnings = [], error, onCall } = opts ?? {};
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-image-model',
    maxImagesPerCall: undefined,
    doGenerate: async (options) => {
      onCall?.(options);
      if (error) throw error;
      return {
        images: images ?? Array.from({ length: options.n ?? 1 }, (_, index) => Buffer.from(`image-${index}`).toString('base64')),
        warnings,
        response: { timestamp: new Date('2026-01-01T00:00:00Z'), modelId: 'mock-image-model', headers: {} },
        usage: { inputTokens: 3, outputTokens: 0, totalTokens: 3 },
      };
    },
  };
}

function makeAppWithMockModalityProvider(providerName: string, opts: {
  embeddingModel?: EmbeddingModelV4;
  imageModel?: ImageModelV4;
}) {
  const fakeProvider = {
    embeddingModel: () => opts.embeddingModel ?? createMockEmbeddingModel(),
    imageModel: () => opts.imageModel ?? createMockImageModel(),
  };
  const registry = { [providerName]: fakeProvider } as unknown as ProviderRegistry;
  return createApp({ registry });
}

// ---------------------------------------------------------------------------
// OpenAI endpoint — validation + error envelope
// ---------------------------------------------------------------------------

describe('gateway integration — /v1/chat/completions', () => {
  it('rejects malformed model id with 400', async () => {
    const app = makeApp();
    const { status, headers, body } = await postJson(app, '/v1/chat/completions', {
      model: 'bare-model',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(status).toBe(400);
    expect(headers.get('x-request-id')).toEqual(expect.any(String));
    expect(body).toHaveProperty('error.code', 'invalid_model_id');
  });

  it('returns OpenAI-shaped error envelope for missing messages', async () => {
    const app = makeApp();
    const { status, body } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o-mini',
    });
    expect(status).toBe(400);
    expect(body).toHaveProperty('error.type', 'invalid_request_error');
    expect(body).toHaveProperty('error.param', 'messages');
  });

  it('cross-provider model id parses correctly for configured provider', async () => {
    const app = makeApp();
    // Non-streaming: will attempt upstream call with fake key → auth error, not 400
    const { status, body } = await postJson(app, '/v1/chat/completions', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'hello' }],
    });
    // Should get an upstream auth error (401), not a validation error (400)
    expect(status).toBe(401);
    expect(body).toHaveProperty('error.type', 'authentication_error');
  });
});

// ---------------------------------------------------------------------------
// Anthropic endpoint — validation + error envelope
// ---------------------------------------------------------------------------

describe('gateway integration — /v1/messages', () => {
  it('rejects missing model with Anthropic-shaped error', async () => {
    const app = makeApp();
    const { status, body } = await postJson(app, '/v1/messages', {
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 100,
    });
    expect(status).toBe(400);
    expect(body).toHaveProperty('type', 'error');
    expect(body).toHaveProperty('error.type', 'invalid_request_error');
  });

  it('rejects unconfigured provider with 404', async () => {
    const app = createApp({
      registry: buildProviderRegistry({ openai: { apiKey: 'sk-test' } }),
    });
    const { status, body } = await postJson(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 100,
    });
    expect(status).toBe(404);
    expect(body).toHaveProperty('error.type', 'not_found_error');
  });

  it('accepts valid request shape (fails at upstream, not validation)', async () => {
    const app = makeApp();
    const { status } = await postJson(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'hello' }],
      max_tokens: 100,
    });
    // Passes validation, then fails at the upstream call with the mock key.
    // Must be a 401 auth error from upstream, NOT a 400 validation error.
    expect(status).toBe(401);
  });

  it('forwards array-form system to beforeUpstream hooks', async () => {
    let captured: BeforeUpstreamHookArgs['system'];
    const app = makeAppWithMockProvider('anthropic', createMockLanguageModel(), {
      beforeUpstream: [(args) => { captured = args.system; }],
    });

    const { status } = await postJson(app, '/v1/messages', {
      model: 'anthropic/test-model',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 100,
      system: [{ type: 'text', text: 'be terse' }],
    });

    // G155: system prompts must not just reach hooks — the request must succeed.
    expect(status).toBe(200);
    expect(captured).toEqual([{ type: 'text', text: 'be terse' }]);
  });

  it('forwards string-form system to beforeUpstream hooks', async () => {
    let captured: BeforeUpstreamHookArgs['system'];
    const app = makeAppWithMockProvider('anthropic', createMockLanguageModel(), {
      beforeUpstream: [(args) => { captured = args.system; }],
    });

    const { status } = await postJson(app, '/v1/messages', {
      model: 'anthropic/test-model',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 100,
      system: 'be terse',
    });

    // G155: system prompts must not just reach hooks — the request must succeed.
    expect(status).toBe(200);
    expect(captured).toBe('be terse');
  });
});

// ---------------------------------------------------------------------------
// Error header propagation
// ---------------------------------------------------------------------------

describe('gateway integration — error headers', () => {
  it('returns x-should-retry header on retryable errors', async () => {
    const app = makeApp();
    // Valid shape → passes validation, then hits the real OpenAI upstream with
    // the fake `sk-test-int` key → 401 authentication_error. A 401 is not
    // retryable, so x-should-retry must be absent.
    const { status, headers } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(status).toBe(401);
    expect(headers.get('x-should-retry')).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// M2 Provider sprawl — mock model injection tests
// ---------------------------------------------------------------------------

describe('gateway integration — provider sprawl (MockLanguageModelV4)', () => {
  it('groq provider resolves and returns mock response', async () => {
    const app = makeAppWithMockProvider('groq');
    const { status, body } = await postJson(app, '/v1/chat/completions', {
      model: 'groq/llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(status).toBe(200);
    expect(body).toHaveProperty('choices[0].message.content', 'Hello from mock!');
    expect(body).toHaveProperty('usage');
  });

  it('messages route resolves provider and returns mock response', async () => {
    const app = makeAppWithMockProvider('anthropic');
    const { status, body } = await postJson(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 100,
    });
    expect(status).toBe(200);
    expect(body).toHaveProperty('content[0].text', 'Hello from mock!');
  });

  it('bedrock provider resolves and returns mock response', async () => {
    const app = makeAppWithMockProvider('amazon-bedrock');
    const { status, body } = await postJson(app, '/v1/chat/completions', {
      model: 'amazon-bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(status).toBe(200);
    expect(body).toHaveProperty('choices[0].message.content', 'Hello from mock!');
  });

  it('vertex provider resolves and returns mock response', async () => {
    const app = makeAppWithMockProvider('vertex');
    const { status, body } = await postJson(app, '/v1/chat/completions', {
      model: 'vertex/gemini-2.0-flash',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(status).toBe(200);
    expect(body).toHaveProperty('choices[0].message.content', 'Hello from mock!');
  });

  it('azure provider resolves and returns mock response', async () => {
    const app = makeAppWithMockProvider('azure');
    const { status, body } = await postJson(app, '/v1/chat/completions', {
      model: 'azure/my-gpt4o-deployment',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(status).toBe(200);
    expect(body).toHaveProperty('choices[0].message.content', 'Hello from mock!');
  });

  it('openai-compatible provider resolves via custom name', async () => {
    const app = makeAppWithMockProvider('ollama');
    const { status, body } = await postJson(app, '/v1/chat/completions', {
      model: 'ollama/llama3.2',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(status).toBe(200);
    expect(body).toHaveProperty('choices[0].message.content', 'Hello from mock!');
  });

  it('forwards prompt cache params and allowlisted headers for chat completions', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithMockProvider('anthropic', createMockLanguageModel({
      onCall: (options) => { callOptions = options; },
    }));

    const { status } = await postJson(app, '/v1/chat/completions', {
      model: 'anthropic/test-model',
      prompt_cache_key: 'cache-key-1',
      prompt_cache_retention: '1h',
      messages: [{ role: 'user', content: 'hi', cache_control: { type: 'ephemeral' } }],
    }, {
      'anthropic-beta': 'prompt-caching-2024-07-31',
      'openai-beta': 'assistants=v2',
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      authorization: 'Bearer secret',
    });

    expect(status).toBe(200);
    expect(callOptions?.providerOptions).toEqual({
      anthropic: {
        promptCacheKey: 'cache-key-1',
        promptCacheRetention: '1h',
      },
    });
    expect(callOptions?.prompt[0]).toHaveProperty('providerOptions.anthropic.cacheControl', { type: 'ephemeral' });
    expect(callOptions?.headers).toMatchObject({
      'anthropic-beta': 'prompt-caching-2024-07-31',
      'openai-beta': 'assistants=v2',
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    });
    expect(callOptions?.headers?.['user-agent']).toContain('@frogbotai/gateway/0.0.0');
    expect(callOptions?.headers?.authorization).toBeUndefined();
  });

  it('forwards Anthropic cache_control blocks after provider resolution', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithMockProvider('anthropic', createMockLanguageModel({
      onCall: (options) => { callOptions = options; },
    }));

    const { status } = await postJson(app, '/v1/messages', {
      model: 'anthropic/test-model',
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: 'hi', cache_control: { type: 'ephemeral' } }],
      }],
      max_tokens: 100,
    }, {
      'anthropic-beta': 'prompt-caching-2024-07-31',
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    });

    expect(status).toBe(200);
    expect(callOptions?.prompt[0]).toHaveProperty('content[0].providerOptions.anthropic.cacheControl', { type: 'ephemeral' });
    expect(callOptions?.headers).toMatchObject({
      'anthropic-beta': 'prompt-caching-2024-07-31',
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    });
    expect(callOptions?.headers?.['user-agent']).toContain('@frogbotai/gateway/0.0.0');
  });

  it('forwards top_k to chat completions', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithMockProvider('groq', createMockLanguageModel({
      onCall: (options) => { callOptions = options; },
    }));

    const { status } = await postJson(app, '/v1/chat/completions', {
      model: 'groq/test-model',
      messages: [{ role: 'user', content: 'hi' }],
      top_k: 42,
    });

    expect(status).toBe(200);
    expect(callOptions?.topK).toBe(42);
  });

  it('forwards top_k to messages', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithMockProvider('anthropic', createMockLanguageModel({
      onCall: (options) => { callOptions = options; },
    }));

    const { status } = await postJson(app, '/v1/messages', {
      model: 'anthropic/test-model',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 100,
      top_k: 42,
    });

    expect(status).toBe(200);
    expect(callOptions?.topK).toBe(42);
  });

  it('rejects schema-accepted unsupported chat params with typed 400', async () => {
    const app = makeAppWithMockProvider('groq');
    const { status, body } = await postJson(app, '/v1/chat/completions', {
      model: 'groq/test-model',
      messages: [{ role: 'user', content: 'hi' }],
      logit_bias: { '50256': -100 },
    });

    expect(status).toBe(400);
    expect(body).toHaveProperty('error.code', 'invalid_request_body');
    expect(body).toHaveProperty('error.param', 'logit_bias');
  });

  it('rejects metadata.user_id on messages with typed 400', async () => {
    const app = makeAppWithMockProvider('anthropic');
    const { status, body } = await postJson(app, '/v1/messages', {
      model: 'anthropic/test-model',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 100,
      metadata: { user_id: 'user-123' },
    });

    expect(status).toBe(400);
    expect(body).toHaveProperty('error.type', 'invalid_request_error');
    expect(body).toHaveProperty('error.param', 'metadata.user_id');
  });

  it('plumbs cached and reasoning usage into OpenAI responses', async () => {
    const app = makeAppWithMockProvider('groq', createMockLanguageModel({
      inputTokenDetails: { cacheReadTokens: 3, cacheWriteTokens: 2 },
      outputTokenDetails: { reasoningTokens: 7 },
    }));

    const { status, body } = await postJson(app, '/v1/chat/completions', {
      model: 'groq/test-model',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty('usage.prompt_tokens_details.cached_tokens', 3);
    expect(body).toHaveProperty('usage.prompt_tokens_details.cache_write_tokens', 2);
    expect(body).toHaveProperty('usage.completion_tokens_details.reasoning_tokens', 7);
  });

  it('plumbs cached usage into Anthropic responses', async () => {
    const app = makeAppWithMockProvider('anthropic', createMockLanguageModel({
      inputTokenDetails: { cacheReadTokens: 3, cacheWriteTokens: 2 },
    }));

    const { status, body } = await postJson(app, '/v1/messages', {
      model: 'anthropic/test-model',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 100,
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty('usage.cache_creation_input_tokens', 2);
    expect(body).toHaveProperty('usage.cache_read_input_tokens', 3);
  });

  it('mock model with tool calls returns tool_calls in response', async () => {
    const model = createMockLanguageModel({
      toolCalls: [{ toolCallId: 'call_123', toolName: 'get_weather', input: { city: 'SF' } }],
    });
    const app = makeAppWithMockProvider('groq', model);
    const { status, body } = await postJson(app, '/v1/chat/completions', {
      model: 'groq/llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'weather in SF' }],
      tools: [{
        type: 'function',
        function: { name: 'get_weather', parameters: { type: 'object', properties: { city: { type: 'string' } } } },
      }],
    });
    expect(status).toBe(200);
    expect(body).toHaveProperty('choices[0].message.tool_calls');
    const toolCalls = (body as any).choices[0].message.tool_calls;
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toHaveProperty('id', 'call_123');
    expect(toolCalls[0]).toHaveProperty('function.name', 'get_weather');
  });

  it('streaming request returns SSE content-type', async () => {
    const app = makeAppWithMockProvider('groq');
    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'groq/test-model',
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
  });

  it('aborts upstream streaming work when the client aborts', async () => {
    let upstreamSignal: AbortSignal | undefined;
    let observedAbort: Promise<void> | undefined;

    const model = {
      ...createMockLanguageModel(),
      doStream: async (options: { abortSignal?: AbortSignal }) => {
        upstreamSignal = options.abortSignal;
        observedAbort = new Promise((resolve) => {
          options.abortSignal?.addEventListener('abort', () => resolve(), { once: true });
        });

        return {
          stream: new ReadableStream<LanguageModelV4StreamPart>({
            start(controller) {
              controller.enqueue({ type: 'text-start', id: 'text-0' } as LanguageModelV4StreamPart);
              controller.enqueue({ type: 'text-delta', id: 'text-0', delta: 'hello' } as LanguageModelV4StreamPart);
            },
          }),
        };
      },
    } as unknown as LanguageModelV4;

    const app = makeAppWithMockProvider('groq', model);
    const controller = new AbortController();
    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'groq/test-model',
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
      }),
      signal: controller.signal,
    });

    expect(res.status).toBe(200);
    const reader = res.body?.getReader();
    await reader?.read();
    controller.abort();

    await expect(observedAbort).resolves.toBeUndefined();
    expect(upstreamSignal?.aborted).toBe(true);
    await reader?.cancel().catch(() => undefined);
  });

  it('returns 401 before first streaming byte for OpenAI-shaped upstream auth errors', async () => {
    const error = Object.assign(new Error('Invalid API key'), { statusCode: 401 });
    const model = {
      ...createMockLanguageModel(),
      doStream: async () => ({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'error', error } as LanguageModelV4StreamPart);
            controller.close();
          },
        }),
      }),
    } as unknown as LanguageModelV4;

    const app = makeAppWithMockProvider('groq', model);
    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'groq/test-model',
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
      }),
    });

    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toContain('application/json');
    await expect(res.json()).resolves.toHaveProperty('error.type', 'authentication_error');
  });

  it('returns 429 before first streaming byte for Anthropic-shaped upstream rate limits', async () => {
    const error = Object.assign(new Error('Rate limit reached'), { statusCode: 429 });
    const model = {
      ...createMockLanguageModel(),
      doStream: async () => ({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'error', error } as LanguageModelV4StreamPart);
            controller.close();
          },
        }),
      }),
    } as unknown as LanguageModelV4;

    const app = makeAppWithMockProvider('anthropic', model);
    const res = await app.request('http://localhost/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'anthropic/test-model',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 100,
        stream: true,
      }),
    });

    expect(res.status).toBe(429);
    expect(res.headers.get('content-type')).toContain('application/json');
    // G27: streaming early-error 429 must carry retry hints like the non-streaming path.
    expect(res.headers.get('retry-after')).toBe('30');
    expect(res.headers.get('x-should-retry')).toBe('true');
    await expect(res.json()).resolves.toHaveProperty('error.type', 'rate_limit_error');
  });

  it('returns 429 with retry headers before first streaming byte on chat completions', async () => {
    const error = Object.assign(new Error('Rate limit reached'), { statusCode: 429 });
    const model = {
      ...createMockLanguageModel(),
      doStream: async () => ({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'error', error } as LanguageModelV4StreamPart);
            controller.close();
          },
        }),
      }),
    } as unknown as LanguageModelV4;

    const app = makeAppWithMockProvider('groq', model);
    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'groq/test-model',
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
      }),
    });

    expect(res.status).toBe(429);
    // G27: streaming early-error 429 must carry retry hints like the non-streaming path.
    expect(res.headers.get('retry-after')).toBe('30');
    expect(res.headers.get('x-should-retry')).toBe('true');
    await expect(res.json()).resolves.toHaveProperty('error.type', 'rate_limit_error');
  });

  it('returns 429 with retry headers before first streaming byte on responses', async () => {
    const error = Object.assign(new Error('Rate limit reached'), { statusCode: 429 });
    const model = {
      ...createMockLanguageModel(),
      doStream: async () => ({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'error', error } as LanguageModelV4StreamPart);
            controller.close();
          },
        }),
      }),
    } as unknown as LanguageModelV4;

    const app = makeAppWithMockProvider('openai', model);
    const res = await app.request('http://localhost/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        input: 'hi',
        stream: true,
      }),
    });

    expect(res.status).toBe(429);
    // G27: streaming early-error 429 must carry retry hints like the non-streaming path.
    expect(res.headers.get('retry-after')).toBe('30');
    expect(res.headers.get('x-should-retry')).toBe('true');
    await expect(res.json()).resolves.toHaveProperty('error.type', 'rate_limit_error');
  });

  it('closes Anthropic content blocks before stream errors and message_stop', async () => {
    const error = Object.assign(new Error('provider failed'), { statusCode: 503 });
    const model = {
      ...createMockLanguageModel(),
      doStream: async () => ({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'text-start', id: 'text-0' } as LanguageModelV4StreamPart);
            controller.enqueue({ type: 'text-delta', id: 'text-0', delta: 'hello' } as LanguageModelV4StreamPart);
            controller.enqueue({ type: 'error', error } as LanguageModelV4StreamPart);
            controller.close();
          },
        }),
      }),
    } as unknown as LanguageModelV4;

    const app = makeAppWithMockProvider('anthropic', model);
    const res = await app.request('http://localhost/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'anthropic/test-model',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 100,
        stream: true,
      }),
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    const eventOrder = [...text.matchAll(/^event: (.+)$/gm)].map((match) => match[1]);
    expect(eventOrder).toEqual([
      'message_start',
      'ping',
      'content_block_start',
      'content_block_delta',
      'content_block_stop',
      'error',
      'message_stop',
    ]);
  });

  it('runs afterError then afterOperation when beforeUpstream throws', async () => {
    const order: string[] = [];
    const error = new Error('blocked by hook');
    const app = makeAppWithMockProvider('groq', undefined, {
      beforeUpstream: [() => {
        order.push('beforeUpstream');
        throw error;
      }],
      afterError: [(args) => {
        order.push(`afterError:${args.failedPhase}:${args.error === error}`);
      }],
      afterOperation: [(args) => {
        order.push(`afterOperation:${args.error === error}`);
      }],
    });

    const { status, body } = await postJson(app, '/v1/chat/completions', {
      model: 'groq/test-model',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(status).toBe(500);
    expect(body).toHaveProperty('error.message', 'blocked by hook');
    expect(order).toEqual([
      'beforeUpstream',
      'afterError:beforeUpstream:true',
      'afterOperation:true',
    ]);
  });

  it('masks production 5xx provider errors and preserves x-request-id', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const app = makeAppWithMockProvider('openai', createMockLanguageModel({
        error: new Error('provider leaked secret sk-provider-internal'),
      }));

      const { status, headers, body } = await postJson(app, '/v1/chat/completions', {
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
      }, { 'x-request-id': 'req-stage-7' });

      expect(status).toBe(500);
      // G103: the gateway mints its own id and does not echo the client value.
      const requestId = headers.get('x-request-id') ?? '';
      expect(requestId).not.toBe('req-stage-7');
      expect(requestId).toMatch(/^req_[A-Za-z0-9-]+$/);
      expect(body).toHaveProperty('error.message', `Internal server error (request_id: ${requestId}).`);
      expect(JSON.stringify(body)).not.toContain('sk-provider-internal');
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('runs all lifecycle hook slots for responses and mutates upstream params', async () => {
    const order: string[] = [];
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithMockProvider('openai', createMockLanguageModel({
      onCall: (options) => { callOptions = options; },
    }), {
      beforeOperation: [() => { order.push('beforeOperation'); }],
      beforeUpstream: [(args) => {
        order.push('beforeUpstream');
        args.params.temperature = 0.4;
      }],
      afterUpstream: [() => { order.push('afterUpstream'); }],
      afterOperation: [() => { order.push('afterOperation'); }],
    });

    const { status, body } = await postJson(app, '/v1/responses', {
      model: 'openai/gpt-4o-mini',
      input: 'hi',
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty('output_text', 'Hello from mock!');
    expect(callOptions?.temperature).toBe(0.4);
    expect(order).toEqual(['beforeOperation', 'beforeUpstream', 'afterUpstream', 'afterOperation']);
  });

  it('short-circuits responses beforeOperation denial before upstream', async () => {
    const beforeUpstream = vi.fn();
    const app = makeAppWithMockProvider('openai', createMockLanguageModel(), {
      beforeOperation: [() => { throw Object.assign(new Error('denied'), { statusCode: 403 }); }],
      beforeUpstream: [beforeUpstream],
    });

    const { status, body } = await postJson(app, '/v1/responses', {
      model: 'openai/gpt-4o-mini',
      input: 'hi',
    });

    expect(status).toBe(500);
    expect(body).toHaveProperty('error.message', 'denied');
    expect(beforeUpstream).not.toHaveBeenCalled();
  });

  it('forwards responses tools/tool_choice/instructions and emits function_call output', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithMockProvider('openai', createMockLanguageModel({
      text: '',
      toolCalls: [{ toolCallId: 'call_1', toolName: 'get_weather', input: { city: 'Paris' } }],
      onCall: (options) => { callOptions = options; },
    }));

    const { status, body } = await postJson(app, '/v1/responses', {
      model: 'openai/gpt-4o-mini',
      input: 'what is the weather',
      instructions: 'You are a weather bot',
      tools: [{ type: 'function', name: 'get_weather', parameters: { type: 'object', properties: { city: { type: 'string' } } } }],
      tool_choice: 'auto',
    });

    expect(status).toBe(200);
    expect(body.output).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'function_call', name: 'get_weather', call_id: 'call_1' }),
    ]));
    expect(callOptions?.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'function', name: 'get_weather' }),
    ]));
    expect(callOptions?.toolChoice).toMatchObject({ type: 'auto' });
    expect(callOptions?.prompt.some((m) => m.role === 'system')).toBe(true);
  });

  it('preserves assistant role across multi-turn array-content input', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithMockProvider('openai', createMockLanguageModel({
      onCall: (options) => { callOptions = options; },
    }));

    const { status } = await postJson(app, '/v1/responses', {
      model: 'openai/gpt-4o-mini',
      input: [
        { role: 'user', content: [{ type: 'input_text', text: 'hi' }] },
        { role: 'assistant', content: [{ type: 'output_text', text: 'hello' }] },
        { role: 'user', content: [{ type: 'input_text', text: 'again' }] },
      ],
    });

    expect(status).toBe(200);
    expect(callOptions?.prompt.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });
});


// ---------------------------------------------------------------------------
// P0-A1 — streaming `afterOperation`/`afterError` fire off the stream's real
// terminal signal (success, mid-stream error, client abort), not at
// HTTP-return time. See `shared/streamLifecycle.ts`.
// ---------------------------------------------------------------------------

describe('gateway integration — streaming lifecycle (afterOperation timing)', () => {
  it('does not fire afterOperation at HTTP-return time, and fires it exactly once with real usage/finishReason once the stream drains', async () => {
    const afterOperationCalls: AfterOperationHookArgs[] = [];
    const model = createDelayedStreamModel({ delayMs: 40, inputTokens: 42, outputTokens: 17, finishReason: 'stop' });
    const app = makeAppWithMockProvider('groq', model, {
      afterOperation: [(args) => { afterOperationCalls.push(args); }],
    });

    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'groq/test-model',
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
      }),
    });

    expect(res.status).toBe(200);
    // The core bug this fix closes: `afterOperation` must NOT have fired yet
    // at the moment the handler returns the streaming Response.
    expect(afterOperationCalls).toHaveLength(0);

    await res.text(); // drains the SSE stream to completion

    expect(afterOperationCalls).toHaveLength(1);
    const [call] = afterOperationCalls;
    expect(call.finishReason).toBe('stop');
    expect(call.usage).toEqual({
      inputTokens: 42,
      outputTokens: 17,
      totalTokens: 59,
      cachedInputTokens: undefined,
      reasoningTokens: undefined,
    });
    // Real duration, not time-to-first-byte: the model delays 40ms before
    // its `finish` chunk, so a TTFB-anchored `durationMs` would be ~0.
    expect(call.durationMs).toBeGreaterThanOrEqual(30);
  });

  it('fires afterError once then afterOperation once (not twice) for a well-behaved mid-stream provider error', async () => {
    const order: string[] = [];
    const afterErrorCalls: AfterErrorHookArgs[] = [];
    const afterOperationCalls: AfterOperationHookArgs[] = [];
    const error = Object.assign(new Error('provider failed'), { statusCode: 503 });
    const model = createMidStreamErrorModel(error);

    const app = makeAppWithMockProvider('groq', model, {
      afterError: [(args) => { order.push('afterError'); afterErrorCalls.push(args); }],
      afterOperation: [(args) => { order.push('afterOperation'); afterOperationCalls.push(args); }],
    });

    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'groq/test-model',
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
      }),
    });

    // The stream already emitted real content before the error, so this is
    // a 200 with an in-band SSE error frame, not a pre-flight JSON error.
    expect(res.status).toBe(200);
    await res.text();

    expect(order).toEqual(['afterError', 'afterOperation']);
    expect(afterErrorCalls).toHaveLength(1);
    expect(afterOperationCalls).toHaveLength(1);
    expect(afterErrorCalls[0].failedPhase).toBe('upstream');
    expect(afterErrorCalls[0].error).toBe(error);
    expect(afterOperationCalls[0].finishReason).toBe('error');
  });

  it('reports failedPhase:upstream when a non-streaming provider call throws', async () => {
    const afterErrorCalls: AfterErrorHookArgs[] = [];
    const error = new Error('provider failed');
    const app = makeAppWithMockProvider('groq', createMockLanguageModel({ error }), {
      afterError: [(args) => { afterErrorCalls.push(args); }],
    });

    const { status } = await postJson(app, '/v1/chat/completions', {
      model: 'groq/test-model',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(status).toBe(500);
    expect(afterErrorCalls).toHaveLength(1);
    expect(afterErrorCalls[0].failedPhase).toBe('upstream');
    expect(afterErrorCalls[0].error).toBe(error);
  });

  it('reports failedPhase:upstream for a mid-stream provider error', async () => {
    const afterErrorCalls: AfterErrorHookArgs[] = [];
    const error = Object.assign(new Error('provider failed'), { statusCode: 503 });
    const app = makeAppWithMockProvider('groq', createMidStreamErrorModel(error), {
      afterError: [(args) => { afterErrorCalls.push(args); }],
    });

    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'groq/test-model',
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
      }),
    });
    await res.text();

    expect(res.status).toBe(200);
    expect(afterErrorCalls).toHaveLength(1);
    expect(afterErrorCalls[0].failedPhase).toBe('upstream');
    expect(afterErrorCalls[0].error).toBe(error);
  });

  it('fires afterOperation exactly once with an abort finishReason on client abort — never afterError — and sets the effective-4xx otel signal', async () => {
    const afterOperationCalls: AfterOperationHookArgs[] = [];
    const afterErrorCalls: AfterErrorHookArgs[] = [];

    const model = {
      ...createMockLanguageModel(),
      doStream: async () => ({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'text-start', id: 'text-0' } as LanguageModelV4StreamPart);
            controller.enqueue({ type: 'text-delta', id: 'text-0', delta: 'hello' } as LanguageModelV4StreamPart);
          },
        }),
      }),
    } as unknown as LanguageModelV4;

    const app = makeAppWithMockProvider('groq', model, {
      afterOperation: [(args) => { afterOperationCalls.push(args); }],
      afterError: [(args) => { afterErrorCalls.push(args); }],
    });

    const controller = new AbortController();
    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'groq/test-model',
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
      }),
      signal: controller.signal,
    });

    expect(res.status).toBe(200);
    const reader = res.body?.getReader();
    await reader?.read();
    controller.abort();
    await reader?.cancel().catch(() => undefined);

    await vi.waitFor(() => {
      expect(afterOperationCalls).toHaveLength(1);
    });

    expect(afterErrorCalls).toHaveLength(0);
    const [call] = afterOperationCalls;
    expect(call.finishReason).toBe('abort');
    expect(call.otel['frogbot.status_code_effective']).toBe(499);
  });

  it('messages: fires afterOperation once with real usage after the stream drains (smoke)', async () => {
    const afterOperationCalls: AfterOperationHookArgs[] = [];
    const model = createDelayedStreamModel({ delayMs: 20, inputTokens: 11, outputTokens: 6 });
    const app = makeAppWithMockProvider('anthropic', model, {
      afterOperation: [(args) => { afterOperationCalls.push(args); }],
    });

    const res = await app.request('http://localhost/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'anthropic/test-model',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 100,
        stream: true,
      }),
    });

    expect(res.status).toBe(200);
    expect(afterOperationCalls).toHaveLength(0);
    await res.text();

    expect(afterOperationCalls).toHaveLength(1);
    expect(afterOperationCalls[0].usage).toEqual({
      inputTokens: 11,
      outputTokens: 6,
      totalTokens: 17,
      cachedInputTokens: undefined,
      reasoningTokens: undefined,
    });
    expect(afterOperationCalls[0].finishReason).toBe('stop');
  });

  it('responses: fires afterOperation once with real usage after the stream drains (smoke)', async () => {
    const afterOperationCalls: AfterOperationHookArgs[] = [];
    const model = createDelayedStreamModel({ delayMs: 20, inputTokens: 9, outputTokens: 3 });
    const app = makeAppWithMockProvider('openai', model, {
      afterOperation: [(args) => { afterOperationCalls.push(args); }],
    });

    const res = await app.request('http://localhost/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        input: 'hi',
        stream: true,
      }),
    });

    expect(res.status).toBe(200);
    expect(afterOperationCalls).toHaveLength(0);
    await res.text();

    expect(afterOperationCalls).toHaveLength(1);
    expect(afterOperationCalls[0].usage).toEqual({
      inputTokens: 9,
      outputTokens: 3,
      totalTokens: 12,
      cachedInputTokens: undefined,
      reasoningTokens: undefined,
    });
    expect(afterOperationCalls[0].finishReason).toBe('stop');
  });

  it('responses: emits a spec-conformant SSE wire shape with monotonic sequence_number', async () => {
    const model = createDelayedStreamModel({ delayMs: 5, text: 'hi', finishReason: 'stop' });
    const app = makeAppWithMockProvider('openai', model);

    const res = await app.request('http://localhost/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-4o-mini', input: 'hi', stream: true }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    const events = body
      .split('\n\n')
      .map((block) => ({
        event: block.match(/^event: (.+)$/m)?.[1],
        data: block.match(/^data: (.+)$/m)?.[1],
      }))
      .filter((entry): entry is { event: string; data: string } => Boolean(entry.event && entry.data) && entry.data !== '[DONE]')
      .map((entry) => ({ event: entry.event, data: JSON.parse(entry.data) }));

    expect(events[0].event).toBe('response.created');
    expect(events[1].event).toBe('response.in_progress');
    expect(events[events.length - 1].event).toBe('response.completed');
    const sequences = events.map((entry) => entry.data.sequence_number);
    expect(sequences).toEqual(sequences.map((_, index) => index));
  });

  it('responses: terminates streaming with response.incomplete on a length finish reason', async () => {
    const model = createDelayedStreamModel({ delayMs: 5, text: 'hi', finishReason: 'length' });
    const app = makeAppWithMockProvider('openai', model);

    const res = await app.request('http://localhost/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-4o-mini', input: 'hi', stream: true }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    const terminal = body
      .split('\n\n')
      .map((block) => block.match(/^event: (.+)$/m)?.[1])
      .filter((event): event is string => Boolean(event))
      .at(-1);
    expect(terminal).toBe('response.incomplete');
  });

  it('responses: returns 401 before first streaming byte for upstream auth errors', async () => {
    const error = Object.assign(new Error('Invalid API key'), { statusCode: 401 });
    const model = {
      ...createMockLanguageModel(),
      doStream: async () => ({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'error', error } as LanguageModelV4StreamPart);
            controller.close();
          },
        }),
      }),
    } as unknown as LanguageModelV4;

    const app = makeAppWithMockProvider('openai', model);
    const res = await app.request('http://localhost/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        input: 'hi',
        stream: true,
      }),
    });

    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toContain('application/json');
    await expect(res.json()).resolves.toHaveProperty('error.type', 'authentication_error');
  });
});

describe('gateway integration — P1-C7 warnings parity', () => {
  const warning = { type: 'other' as const, message: 'careful' };

  it('chatCompletions non-streaming forwards result.warnings to afterUpstream', async () => {
    const afterUpstream = vi.fn();
    const model = createMockLanguageModel({ warnings: [warning] });
    const app = makeAppWithMockProvider('openai', model, { afterUpstream: [afterUpstream] });

    const { status } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(status).toBe(200);
    expect(afterUpstream).toHaveBeenCalledWith(expect.objectContaining({ warnings: [warning] }));
  });

  it('messages non-streaming forwards result.warnings to afterUpstream', async () => {
    const afterUpstream = vi.fn();
    const model = createMockLanguageModel({ warnings: [warning] });
    const app = makeAppWithMockProvider('anthropic', model, { afterUpstream: [afterUpstream] });

    const { status } = await postJson(app, '/v1/messages', {
      model: 'anthropic/claude-3-5-sonnet',
      max_tokens: 16,
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(status).toBe(200);
    expect(afterUpstream).toHaveBeenCalledWith(expect.objectContaining({ warnings: [warning] }));
  });

  it('streaming fires afterUpstream with warnings from the onFinish event before afterOperation', async () => {
    const order: string[] = [];
    const afterUpstream = vi.fn(() => { order.push('afterUpstream'); });
    const afterOperation = vi.fn(() => { order.push('afterOperation'); });
    const model = createMockLanguageModel({ warnings: [warning] });
    const app = makeAppWithMockProvider('openai', model, {
      afterUpstream: [afterUpstream],
      afterOperation: [afterOperation],
    });

    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
      }),
    });

    expect(res.status).toBe(200);
    await res.text();

    expect(afterUpstream).toHaveBeenCalledWith(expect.objectContaining({ warnings: [warning] }));
    expect(order).toEqual(['afterUpstream', 'afterOperation']);
  });
});

describe('gateway integration — M3 embeddings and images', () => {
  it('embeddings resolves OpenAI provider and returns float vectors', async () => {
    const app = makeAppWithMockModalityProvider('openai', {
      embeddingModel: createMockEmbeddingModel({ embeddings: [[0.1, 0.2, 0.3]], tokens: 11 }),
    });

    const { status, body } = await postJson(app, '/v1/embeddings', {
      model: 'openai/text-embedding-3-small',
      input: 'hello',
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty('data[0].embedding', [0.1, 0.2, 0.3]);
    expect(body).toHaveProperty('usage.prompt_tokens', 11);
  });

  it('embeddings resolves cross-provider arrays and forwards provider options', async () => {
    let callOptions: EmbeddingModelV4CallOptions | undefined;
    const app = makeAppWithMockModalityProvider('voyage', {
      embeddingModel: createMockEmbeddingModel({ onCall: (options) => { callOptions = options; } }),
    });

    const { status, body } = await postJson(app, '/v1/embeddings', {
      model: 'voyage/voyage-3-large',
      input: ['one', 'two'],
      dimensions: 2,
      encoding_format: 'base64',
      user: 'user-1',
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty('data[0].embedding', 'AACAPgAAAD8=');
    expect(body).toHaveProperty('data[1].embedding', 'AACgPwAAwD8=');
    expect(callOptions?.values).toEqual(['one', 'two']);
    // `dimensions` is re-homed to voyage's own namespace; `user` is OpenAI-only,
    // so it is left in the neutral namespace where voyage never reads it.
    expect(callOptions?.providerOptions).toEqual({
      voyage: { outputDimension: 2 },
      unknown: { user: 'user-1' },
    });
  });

  it('embeddings maps upstream errors to OpenAI-shaped errors', async () => {
    const app = makeAppWithMockModalityProvider('cohere', {
      embeddingModel: createMockEmbeddingModel({ error: new Error('upstream embedding error') }),
    });

    const { status, body } = await postJson(app, '/v1/embeddings', {
      model: 'cohere/embed-english-v3.0',
      input: ['one', 'two'],
    });

    expect(status).toBe(500);
    expect(body).toHaveProperty('error.type', 'server_error');
  });

  it('images resolves OpenAI provider and returns n generated images', async () => {
    let callOptions: ImageModelV4CallOptions | undefined;
    const app = makeAppWithMockModalityProvider('openai', {
      imageModel: createMockImageModel({ onCall: (options) => { callOptions = options; } }),
    });

    const { status, body } = await postJson(app, '/v1/images/generations', {
      model: 'openai/dall-e-3',
      prompt: 'a small frog robot',
      n: 2,
      size: '1024x1024',
      response_format: 'b64_json',
    });

    expect(status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body).toHaveProperty('data[0].b64_json', 'aW1hZ2UtMA==');
    expect(callOptions).toMatchObject({ prompt: 'a small frog robot', size: '1024x1024' });
  });

  it('images resolves cross-provider models', async () => {
    const app = makeAppWithMockModalityProvider('fal', {
      imageModel: createMockImageModel({ images: ['ZmFsLWltYWdl'] }),
    });

    const { status, body } = await postJson(app, '/v1/images/generations', {
      model: 'fal/imagen4/preview',
      prompt: 'minimal icon',
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty('data[0].b64_json', 'ZmFsLWltYWdl');
  });

  it('images rejects url response_format and maps upstream errors', async () => {
    const app = makeAppWithMockModalityProvider('replicate', {
      imageModel: createMockImageModel({ error: new Error('upstream image error') }),
    });

    const unsupported = await postJson(app, '/v1/images/generations', {
      model: 'replicate/black-forest-labs/flux-schnell',
      prompt: 'frog',
      response_format: 'url',
    });
    expect(unsupported.status).toBe(400);
    expect(unsupported.body).toHaveProperty('error.param', 'response_format');

    const refused = await postJson(app, '/v1/images/generations', {
      model: 'replicate/black-forest-labs/flux-schnell',
      prompt: 'blocked prompt',
    });
    expect(refused.status).toBe(500);
    expect(refused.body).toHaveProperty('error.type', 'server_error');
  });
});

describe('gateway integration — M4 video, speech, transcription, and rerank', () => {
  it('videos returns generated base64 data after delayed provider response', async () => {
    const model = {
      specificationVersion: 'v4',
      provider: 'mock.video',
      modelId: 'wan-2.5',
      maxVideosPerCall: 1,
      doGenerate: async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return {
          videos: [{ type: 'base64', data: 'dmlkZW8=', mediaType: 'video/mp4' }],
          warnings: [],
          providerMetadata: {},
          response: { timestamp: new Date(0), modelId: 'wan-2.5', headers: {} },
        };
      },
    };
    const app = createApp({
      registry: {
        replicate: { videoModel: () => model },
      } as unknown as ProviderRegistry,
    });

    const { status, body } = await postJson(app, '/v1/videos/generations', {
      model: 'replicate/wan-2.5',
      prompt: 'frog robot',
      response_format: 'b64_json',
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty('data[0].b64_json', 'dmlkZW8=');
  });

  it('speech returns buffered audio bytes with content type', async () => {
    const model = {
      specificationVersion: 'v4',
      provider: 'mock.speech',
      modelId: 'tts-1',
      doGenerate: async () => ({
        audio: new Uint8Array([1, 2, 3]),
        warnings: [],
        response: { id: 'speech_1', timestamp: new Date(0), modelId: 'tts-1' },
      }),
    };
    const app = createApp({
      registry: {
        openai: { speechModel: () => model },
      } as unknown as ProviderRegistry,
    });

    const res = await app.request('/v1/audio/speech', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai/tts-1', input: 'hi', voice: 'alloy', response_format: 'wav' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/wav');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('transcriptions accepts multipart upload through Hono fetch', async () => {
    const model = {
      specificationVersion: 'v4',
      provider: 'mock.transcription',
      modelId: 'whisper-1',
      doGenerate: async () => ({
        text: 'frog robot',
        segments: [{ text: 'frog robot', startSecond: 0, endSecond: 1 }],
        language: 'en',
        durationInSeconds: 1,
        warnings: [],
        response: { id: 'transcription_1', timestamp: new Date(0), modelId: 'whisper-1' },
      }),
    };
    const app = createApp({
      registry: {
        openai: { transcriptionModel: () => model },
      } as unknown as ProviderRegistry,
    });
    const form = new FormData();
    form.set('model', 'openai/whisper-1');
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'tiny.wav', { type: 'audio/wav' }));
    form.set('response_format', 'verbose_json');

    const res = await app.request('/v1/audio/transcriptions', { method: 'POST', body: form });

    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty('segments[0].text', 'frog robot');
  });

  it('transcriptions honors GatewayConfig maxBodyBytes through app.fetch', async () => {
    const gateway = createGateway({
      providers: { openai: { apiKey: 'sk-test-int' } },
      maxBodyBytes: 2,
    });

    const res = await gateway.handler(new Request('http://localhost/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'content-length': '3' },
    }));

    expect(res.status).toBe(413);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty('error.code', 'request_entity_too_large');
    expect(body).toHaveProperty('error.param', 'content-length');
  });

  it('images propagates AI SDK warnings through hooks and app.fetch headers', async () => {
    const warning = { type: 'other' as const, message: 'integration warning' };
    const afterUpstream = vi.fn();
    const model = createMockImageModel({ images: ['aW1hZ2U='], warnings: [warning] });
    const app = createApp({
      registry: { replicate: { imageModel: () => model } } as unknown as ProviderRegistry,
      hooks: { afterUpstream: [afterUpstream] },
    });

    const res = await app.fetch(new Request('http://localhost/v1/images/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'replicate/black-forest-labs/flux-schnell',
        prompt: 'frog',
        response_format: 'b64_json',
      }),
    }));

    expect(res.status).toBe(200);
    expect(JSON.parse(res.headers.get('x-gateway-warnings') ?? '[]')).toEqual([warning]);
    expect(afterUpstream).toHaveBeenCalledWith(expect.objectContaining({ warnings: [warning] }));
  });

  it('rerank returns scored documents', async () => {
    const model = {
      specificationVersion: 'v4',
      provider: 'mock.rerank',
      modelId: 'rerank-v3.5',
      doRerank: async () => ({
        ranking: [{ index: 1, relevanceScore: 0.9 }, { index: 0, relevanceScore: 0.4 }],
        warnings: [],
        response: { id: 'rerank_1' },
      }),
    };
    const app = createApp({
      registry: {
        cohere: { rerankingModel: () => model },
      } as unknown as ProviderRegistry,
    });

    const { status, body } = await postJson(app, '/v1/rerank', {
      model: 'cohere/rerank-v3.5',
      query: 'frog',
      documents: ['robot', 'frog robot'],
      return_documents: true,
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty('results[0].document', { text: 'frog robot' });
  });
});

// ---------------------------------------------------------------------------
// M2 Provider sprawl — credential validation paths
// ---------------------------------------------------------------------------

describe('gateway integration — credential validation', () => {
  it('unconfigured groq returns 404 for groq model', async () => {
    const app = createApp({
      registry: buildProviderRegistry({ openai: { apiKey: 'sk-test' } }),
    });
    const { status, body } = await postJson(app, '/v1/chat/completions', {
      model: 'groq/llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(status).toBe(404);
    expect(body).toHaveProperty('error.code', 'provider_not_configured');
  });

  it('unconfigured bedrock returns 404', async () => {
    const app = createApp({
      registry: buildProviderRegistry({ openai: { apiKey: 'sk-test' } }),
    });
    const { status, body } = await postJson(app, '/v1/chat/completions', {
      model: 'amazon-bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(status).toBe(404);
    expect(body).toHaveProperty('error.code', 'provider_not_configured');
  });

  it('completely unknown provider returns 404', async () => {
    const app = createApp({
      registry: buildProviderRegistry({ openai: { apiKey: 'sk-test' } }),
    });
    const { status, body } = await postJson(app, '/v1/chat/completions', {
      model: 'nonexistent-provider/some-model',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(status).toBe(404);
    expect(body).toHaveProperty('error.code', 'model_not_found');
  });

  it('multiple providers configured — correct one is resolved', async () => {
    const registry = {
      openai: { languageModel: () => createMockLanguageModel({ text: 'from openai' }) },
      groq: { languageModel: () => createMockLanguageModel({ text: 'from groq' }) },
    } as unknown as ProviderRegistry;

    const app = createApp({ registry });
    const { status: groqStatus, body: groqBody } = await postJson(app, '/v1/chat/completions', {
      model: 'groq/llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(groqStatus).toBe(200);
    expect(groqBody).toHaveProperty('choices[0].message.content', 'from groq');

    const { status: openaiStatus, body: openaiBody } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(openaiStatus).toBe(200);
    expect(openaiBody).toHaveProperty('choices[0].message.content', 'from openai');
  });
});
