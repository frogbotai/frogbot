// Review 056 P0 triage — reproduction tests for G1–G4 from
// dev/plans/frogbot_gateway/056_full_gateway_review/00_SUMMARY.md §3.
//
// Each test asserts the CORRECT (compliant) behavior at the composed-app seam.
// Confirmed findings are wrapped as `it.fails(...)` so the suite stays green;
// flip to `it()` when the corresponding fix lands.

import { describe, expect, it } from 'vitest';
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
} from '@ai-sdk/provider';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';

/**
 * Builds an error that passes `APICallError.isInstance()` at runtime without
 * importing `@ai-sdk/provider` as a value (it is a gateway-package dep, not
 * resolvable from the root test workspace). The AI SDK identifies its error
 * classes via `Symbol.for` markers (ai-sdk-error.ts `hasMarker`), so tagging
 * a plain Error with the markers is behaviorally identical for the SDK's
 * retry loop and the gateway's envelope translators.
 */
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

/**
 * Recording mock LanguageModelV4 — captures the exact callOptions the AI SDK
 * hands to `doGenerate`/`doStream` so tests can assert what actually reached
 * the (mocked) upstream. Mirrors `createMockLanguageModel` in int.spec.ts.
 */
function createRecordingModel(opts?: {
  text?: string;
  error?: unknown;
  onCall?: (options: LanguageModelV4CallOptions) => void;
}): LanguageModelV4 {
  const { text = 'Hello from mock!', error, onCall } = opts ?? {};
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
      onCall?.(options);
      if (error) throw error;
      return {
        content: [{ type: 'text' as const, text }],
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
    doStream: async (options: LanguageModelV4CallOptions) => {
      onCall?.(options);
      if (error) throw error;
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] });
            controller.enqueue({ type: 'text-start', id: 'text-0' });
            controller.enqueue({ type: 'text-delta', id: 'text-0', delta: text });
            controller.enqueue({ type: 'text-end', id: 'text-0' });
            controller.enqueue({ type: 'finish', finishReason: 'stop', usage });
            controller.close();
          },
        }),
      };
    },
  };
}

function makeAppWithModel(providerName: string, model: LanguageModelV4) {
  const fakeProvider = { languageModel: () => model };
  const registry = { [providerName]: fakeProvider } as unknown as ProviderRegistry;
  return createApp({ registry });
}

// ---------------------------------------------------------------------------
// G1 (OC1) — /v1/chat/completions `response_format` must be forwarded to the
// AI SDK as `responseFormat` ({ type: 'json', schema? }); today it is accepted
// by the schema and silently dropped.
// ---------------------------------------------------------------------------

// G1
describe('chat response_format forwarded upstream', () => {
  it('forwards response_format {type: json_object} as responseFormat {type: json}', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    // Mock returns valid JSON text: generateText with `output` set eagerly
    // parses the final text (ai generate-text.ts parseCompleteOutput) and a
    // non-JSON reply would fail the request before the assertion lands.
    const app = makeAppWithModel('openai', createRecordingModel({
      text: '{"ok":true}',
      onCall: (options) => { callOptions = options; },
    }));

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
    const app = makeAppWithModel('openai', createRecordingModel({
      text: '{"city":"Paris"}',
      onCall: (options) => { callOptions = options; },
    }));

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
    expect(callOptions?.responseFormat).toEqual(expect.objectContaining({
      type: 'json',
      schema: expect.objectContaining({ type: 'object' }),
    }));
  });
});

// ---------------------------------------------------------------------------
// G2 (AM1) — /v1/messages `thinking` must map to
// providerOptions.anthropic.thinking = { type: 'enabled', budgetTokens }
// (AI SDK anthropic-language-model-options.ts); today it is silently dropped.
// ---------------------------------------------------------------------------

// G2
describe('messages thinking forwarded upstream', () => {
  it('maps thinking {type: enabled, budget_tokens} to providerOptions.anthropic.thinking.budgetTokens', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel('anthropic', createRecordingModel({
      onCall: (options) => { callOptions = options; },
    }));

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
});

// ---------------------------------------------------------------------------
// G3 (RS1) — /v1/responses must accept `function_call` /
// `function_call_output` input items (tool round trip); today the schema only
// accepts role-bearing messages and 400s the whole request.
// ---------------------------------------------------------------------------

// G3
describe('responses tool-call round trip', () => {
  it('accepts function_call + function_call_output input items and delivers the tool result upstream', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel('openai', createRecordingModel({
      onCall: (options) => { callOptions = options; },
    }));

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
      tools: [{
        type: 'function',
        name: 'get_weather',
        parameters: { type: 'object', properties: { city: { type: 'string' } } },
      }],
    });

    expect(status, `expected 200, got ${status}: ${JSON.stringify(body)}`).toBe(200);
    // The tool result must reach the model as a tool-role message.
    const toolMessage = callOptions?.prompt.find((m) => m.role === 'tool');
    expect(toolMessage).toBeDefined();
    expect(JSON.stringify(toolMessage)).toContain('call_1');
  });
});

// ---------------------------------------------------------------------------
// G4 (HE1) — AI SDK `RetryError` (thrown after internal retries of a
// retryable upstream 429 exhaust) must unwrap to a 429 rate_limit_error
// envelope with retry headers; today it hits the catch-all → generic 500.
// ---------------------------------------------------------------------------

// G4
describe('RetryError unwraps to upstream 429 envelope', () => {
  // G4 / HE1 — fixed: envelope.ts + normalizeAiSdkError.ts now unwrap
  // RetryError to its lastError before classifying. See 056_full_gateway_review.
  it('returns 429 rate_limit_error with retry headers when upstream 429s exhaust SDK retries', async () => {
    // Always-throwing retryable 429. `retry-after-ms: 0` keeps the SDK's
    // internal retry delays at ~0 so the retries exhaust immediately and
    // generateText throws RetryError (retry-with-exponential-backoff.ts).
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
