// Responses P2 wire findings — G70–G75
//
// G70: CONFIRMED — No JSON notFound handler; unimplemented responses sub-routes return plain-text
// G71: REJECTED — Stream error event already has correct nested shape
// G72: CONFIRMED — Post-peek catastrophic errors (toSseStream toError path) emit bare data: frame
// G73: CONFIRMED — response.completed usage drops input_tokens_details / output_tokens_details
// G74: CONFIRMED — Reasoning deltas duplicated into both summary and content parts
// G75: FIXED — include[] forwarded and reasoning encrypted_content now surfaced on output items

import { describe, expect, it } from 'vitest';
import type {
  LanguageModelV4,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeApp(mockModel: LanguageModelV4) {
  const fakeProvider = { languageModel: () => mockModel };
  const registry = { openai: fakeProvider } as unknown as ProviderRegistry;
  return createApp({ registry });
}

function makeBaseModel() {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    defaultObjectGenerationMode: undefined,
    get supportedUrls() { return Promise.resolve({}); },
    doGenerate: () => Promise.resolve({
      content: [{ type: 'text', text: 'hi' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: { inputTokens: { total: 1, noCache: 1 }, outputTokens: { total: 1, text: 1 } },
      warnings: [],
      response: { id: 'r1', modelId: 'mock-model', timestamp: new Date('2026-01-01T00:00:00Z') },
    }),
    doStream: () => Promise.resolve({ stream: new ReadableStream() }),
  } as unknown as LanguageModelV4;
}

// ---------------------------------------------------------------------------
// G70 — Plain-text Hono 404 on unimplemented responses sub-routes
//
// The gateway only registers POST /v1/responses. GET /v1/responses/:id,
// DELETE /v1/responses/:id, GET /v1/responses/:id/cancel and any unknown
// route all fall through to Hono's default plain-text "Not Found" handler.
// A conformant gateway should return a JSON error envelope for all 404s.
// ---------------------------------------------------------------------------

describe('G70 — responses sub-routes and global notFound return JSON error envelope', () => {
  it(
    // G70: GET /v1/responses/:id returns a JSON error envelope (not plain-text)
    'GET /v1/responses/:id returns JSON error envelope',
    async () => {
      const app = makeApp(makeBaseModel());
      const res = await app.request('http://localhost/v1/responses/resp_123', {
        method: 'GET',
      });
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(res.status).toBe(404);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty('error');
    },
  );

  it(
    // G70: DELETE /v1/responses/:id returns a JSON error envelope (not plain-text)
    'DELETE /v1/responses/:id returns JSON error envelope',
    async () => {
      const app = makeApp(makeBaseModel());
      const res = await app.request('http://localhost/v1/responses/resp_123', {
        method: 'DELETE',
      });
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(res.status).toBe(404);
    },
  );

  it(
    // G70: unknown routes return a JSON error envelope (not plain-text)
    'GET /v1/nonexistent returns JSON error envelope',
    async () => {
      const app = makeApp(makeBaseModel());
      const res = await app.request('http://localhost/v1/nonexistent', {
        method: 'GET',
      });
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(res.status).toBe(404);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty('error');
    },
  );
});

// ---------------------------------------------------------------------------
// G71 — Stream error event shape (REJECTED — shape is already correct)
//
// The responses stream translator emits the error part as:
//   event: error
//   data: { type: "error", error: { message, type, code }, sequence_number: N }
//
// This IS the nested `data.error.*` shape expected by the Responses API spec.
// ---------------------------------------------------------------------------

describe('G71 — responses streaming error event has correct nested shape (REJECTED)', () => {
  it('stream error event carries nested data.error object', async () => {
    const error = Object.assign(new Error('upstream failed'), { statusCode: 503 });
    const model = {
      ...makeBaseModel(),
      doStream: () => Promise.resolve({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            // Emit text first so we commit to HTTP 200
            controller.enqueue({ type: 'text-start', id: 'text-0' } as LanguageModelV4StreamPart);
            controller.enqueue({ type: 'text-delta', id: 'text-0', delta: 'hello' } as LanguageModelV4StreamPart);
            controller.enqueue({ type: 'error', error } as LanguageModelV4StreamPart);
            controller.close();
          },
        }),
      }),
    } as unknown as LanguageModelV4;

    const app = makeApp(model);
    const res = await app.request('http://localhost/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-4o', input: 'hi', stream: true }),
    });

    expect(res.status).toBe(200);
    const text = await res.text();

    // Find the error event block
    const errorBlock = text
      .split('\n\n')
      .find((block) => block.includes('event: error'));
    expect(errorBlock).toBeDefined();

    const dataLine = errorBlock!.match(/^data: (.+)$/m)?.[1];
    expect(dataLine).toBeDefined();
    const data = JSON.parse(dataLine!) as Record<string, unknown>;

    // Nested shape: data.error.message, data.error.type, data.error.code
    expect(data).toHaveProperty('error');
    expect(data).toHaveProperty('error.message');
    expect(typeof (data.error as Record<string, unknown>).message).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// G72 — Post-peek catastrophic errors emit bare data: frame
