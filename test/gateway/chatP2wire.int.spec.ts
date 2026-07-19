// P2 triage — /v1/chat/completions findings G47–G59.
//
// Each `it.fails` is tagged // G## and marks a CONFIRMED bug.
// Each `it` (passing) is tagged // G## and marks a REJECTED finding (behavior works).
// Findings triage via D-class grep evidence are noted in comments only.
//
// All tests use the createApp + mock-provider pattern from int.spec.ts.

import { describe, expect, it } from 'vitest';
import type { Hono } from 'hono';
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';
import { parseSse } from '../__helpers/gateway/parse-sse.js';

// ---------------------------------------------------------------------------
// Shared harness (mirrors wireHonesty.chat.int.spec.ts)
// ---------------------------------------------------------------------------

const DEFAULT_USAGE = {
  inputTokens: { total: 5, noCache: 5 },
  outputTokens: { total: 4, text: 4 },
};

const STOP_FINISH = { unified: 'stop', raw: 'stop' };

function createRecordingModel(opts?: {
  text?: string;
  streamParts?: LanguageModelV4StreamPart[];
  finishReason?: Record<string, string>;
  onCall?: (options: LanguageModelV4CallOptions) => void;
  providerMetadata?: Record<string, Record<string, unknown>>;
  responseBody?: unknown;
}): LanguageModelV4 {
  const { text = 'Hello', streamParts, finishReason = STOP_FINISH, onCall, providerMetadata, responseBody } = opts ?? {};
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() { return Promise.resolve({}); },
    doGenerate: async (options: LanguageModelV4CallOptions) => {
      onCall?.(options);
      return {
        content: [{ type: 'text' as const, text }],
        finishReason,
        usage: DEFAULT_USAGE,
        warnings: [],
        response: {
          id: 'mock-resp-1',
          modelId: 'mock-model',
          timestamp: new Date('2026-01-01T00:00:00Z'),
          ...(responseBody !== undefined ? { body: responseBody } : {}),
        },
        ...(providerMetadata ? { providerMetadata } : {}),
      };
    },
    doStream: async (options: LanguageModelV4CallOptions) => {
      onCall?.(options);
      const parts: LanguageModelV4StreamPart[] = streamParts ?? ([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text-0' },
        { type: 'text-delta', id: 'text-0', delta: text },
        { type: 'text-end', id: 'text-0' },
        { type: 'finish', finishReason, usage: DEFAULT_USAGE },
      ]);
      return {
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            for (const part of parts) {
              controller.enqueue(part);
            }
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

async function postRaw(app: Hono, path: string, body: unknown) {
  const res = await app.request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, headers: res.headers, text: await res.text() };
}

// ---------------------------------------------------------------------------
// G47 — type-safety seams: tool-input-delta id fallback → index 0 (user-scenario)
//
// If a `tool-input-delta` part arrives whose id was never seen in a prior
// `tool-input-start`, the fallback `?? 0` maps it to tool-call index 0.
// This means a second parallel tool call whose delta arrives before its start
// corrupts the arguments of the FIRST tool call (wrong index assignment).
//
// The test streams two tool-input-starts then injects a delta for an unseen id.
// Expected: gateway emits a `tool_calls[1]` delta (the correct index for an
// unknown id would be a new slot, not index 0).
// Actual: gateway emits `tool_calls[0]` delta, corrupting tool-call 0.
// ---------------------------------------------------------------------------

describe('G47 — tool-input-delta id fallback corrupts wrong tool-call index', () => {
  it.fails(
    'tool-input-delta with unseen id does not corrupt tool_calls[0] arguments (G47)',
    async () => {
      const model = createRecordingModel({
        streamParts: [
          { type: 'stream-start', warnings: [] },
          // Register two tool calls so index 0 = 'call_a', index 1 = 'call_b'
          { type: 'tool-input-start', id: 'call_a', toolName: 'search', toolCallType: 'function' },
          { type: 'tool-input-start', id: 'call_b', toolName: 'calc', toolCallType: 'function' },
          // Delta for an id that was never started: should NOT map to index 0
          { type: 'tool-input-delta', id: 'call_unknown', delta: '"corrupted"' },
          { type: 'finish', finishReason: STOP_FINISH, usage: DEFAULT_USAGE },
        ] as unknown as LanguageModelV4StreamPart[],
      });

      const app = makeAppWithModel('openai', model);
      const res = await app.request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'openai/gpt-4o',
          messages: [{ role: 'user', content: 'search and calc' }],
          stream: true,
        }),
      });

      const text = await res.text();
      const chunks = parseSse(text).filter((c) => {
        if (typeof c.data !== 'string' || c.data === '[DONE]') return false;
        const d = JSON.parse(c.data) as Record<string, unknown>;
        const choices = d.choices as Array<Record<string, unknown>>;
        const delta = choices?.[0]?.delta as Record<string, unknown>;
        const calls = delta?.tool_calls as Array<Record<string, unknown>>;
        return calls?.some((tc) => typeof tc.function === 'object' && (tc.function as Record<string, unknown>).arguments === '"corrupted"');
      });

      // The corrupted delta should NOT appear at index 0 (tool_calls[0] belongs to call_a)
      const corruptedOnZero = chunks.some((c) => {
        const d = JSON.parse(c.data) as Record<string, unknown>;
        const calls = ((d.choices as Array<Record<string, unknown>>)[0]?.delta as Record<string, unknown>)?.tool_calls as Array<Record<string, unknown>>;
        return calls?.some((tc) => tc.index === 0 && (tc.function as Record<string, unknown>)?.arguments === '"corrupted"');
      });
      expect(corruptedOnZero).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------
// G48 — service_tier captured but never emitted on SSE output.
// system_fingerprint IS emitted (state.systemFingerprint in makeChunk:269).
// service_tier is stored in state.serviceTier but never written to any chunk.
//
// We inject a raw chunk (via rawValue) that carries service_tier.
// The test verifies service_tier appears on the wire. It currently does not.
// ---------------------------------------------------------------------------

describe('G48 — service_tier missing from streaming SSE output', () => {
  // G48 — service_tier captured in state.serviceTier but makeChunk (stream.ts:260) never emits it; flip to it() when fixed.
  it('streaming chat includes service_tier on wire when provider returns it', async () => {
    // Inject a raw chunk with service_tier so the translator can capture it.
    const rawChunk = {
      id: 'chatcmpl-test',
      object: 'chat.completion.chunk',
      created: 1700000000,
      model: 'mock-model',
      service_tier: 'default',
      choices: [{ index: 0, delta: {}, finish_reason: null }],
    };

    const streamParts: LanguageModelV4StreamPart[] = [
      { type: 'stream-start', warnings: [] },
      { type: 'raw', rawValue: rawChunk },
      { type: 'text-start', id: 'text-0' },
      { type: 'text-delta', id: 'text-0', delta: 'hi' },
      { type: 'text-end', id: 'text-0' },
      { type: 'finish', finishReason: STOP_FINISH, usage: DEFAULT_USAGE },
    ];

    const app = makeAppWithModel('openai', createRecordingModel({ streamParts }));
    const { status, text } = await postRaw(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
    });

    expect(status).toBe(200);
    const chunks = parseSse(text)
      .filter((f) => f.data !== '[DONE]')
      .map((f) => JSON.parse(f.data) as Record<string, unknown>);
    const hasServiceTier = chunks.some((c) => c.service_tier !== undefined);
    expect(hasServiceTier, 'no chunk contained service_tier').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// G48 — non-streaming chat response must emit service_tier when the provider
// surfaces it in providerMetadata (via shared normalizeServiceTier, matching
// the responses/messages routes). toOpenAIResponse previously had no field.
// ---------------------------------------------------------------------------

describe('G48 — service_tier on non-streaming chat response', () => {
  // G48 — non-streaming chat emits service_tier from providerMetadata via normalizeServiceTier.
  it('non-streaming chat includes service_tier from provider metadata', async () => {
    const model = createRecordingModel({
      providerMetadata: { openai: { service_tier: 'flex' } },
    });
    const app = makeAppWithModel('openai', model);
    const { status, text } = await postRaw(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(status).toBe(200);
    const body = JSON.parse(text) as Record<string, unknown>;
    expect(body.service_tier).toBe('flex');
  });
});

// ---------------------------------------------------------------------------
// G49 — streaming responses lack x-request-id header.
// createSseResponse (toSseStream.ts:148) returns SSE_RESPONSE_HEADERS which
// has no x-request-id — the requestId computed in the handler is never
// forwarded to the SSE response.
// ---------------------------------------------------------------------------

describe('G49 — x-request-id absent on streaming SSE response', () => {
  // G49 — FIXED: createSseResponse now merges the handler's requestId into the SSE response headers.
  it('streaming chat response includes x-request-id header', async () => {
    const app = makeAppWithModel('openai', createRecordingModel());
    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o',
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id'), 'streaming SSE response missing x-request-id').not.toBeNull();
    await res.text();
  });
});

// ---------------------------------------------------------------------------
// G52 — max_tokens/max_completion_tokens precedence
// buildLanguageParams: `maxOutputTokens: body.max_completion_tokens ?? body.max_tokens`
// When BOTH are present, max_completion_tokens wins — OpenAI deprecates
// max_tokens in favor of max_completion_tokens, which is required for
// o-series models. Matches hebo-gateway (converters.ts:112).
// ---------------------------------------------------------------------------

describe('G52 — max_tokens/max_completion_tokens precedence', () => {
  // G52 — max_completion_tokens supersedes the deprecated max_tokens when both present.
  it('max_completion_tokens takes priority over max_tokens when both present', async () => {
    let capturedOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel('openai', createRecordingModel({
      onCall: (options) => { capturedOptions = options; },
    }));

    await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 100,
      max_completion_tokens: 200,
    });

    // Per OpenAI spec, max_completion_tokens (200) wins over deprecated max_tokens (100).
    expect(capturedOptions?.maxOutputTokens, 'max_completion_tokens should take priority').toBe(200);
  });
});

// ---------------------------------------------------------------------------
// G53 — stream_options.include_usage wire semantics (FIXED).
// When a client sends stream_options: {include_usage: true} with stream: true,
// every non-final chunk carries usage: null and a dedicated empty-choices chunk
// with the populated usage totals is emitted before [DONE]. When stream_options
// is absent, the legacy wire shape is preserved (usage on the finish chunk).
// ---------------------------------------------------------------------------

describe('G53 — stream_options.include_usage wire semantics', () => {
  // G53 — usage-only chunk with empty choices is emitted before [DONE].
  it('stream_options.include_usage produces a usage-only chunk before [DONE]', async () => {
    const app = makeAppWithModel('openai', createRecordingModel());
    const { status, text } = await postRaw(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
      stream_options: { include_usage: true },
    });

    expect(status).toBe(200);
    const chunks = parseSse(text)
      .filter((f) => f.data !== '[DONE]')
      .map((f) => JSON.parse(f.data) as Record<string, unknown>);

    // The last real chunk before [DONE] should have usage + empty choices.
    const usageChunk = chunks.find(
      (c) => c.usage !== null && c.usage !== undefined && Array.isArray(c.choices) && (c.choices as unknown[]).length === 0,
    );
    expect(usageChunk, 'no usage-only chunk found before [DONE]').toBeDefined();
  });

  it('include_usage: true → usage:null on non-final chunks, one dedicated usage chunk last, sharing id/model', async () => {
    const app = makeAppWithModel('openai', createRecordingModel());
    const { status, text } = await postRaw(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
      stream_options: { include_usage: true },
    });

    expect(status).toBe(200);
    const chunks = parseSse(text)
      .filter((f) => f.data !== '[DONE]')
      .map((f) => JSON.parse(f.data) as Record<string, unknown>);

    // Exactly one dedicated usage chunk: empty choices + populated usage.
    const usageChunks = chunks.filter(
      (c) => Array.isArray(c.choices) && (c.choices as unknown[]).length === 0 && c.usage != null,
    );
    expect(usageChunks).toHaveLength(1);
    const usageChunk = usageChunks[0];
    expect(usageChunk.usage as Record<string, unknown>).toHaveProperty('total_tokens');
    // It is the LAST chunk before [DONE].
    expect(chunks[chunks.length - 1]).toBe(usageChunk);

    // Every non-final chunk (non-empty choices, incl. the finish chunk) carries usage: null.
    const deltaChunks = chunks.filter(
      (c) => Array.isArray(c.choices) && (c.choices as unknown[]).length > 0,
    );
    expect(deltaChunks.length).toBeGreaterThan(0);
    for (const c of deltaChunks) {
      expect(c.usage, 'non-final chunk must carry usage: null').toBeNull();
    }

    // The dedicated usage chunk shares the stream id + model with the delta chunks.
    expect(usageChunk.id).toBe(deltaChunks[0].id);
    expect(usageChunk.model).toBe(deltaChunks[0].model);
  });

  it('include_usage absent → legacy wire shape (usage on finish chunk, no null stubs, no dedicated chunk)', async () => {
    const app = makeAppWithModel('openai', createRecordingModel());
    const { status, text } = await postRaw(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
    });

    expect(status).toBe(200);
    const chunks = parseSse(text)
      .filter((f) => f.data !== '[DONE]')
      .map((f) => JSON.parse(f.data) as Record<string, unknown>);

    // No dedicated empty-choices usage chunk.
    const dedicated = chunks.filter(
      (c) => Array.isArray(c.choices) && (c.choices as unknown[]).length === 0,
    );
    expect(dedicated).toHaveLength(0);

    // Exactly one chunk carries a usage key, and it is the finish chunk.
    const withUsage = chunks.filter((c) => c.usage !== undefined);
    expect(withUsage).toHaveLength(1);
    const finishChunk = withUsage[0];
    expect((finishChunk.choices as Array<Record<string, unknown>>)[0].finish_reason).toBe('stop');

    // No usage: null stubs anywhere on the legacy path.
    expect(chunks.some((c) => c.usage === null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// G54 — refusal finish_reason must be 'stop' not 'content_filter'
// OpenAI's wire returns finish_reason: 'stop' for model refusals; refusal text
// is an orthogonal delta field. The stream translator passes the upstream
// finish reason through unchanged.
// ---------------------------------------------------------------------------

describe('G54 — refusal finish_reason: content_filter instead of stop', () => {
  it('refusal finish_reason is stop not content_filter', async () => {
    const refusalRaw = {
      id: 'chatcmpl-test',
      object: 'chat.completion.chunk',
      created: 1700000000,
      model: 'gpt-4o',
      choices: [{ index: 0, delta: { refusal: 'I cannot help with that.' }, finish_reason: null }],
    };

    const streamParts: LanguageModelV4StreamPart[] = [
      { type: 'stream-start', warnings: [] },
      { type: 'raw', rawValue: refusalRaw },
      { type: 'finish', finishReason: STOP_FINISH, usage: DEFAULT_USAGE },
    ];

    const app = makeAppWithModel('openai', createRecordingModel({ streamParts }));
    const { status, text } = await postRaw(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'do something bad' }],
      stream: true,
    });

    expect(status).toBe(200);
    const chunks = parseSse(text)
      .filter((f) => f.data !== '[DONE]')
      .map((f) => JSON.parse(f.data) as Record<string, unknown>);

    const finishChunk = chunks.find(
      (c) => Array.isArray(c.choices) && (c.choices as Array<Record<string, unknown>>).some((ch) => ch.finish_reason !== null),
    );
    expect(finishChunk).toBeDefined();
    const finishReason = (finishChunk!.choices as Array<Record<string, unknown>>)[0].finish_reason;
    // OpenAI spec: refusal → 'stop', not 'content_filter'
    expect(finishReason, 'refusal should map to stop not content_filter').toBe('stop');
  });
});

// ---------------------------------------------------------------------------
// G55 — re-ingestion drops assistant `refusal` (FIXED) — the translator now
// preserves re-ingested refusals as a text part in the assistant turn.
// `name` remains intentionally dropped (no ModelMessage mapping; parity with
// the AI SDK's converters).
// ---------------------------------------------------------------------------

describe('G55 — assistant refusal preserved on re-ingestion', () => {
  it('assistant message refusal reaches upstream prompt', async () => {
    let capturedOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel('openai', createRecordingModel({
      onCall: (options) => { capturedOptions = options; },
    }));

    const { status } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [
        { role: 'user', content: 'do something bad' },
        { role: 'assistant', content: null, refusal: 'I cannot do that.' },
        { role: 'user', content: 'why not?' },
      ],
    });

    expect(status).toBe(200);
    const assistantMsg = capturedOptions?.prompt.find((m) => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    // refusal is preserved as a text part in the translated assistant turn
    const opts = JSON.stringify(capturedOptions?.prompt ?? {});
    expect(opts).toContain('I cannot do that.');
  });
});

// ---------------------------------------------------------------------------
// G56 — over-broad 400s on benign values (FIXED) — parallel_tool_calls and
// user are forwarded via providerOptions; logprobs:false/null is a no-op.
// Only logprobs:true still 400s (response logprobs plumbing pending, OC11).
// ---------------------------------------------------------------------------

describe('G56 — over-broad 400s on benign values', () => {
  it('parallel_tool_calls: true is accepted (not a 400)', async () => {
    const app = makeAppWithModel('openai', createRecordingModel());
    const { status } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      parallel_tool_calls: true,
    });
    expect(status, 'parallel_tool_calls:true should not 400').toBe(200);
  });

  it('user field is accepted (not a 400)', async () => {
    const app = makeAppWithModel('openai', createRecordingModel());
    const { status } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      user: 'user-alice',
    });
    expect(status, 'user field should not 400').toBe(200);
  });

  it('logprobs: false is accepted (not a 400)', async () => {
    const app = makeAppWithModel('openai', createRecordingModel());
    const { status } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      logprobs: false,
    });
    expect(status, 'logprobs:false should not 400').toBe(200);
  });
});