//
// After the peek phase the handler passes `toError` to toSseStream which
// maps stream exceptions to:
//   [{ kind: 'data', data: toOpenAIErrorResponse(err, { requestId }).body }]
//
// This emits a bare `data: {...error envelope...}` frame (no `event:` line).
// A conformant responses stream should emit `event: error` + `event: response.failed`.
//
// To trigger the `toError` path: inject a model whose stream throws a JS
// exception (not just enqueues an error part) after the preamble is sent.
// ---------------------------------------------------------------------------

describe('G72 — post-peek catastrophic stream errors emit bare data: frame (not event:error)', () => {
  it(
    'catastrophic post-peek error emits event:error frame, not a bare data: frame',
    async () => {
      // Inject a model whose stream throws a JS exception mid-flight
      // (not an SSE-level error part — that is handled by the transformer).
      // This exercises the toSseStream `toError` callback path.
      const model = {
        ...makeBaseModel(),
        doStream: () => Promise.resolve({
          stream: new ReadableStream<LanguageModelV4StreamPart>({
            start(controller) {
              // Emit enough to pass the preamble (peek sees text)
              controller.enqueue({ type: 'text-start', id: 'text-0' } as LanguageModelV4StreamPart);
              controller.enqueue({ type: 'text-delta', id: 'text-0', delta: 'hello' } as LanguageModelV4StreamPart);
              // Then close normally — the catastrophic throw comes from the
              // transform phase itself via a TransformStream that errors.
              // Simulate via stream that throws on pull:
              controller.close();
            },
          }).pipeThrough(new TransformStream({
            transform(_chunk, controller) {
              controller.enqueue(_chunk);
            },
            flush(controller) {
              controller.error(new Error('catastrophic transform error'));
            },
          })),
        }),
      } as unknown as LanguageModelV4;

      const app = makeApp(model);
      const res = await app.request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'openai/gpt-4o', input: 'hi', stream: true }),
      });

      expect(res.status).toBe(200);
      const text = await res.text();
      const blocks = text.split('\n\n').filter(Boolean);

      // Every non-comment block with JSON data must have an explicit event: line.
      // Filter first, then assert — avoids conditional expect.
      const dataOnlyBlocks = blocks.filter(
        (block) =>
          !block.startsWith(':') &&
          !block.includes('data: [DONE]') &&
          Boolean(block.match(/^data: \{/m)) &&
          !block.match(/^event: /m),
      );
      expect(dataOnlyBlocks).toHaveLength(0);
    },
  );
});

// ---------------------------------------------------------------------------
// G73 — response.completed usage drops input_tokens_details / output_tokens_details
//
// The streaming translator records usage in state.usage as:
//   { input_tokens, output_tokens, total_tokens }
// but never includes input_tokens_details (cached_tokens) or
// output_tokens_details (reasoning_tokens) that the AI SDK emits via
// finish-step's usage.inputTokenDetails / outputTokenDetails.
// ---------------------------------------------------------------------------

describe('G73 — response.completed usage includes token details', () => {
  it(
    'response.completed carries input_tokens_details.cached_tokens and output_tokens_details.reasoning_tokens',
    async () => {
      const model = {
        ...makeBaseModel(),
        doStream: () => Promise.resolve({
          stream: new ReadableStream<LanguageModelV4StreamPart>({
            start(controller) {
              controller.enqueue({ type: 'stream-start', warnings: [] } as LanguageModelV4StreamPart);
              controller.enqueue({ type: 'text-start', id: 'text-0' } as LanguageModelV4StreamPart);
              controller.enqueue({ type: 'text-delta', id: 'text-0', delta: 'hi' } as LanguageModelV4StreamPart);
              controller.enqueue({ type: 'text-end', id: 'text-0' } as LanguageModelV4StreamPart);
              controller.enqueue({
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage: {
                  inputTokens: {
                    total: 20,
                    noCache: 10,
                    cacheRead: 8,
                    cacheWrite: 2,
                  },
                  outputTokens: {
                    total: 15,
                    text: 10,
                    reasoning: 5,
                  },
                },
              } as LanguageModelV4StreamPart);
              controller.close();
            },
          }),
        }),
      } as unknown as LanguageModelV4;

      const app = makeApp(model);
      const res = await app.request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'openai/gpt-4o', input: 'hi', stream: true }),
      });

      expect(res.status).toBe(200);
      const text = await res.text();

      const completedBlock = text
        .split('\n\n')
        .find((block) => block.includes('event: response.completed'));
      expect(completedBlock).toBeDefined();

      const dataLine = completedBlock!.match(/^data: (.+)$/m)?.[1];
      const data = JSON.parse(dataLine!) as { response?: { usage?: Record<string, unknown> } };
      const usage = data.response?.usage;
      expect(usage).toBeDefined();

      expect(usage).toHaveProperty('input_tokens_details.cached_tokens', 8);
      expect(usage).toHaveProperty('output_tokens_details.reasoning_tokens', 5);
    },
  );
});

// ---------------------------------------------------------------------------
// G74 — Reasoning deltas duplicated into both summary and content parts
//
// When a reasoning-delta fires (stream.ts:179-196), the translator emits
// TWO events for each delta:
//   response.reasoning_summary_text.delta  (summary track)
//   response.reasoning_text.delta           (content track)
//
// The OpenAI Responses API spec only expects ONE of these per reasoning delta
// depending on the model variant. Emitting both causes double-written text.
// ---------------------------------------------------------------------------

describe('G74 — reasoning delta duplication', () => {
  it(
    'reasoning-delta emits exactly one delta event type (not both summary and content)',
    async () => {
      const model = {
        ...makeBaseModel(),
        doStream: () => Promise.resolve({
          stream: new ReadableStream<LanguageModelV4StreamPart>({
            start(controller) {
              controller.enqueue({ type: 'stream-start', warnings: [] } as LanguageModelV4StreamPart);
              controller.enqueue({ type: 'reasoning-start' } as LanguageModelV4StreamPart);
              controller.enqueue({ type: 'reasoning-delta', delta: 'thinking...' } as LanguageModelV4StreamPart);
              controller.enqueue({ type: 'reasoning-end' } as LanguageModelV4StreamPart);
              controller.enqueue({
                type: 'finish',
                finishReason: 'stop',
                usage: {
                  inputTokens: { total: 5, noCache: 5 },
                  outputTokens: { total: 3, text: 0, reasoning: 3 },
                },
              } as LanguageModelV4StreamPart);
              controller.close();
            },
          }),
        }),
      } as unknown as LanguageModelV4;

      const app = makeApp(model);
      const res = await app.request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'openai/gpt-4o', input: 'think', stream: true }),
      });

      expect(res.status).toBe(200);
      const text = await res.text();
      const events = [...text.matchAll(/^event: (.+)$/gm)].map((m) => m[1]);

      const summaryDeltas = events.filter((e) => e === 'response.reasoning_summary_text.delta');
      const contentDeltas = events.filter((e) => e === 'response.reasoning_text.delta');

      // G74: only the summary track is emitted per reasoning-delta.
      const totalDeltaEvents = summaryDeltas.length + contentDeltas.length;
      expect(totalDeltaEvents).toBe(1);
    },
  );
});

// ---------------------------------------------------------------------------
// G49 — streaming responses SSE must carry x-request-id, matching the
// non-streaming path. createSseResponse now merges the handler's requestId into
// the SSE response headers.
// ---------------------------------------------------------------------------

describe('G49 — x-request-id present on streaming responses SSE response', () => {
  // G49 — createSseResponse merges requestId into SSE headers; streaming parity with non-streaming.
  it('streaming responses response includes x-request-id header', async () => {
    const model = {
      ...makeBaseModel(),
      doStream: () => Promise.resolve({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'text-start', id: 'text-0' } as LanguageModelV4StreamPart);
            controller.enqueue({ type: 'text-delta', id: 'text-0', delta: 'hi' } as LanguageModelV4StreamPart);
            controller.close();
          },
        }),
      }),
    } as unknown as LanguageModelV4;

    const app = makeApp(model);
    const res = await app.request('http://localhost/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-4o', input: 'hi', stream: true }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id'), 'streaming responses SSE response missing x-request-id').not.toBeNull();
    await res.text();
  });
});

// ---------------------------------------------------------------------------
// G51 (S17 ← S2/G5) — composed-wire terminal-frame count on a successful
// responses stream. The Responses wire terminates with `response.completed`
// and this route sets appendDone:false, so the OpenAI-chat-only `data: [DONE]`
// sentinel must NEVER appear here. Guards the S2/G5 class of duplicate/leaked
// terminal sentinels for /v1/responses.
// ---------------------------------------------------------------------------