// ---------------------------------------------------------------------------
// G57 — mapFinishReason masks 'error'/'unknown' as 'stop' (FIXED) — the chat
// translators now pass 'error' through and fold 'other'/'unknown' into
// 'other', so a failed step is never masked as a clean 'stop'.
// ---------------------------------------------------------------------------

describe('G57 — mapFinishReason masks error/unknown as stop', () => {
  it('streaming: error finish reason appears as error not stop on wire', async () => {
    const errorFinish = { unified: 'error', raw: 'error' };
    const streamParts: LanguageModelV4StreamPart[] = [
      { type: 'stream-start', warnings: [] },
      { type: 'text-start', id: 'text-0' },
      { type: 'text-delta', id: 'text-0', delta: 'partial' },
      { type: 'text-end', id: 'text-0' },
      { type: 'finish', finishReason: errorFinish, usage: DEFAULT_USAGE },
    ];

    const app = makeAppWithModel('openai', createRecordingModel({ streamParts }));
    const { status, text } = await postRaw(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
    });

    expect(status).toBe(200);
    const chunks = parseSse(text)
      .filter((f) => f.data !== '[DONE]')
      .map((f) => JSON.parse(f.data) as Record<string, unknown>);

    const finishChunk = chunks.find(
      (c) => Array.isArray(c.choices) && (c.choices as Array<Record<string, unknown>>).some((ch) => ch.finish_reason !== null),
    );
    expect(finishChunk).toBeDefined();
    const finishReason = (finishChunk!.choices as Array<Record<string, unknown>>)[0].finish_reason;
    expect(finishReason, 'error finishReason masked as stop').not.toBe('stop');
    expect(finishReason).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// G58 — tools: strict forwarded (FIXED) — tools.ts passes `strict` into the
// AI SDK tool() helper; non-function tool types now 400 at tools[N].type.
// ---------------------------------------------------------------------------

describe('G58 — tools strict field forwarded', () => {
  it('tool strict: true reaches upstream via providerOptions', async () => {
    let capturedOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel('openai', createRecordingModel({
      onCall: (options) => { capturedOptions = options; },
    }));

    const { status } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{
        type: 'function',
        function: {
          name: 'get_weather',
          strict: true,
          parameters: { type: 'object', properties: { city: { type: 'string' } } },
        },
      }],
    });

    expect(status).toBe(200);
    const toolDef = JSON.stringify(capturedOptions?.tools ?? {});
    expect(toolDef).toContain('strict');
  });

  it('non-function tool type 400s with param tools[N].type', async () => {
    const app = makeAppWithModel('openai', createRecordingModel());
    const { status, body } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ type: 'custom', custom: { name: 'thing' } }],
    });

    expect(status).toBe(400);
    const error = (body as Record<string, unknown>).error as Record<string, unknown>;
    expect(error.param).toBe('tools[0].type');
  });
});