describe('G51 — responses stream terminal-frame count', () => {
  // G51 — exactly one response.completed, zero [DONE] on a successful stream.
  // finishReason must use the real `{ unified, raw }` shape — a bare string
  // normalizes to `unknown` → response.failed (see translators/stream.ts
  // mapFinishReason), which would mask the terminal-frame assertion.
  it('terminates with exactly one response.completed and no [DONE] sentinel', async () => {
    const model = {
      ...makeBaseModel(),
      doStream: () => Promise.resolve({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'text-start', id: 'text-0' } as LanguageModelV4StreamPart);
            controller.enqueue({ type: 'text-delta', id: 'text-0', delta: 'hi' } as LanguageModelV4StreamPart);
            controller.enqueue({ type: 'text-end', id: 'text-0' } as LanguageModelV4StreamPart);
            controller.enqueue({
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: { inputTokens: { total: 5, noCache: 5 }, outputTokens: { total: 4, text: 4 } },
            } as LanguageModelV4StreamPart);
            controller.close();
          },
        }),
      }),
    } as unknown as LanguageModelV4;

    const app = makeApp(model);
    const res = await app.request('http://localhost/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-4o', input: 'hi', stream: true }),
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    const completedEvents = [...text.matchAll(/^event: (.+)$/gm)]
      .map((m) => m[1])
      .filter((e) => e === 'response.completed');
    expect(completedEvents, 'responses stream must terminate with exactly one response.completed').toHaveLength(1);
    const doneCount = (text.match(/^data: \[DONE\]$/gm) ?? []).length;
    expect(doneCount, 'responses wire must not carry the OpenAI-chat-only [DONE] sentinel').toBe(0);
  });
});

// ---------------------------------------------------------------------------
// G75 — include[] forwarded but requested extras never surfaced
//
// A client requesting include: ["reasoning.encrypted_content"] (the ZDR
// stateless replay pattern) gets encrypted reasoning tokens from OpenAI. The
// AI SDK surfaces these via providerMetadata.openai.reasoningEncryptedContent.
// The gateway must emit them as `encrypted_content` on the reasoning output
// item in both the non-streaming and streaming paths so the client can replay
// them in the next turn.
// ---------------------------------------------------------------------------

describe('G75 — reasoning items surface encrypted_content', () => {
  it('non-streaming reasoning item carries encrypted_content from providerMetadata', async () => {
    const model = {
      ...makeBaseModel(),
      doGenerate: () => Promise.resolve({
        content: [
          {
            type: 'reasoning',
            text: 'thinking',
            providerMetadata: { openai: { itemId: 'rs_1', reasoningEncryptedContent: 'enc_abc' } },
          },
          { type: 'text', text: 'hi' },
        ],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: { inputTokens: { total: 1, noCache: 1 }, outputTokens: { total: 1, text: 1 } },
        warnings: [],
        response: { id: 'r1', modelId: 'mock-model', timestamp: new Date('2026-01-01T00:00:00Z') },
      }),
    } as unknown as LanguageModelV4;

    const app = makeApp(model);
    const res = await app.request('http://localhost/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-5',
        input: 'think',
        include: ['reasoning.encrypted_content'],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { output: Array<Record<string, unknown>> };
    const reasoning = body.output.find((item) => item.type === 'reasoning');
    expect(reasoning).toBeDefined();
    expect(reasoning).toHaveProperty('encrypted_content', 'enc_abc');
  });

  it('streaming reasoning item carries encrypted_content from providerMetadata', async () => {
    const model = {
      ...makeBaseModel(),
      doStream: () => Promise.resolve({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] } as LanguageModelV4StreamPart);
            controller.enqueue({
              type: 'reasoning-start',
              id: 'rs_1:0',
              providerMetadata: { openai: { itemId: 'rs_1', reasoningEncryptedContent: null } },
            } as LanguageModelV4StreamPart);
            controller.enqueue({ type: 'reasoning-delta', id: 'rs_1:0', delta: 'thinking...' } as LanguageModelV4StreamPart);
            controller.enqueue({
              type: 'reasoning-end',
              id: 'rs_1:0',
              providerMetadata: { openai: { itemId: 'rs_1', reasoningEncryptedContent: 'enc_xyz' } },
            } as LanguageModelV4StreamPart);
            controller.enqueue({
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: { inputTokens: { total: 5, noCache: 5 }, outputTokens: { total: 3, text: 0, reasoning: 3 } },
            } as LanguageModelV4StreamPart);
            controller.close();
          },
        }),
      }),
    } as unknown as LanguageModelV4;

    const app = makeApp(model);
    const res = await app.request('http://localhost/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-5',
        input: 'think',
        stream: true,
        include: ['reasoning.encrypted_content'],
      }),
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    const completedBlock = text
      .split('\n\n')
      .find((block) => block.includes('event: response.completed'));
    expect(completedBlock).toBeDefined();
    const dataLine = completedBlock!.match(/^data: (.+)$/m)?.[1];
    const data = JSON.parse(dataLine!) as { response: { output: Array<Record<string, unknown>> } };
    const reasoning = data.response.output.find((item) => item.type === 'reasoning');
    expect(reasoning).toBeDefined();
    expect(reasoning).toHaveProperty('encrypted_content', 'enc_xyz');
  });
});