// ---------------------------------------------------------------------------
// G59 — non-streaming refusal (FIXED) — toOpenAIResponse lifts
// `choices[0].message.refusal` from the raw provider response body
// (generateText's `result.response.body`) into the response message,
// matching the streaming path's delta.refusal handling.
// ---------------------------------------------------------------------------

describe('G59 — non-streaming refusal surfaced', () => {
  it('non-streaming response includes refusal field when model refuses', async () => {
    const app = makeAppWithModel('openai', createRecordingModel({
      text: '', // model refuses, empty text
      finishReason: { unified: 'stop', raw: 'stop' },
      responseBody: {
        id: 'chatcmpl-refusal',
        object: 'chat.completion',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: null, refusal: 'I cannot help with that.' },
          finish_reason: 'stop',
        }],
      },
    }));

    const { status, body } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'do something bad' }],
    });

    expect(status).toBe(200);
    const choice = (body as Record<string, unknown>).choices as Array<Record<string, unknown>>;
    // OpenAI spec: refusal response should have message.refusal set
    expect(choice[0]).toBeDefined();
    const message = choice[0].message as Record<string, unknown>;
    // When a model returns a refusal, message.refusal should be a string, not missing
    expect(message).toHaveProperty('refusal');
    expect(message.refusal).toBe('I cannot help with that.');
    expect(message.content).toBeNull();
  });

  it('non-streaming response omits refusal when provider body has none', async () => {
    const app = makeAppWithModel('openai', createRecordingModel({
      text: 'Hello',
      responseBody: {
        id: 'chatcmpl-ok',
        object: 'chat.completion',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Hello', refusal: null },
          finish_reason: 'stop',
        }],
      },
    }));

    const { status, body } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(status).toBe(200);
    const choice = (body as Record<string, unknown>).choices as Array<Record<string, unknown>>;
    const message = choice[0].message as Record<string, unknown>;
    expect(message).not.toHaveProperty('refusal');
    expect(message.content).toBe('Hello');
  });
});
