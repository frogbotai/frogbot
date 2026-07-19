// Review 056 P1 triage (batch 2) — reproduction tests for G5–G11 from
// dev/plans/frogbot_gateway/056_full_gateway_review/00_SUMMARY.md §3
// (P1 wire-honesty table).
//
// Each test asserts the CORRECT (spec-compliant) behavior at the composed-app
// seam (`createApp` + `app.request()`), so unit-level layers that each look
// right cannot mask a composition bug. Confirmed findings are wrapped as
// `it.fails(...)` so the suite stays green; flip to `it()` when the
// corresponding fix lands.
//
// For "forward faithfully or reject with typed 400; never silently drop"
// findings (G9/G10), the assertion accepts EITHER disposition: an explicit
// 400 passes, forwarding passes — only a silent drop (200 + field never
// reaches upstream callOptions) fails.

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
// Harness — mirrors paramForwarding.int.spec.ts (batch 1)
// ---------------------------------------------------------------------------

const DEFAULT_USAGE = {
  inputTokens: { total: 5, noCache: 5 },
  outputTokens: { total: 4, text: 4 },
};

// `LanguageModelV4FinishReason` is `{ unified, raw }`, not a plain string —
// real providers always shape it this way (see int.spec.ts
// createDelayedStreamModel). A bare string normalizes to `unknown` and the
// responses route would terminate with `response.failed`.
const STOP_FINISH = { unified: 'stop', raw: 'stop' };

/**
 * Recording mock LanguageModelV4 — captures the exact callOptions the AI SDK
 * hands to `doGenerate`/`doStream` so tests can assert what actually reached
 * the (mocked) upstream. `streamParts`, when given, fully replaces the
 * default part sequence for `doStream`.
 */
function createRecordingModel(opts?: {
  text?: string;
  streamParts?: LanguageModelV4StreamPart[];
  onCall?: (options: LanguageModelV4CallOptions) => void;
}): LanguageModelV4 {
  const { text = 'Hello from mock!', streamParts, onCall } = opts ?? {};
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() { return Promise.resolve({}); },
    doGenerate: async (options: LanguageModelV4CallOptions) => {
      onCall?.(options);
      return {
        content: [{ type: 'text' as const, text }],
        finishReason: STOP_FINISH,
        usage: DEFAULT_USAGE,
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
      const parts: LanguageModelV4StreamPart[] = streamParts ?? ([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text-0' },
        { type: 'text-delta', id: 'text-0', delta: text },
        { type: 'text-end', id: 'text-0' },
        { type: 'finish', finishReason: STOP_FINISH, usage: DEFAULT_USAGE },
      ] as unknown as LanguageModelV4StreamPart[]);
      return {
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            for (const part of parts) controller.enqueue(part);
            controller.close();
          },
        }),
      };
    },
  } as unknown as LanguageModelV4;
}

function makeAppWithModel(providerName: string, model: LanguageModelV4) {
  const fakeProvider = { languageModel: () => model };
  const registry = { [providerName]: fakeProvider } as unknown as ProviderRegistry;
  return createApp({ registry });
}

/** POST returning the raw response text (for SSE wire assertions). */
async function postRaw(app: Hono, path: string, body: unknown) {
  const res = await app.request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, headers: res.headers, text: await res.text() };
}

/** Parses the JSON data payloads out of a chat-style SSE body (skips [DONE]). */
function parseChatChunks(sseText: string): Array<Record<string, any>> {
  return parseSse(sseText)
    .filter((f) => f.data !== '[DONE]')
    .map((f) => JSON.parse(f.data) as Record<string, any>);
}

// ---------------------------------------------------------------------------
// G5 (S2/OC2) — every successful chat stream must terminate with exactly ONE
// `data: [DONE]` sentinel. Today the translator flush() AND toSseStream's
// appendDone each append one → two sentinels on 100% of streams.
// ---------------------------------------------------------------------------

// G5
describe('single [DONE] sentinel on chat streams', () => {
  it('emits exactly one data: [DONE] on a successful stream', async () => {
    const app = makeAppWithModel('openai', createRecordingModel());

    const { status, text } = await postRaw(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
    });

    expect(status).toBe(200);
    const doneCount = (text.match(/^data: \[DONE\]$/gm) ?? []).length;
    expect(doneCount, `SSE body ends: ${JSON.stringify(text.slice(-64))}`).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// G6 (S3/AM2) — Anthropic streaming wire must report real `input_tokens`.
// `message_start` zero is acceptable (unknown upfront), but `message_delta`
// usage is cumulative per the Anthropic spec and must carry `input_tokens`
// from the finish part's totalUsage. Today it is omitted entirely.
// ---------------------------------------------------------------------------

// G6
describe('messages streaming message_delta reports input_tokens', () => {
  it('emits real input_tokens in message_delta usage', async () => {
    const app = makeAppWithModel('anthropic', createRecordingModel());

    const { status, text } = await postRaw(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 128,
      stream: true,
    });

    expect(status).toBe(200);
    const frames = parseSse(text).map((f) => JSON.parse(f.data) as Record<string, any>);
    const messageDelta = frames.find((f) => f.type === 'message_delta');
    expect(messageDelta, 'stream must contain a message_delta event').toBeDefined();
    // Mock upstream reported 5 input tokens on finish; sanity: output made it.
    expect(messageDelta!.usage.output_tokens).toBe(4);
    expect(messageDelta!.usage.input_tokens).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// G7 (S4/RS2) — response `id`/`model` must be stable across every frame of a
// stream. Today `finish-step` overwrites both with upstream metadata after
// earlier chunks already went out with the synthetic id / requested model.
// ---------------------------------------------------------------------------

// G7
describe('stream id/model stability', () => {
  // G7 — chat: every chunk shares one id and one model. See 056_full_gateway_review.
  it('chat: every chunk shares one id and one model', async () => {
    const app = makeAppWithModel('openai', createRecordingModel());

    const { status, text } = await postRaw(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
    });

    expect(status).toBe(200);
    const chunks = parseChatChunks(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const ids = new Set(chunks.map((c) => c.id));
    const models = new Set(chunks.map((c) => c.model));
    expect([...ids], 'chunk id must not mutate mid-stream').toHaveLength(1);
    expect([...models], 'chunk model must not mutate mid-stream').toHaveLength(1);
  });

  // G7 — responses: response.created and response.completed carry the same response id. See 056_full_gateway_review.
  it('responses: response.created and response.completed carry the same response id', async () => {
    const app = makeAppWithModel('openai', createRecordingModel());

    const { status, text } = await postRaw(app, '/v1/responses', {
      model: 'openai/gpt-4o-mini',
      input: 'hi',
      stream: true,
    });

    expect(status).toBe(200);
    const frames = parseSse(text).map((f) => JSON.parse(f.data) as Record<string, any>);
    const created = frames.find((f) => f.type === 'response.created');
    const completed = frames.find((f) => f.type === 'response.completed');
    expect(created).toBeDefined();
    expect(completed).toBeDefined();
    expect(completed!.response.id, 'envelope id must be stable created → completed')
      .toBe(created!.response.id);
    expect(completed!.response.model, 'envelope model must be stable created → completed')
      .toBe(created!.response.model);
  });
});

// ---------------------------------------------------------------------------
// G8 (OC3) — the chat Zod schema must accept spec-valid message shapes the
// translators already support: array-of-text-parts content on system/tool
// messages and array content on assistant messages. Today each 400s.
// ---------------------------------------------------------------------------

// G8
describe('chat schema accepts spec-valid message shapes', () => {
  // G8 — schema.ts system content z.string() 400s spec-valid array parts the translator supports; flip to it() when fixed. See 056_full_gateway_review.
  it('accepts system message with array-of-text-parts content', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel('openai', createRecordingModel({
      onCall: (options) => { callOptions = options; },
    }));

    const { status, body } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: [{ type: 'text', text: 'g8-system-instruction' }] },
        { role: 'user', content: 'hi' },
      ],
    });

    expect(status, `expected 200, got ${status}: ${JSON.stringify(body)}`).toBe(200);
    expect(JSON.stringify(callOptions?.prompt)).toContain('g8-system-instruction');
  });

  // G8 — schema.ts tool content z.string() 400s spec-valid array parts (parseToolOutput handles arrays); flip to it() when fixed. See 056_full_gateway_review.
  it('accepts tool message with array-of-text-parts content', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel('openai', createRecordingModel({
      onCall: (options) => { callOptions = options; },
    }));

    const { status, body } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'user', content: 'weather in Paris?' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_1',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"Paris"}' },
          }],
        },
        {
          role: 'tool',
          tool_call_id: 'call_1',
          content: [{ type: 'text', text: 'g8-tool-result-18C' }],
        },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'get_weather',
          parameters: { type: 'object', properties: { city: { type: 'string' } } },
        },
      }],
    });

    expect(status, `expected 200, got ${status}: ${JSON.stringify(body)}`).toBe(200);
    expect(JSON.stringify(callOptions?.prompt)).toContain('g8-tool-result-18C');
  });

  // G8 — schema.ts assistant content string|null 400s spec-valid array-of-parts; flip to it() when fixed. See 056_full_gateway_review.
  it('accepts assistant message with array-of-parts content', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel('openai', createRecordingModel({
      onCall: (options) => { callOptions = options; },
    }));

    const { status, body } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: [{ type: 'text', text: 'g8-assistant-prior-turn' }] },
        { role: 'user', content: 'continue' },
      ],
    });

    expect(status, `expected 200, got ${status}: ${JSON.stringify(body)}`).toBe(200);
    expect(JSON.stringify(callOptions?.prompt)).toContain('g8-assistant-prior-turn');
  });
});

// ---------------------------------------------------------------------------
// G9 (OC5) — documented chat request fields must be forwarded faithfully or
// rejected with a typed 400; never accepted-and-dropped. Each test passes on
// EITHER disposition and fails only on a silent drop.
// ---------------------------------------------------------------------------

/** Passes on explicit 400; on 2xx requires evidence in upstream callOptions. */
function expectForwardedOr400(args: {
  field: string;
  status: number;
  callOptions: LanguageModelV4CallOptions | undefined;
  evidence: string | RegExp;
}) {
  if (args.status === 400) return; // typed rejection — policy-compliant
  expect(args.status).toBe(200);
  const serialized = JSON.stringify(args.callOptions ?? {});
  const found = typeof args.evidence === 'string'
    ? serialized.includes(args.evidence)
    : args.evidence.test(serialized);
  expect(
    found,
    `\`${args.field}\` was accepted (HTTP ${args.status}) but never reached upstream callOptions — silently dropped`,
  ).toBe(true);
}

// G9
describe('documented chat fields: forward or 400, never drop', () => {
  async function post(body: Record<string, unknown>) {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel('openai', createRecordingModel({
      onCall: (options) => { callOptions = options; },
    }));
    const { status } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      ...body,
    });
    return { status, callOptions: () => callOptions };
  }

  // G9 — legacy functions/function_call silently dropped: model receives NO tools, HTTP 200; flip to it() when fixed. See 056_full_gateway_review.
  it('legacy functions/function_call produce tools upstream (or 400)', async () => {
    const { status, callOptions } = await post({
      functions: [{
        name: 'get_weather',
        parameters: { type: 'object', properties: { city: { type: 'string' } } },
      }],
      function_call: 'auto',
    });
    if (status !== 400) {
      expect(status).toBe(200);
      // The model must actually receive tools — old integrations otherwise get
      // plausible prose instead of tool calls, silently.
      expect(
        callOptions()?.tools,
        '`functions` accepted but the model received no tools — silently dropped',
      ).toBeDefined();
      expect(JSON.stringify(callOptions()?.tools)).toContain('get_weather');
    }
  });

  // G9 — web_search_options silently dropped (client believes grounded search ran); flip to it() when fixed. See 056_full_gateway_review.
  it('web_search_options forwarded (or 400)', async () => {
    const { status, callOptions } = await post({
      web_search_options: {
        user_location: { type: 'approximate', approximate: { city: 'g9-web-search-city' } },
      },
    });
    expectForwardedOr400({
      field: 'web_search_options',
      status,
      callOptions: callOptions(),
      evidence: 'g9-web-search-city',
    });
  });

  // G9 — prediction silently dropped despite direct AI SDK provider-option mapping; flip to it() when fixed. See 056_full_gateway_review.
  it('prediction forwarded (or 400)', async () => {
    const { status, callOptions } = await post({
      prediction: { type: 'content', content: 'g9-prediction-sentinel' },
    });
    expectForwardedOr400({
      field: 'prediction',
      status,
      callOptions: callOptions(),
      evidence: 'g9-prediction-sentinel',
    });
  });

  // G9 — store silently dropped despite direct AI SDK provider-option mapping; flip to it() when fixed. See 056_full_gateway_review.
  it('store forwarded (or 400)', async () => {
    const { status, callOptions } = await post({ store: true });
    expectForwardedOr400({
      field: 'store',
      status,
      callOptions: callOptions(),
      evidence: /"store":\s*true/,
    });
  });

  // G9 — metadata silently dropped despite direct AI SDK provider-option mapping; flip to it() when fixed. See 056_full_gateway_review.
  it('metadata forwarded (or 400)', async () => {
    const { status, callOptions } = await post({
      metadata: { batch_ref: 'g9-metadata-sentinel' },
    });
    expectForwardedOr400({
      field: 'metadata',
      status,
      callOptions: callOptions(),
      evidence: 'g9-metadata-sentinel',
    });
  });

  // G9 — service_tier silently dropped despite direct AI SDK provider-option mapping; flip to it() when fixed. See 056_full_gateway_review.
  it('service_tier forwarded (or 400)', async () => {
    const { status, callOptions } = await post({ service_tier: 'flex' });
    expectForwardedOr400({
      field: 'service_tier',
      status,
      callOptions: callOptions(),
      evidence: '"flex"',
    });
  });

  // G9 — safety_identifier silently dropped despite direct AI SDK provider-option mapping; flip to it() when fixed. See 056_full_gateway_review.
  it('safety_identifier forwarded (or 400)', async () => {
    const { status, callOptions } = await post({ safety_identifier: 'g9-safety-sentinel' });
    expectForwardedOr400({
      field: 'safety_identifier',
      status,
      callOptions: callOptions(),
      evidence: 'g9-safety-sentinel',
    });
  });

  // G9 — top_logprobs silently dropped while sibling logprobs is a 400 (incoherent policy surface); flip to it() when fixed. See 056_full_gateway_review.
  it('top_logprobs forwarded (or 400)', async () => {
    const { status, callOptions } = await post({ top_logprobs: 7 });
    expectForwardedOr400({
      field: 'top_logprobs',
      status,
      callOptions: callOptions(),
      evidence: /top_?[lL]ogprobs/,
    });
  });

  // G9 — audio/modalities silently dropped (audio output requests get plain text, HTTP 200); flip to it() when fixed. See 056_full_gateway_review.
  it('audio + modalities forwarded (or 400)', async () => {
    const { status, callOptions } = await post({
      modalities: ['text', 'audio'],
      audio: { voice: 'alloy', format: 'mp3' },
    });
    expectForwardedOr400({
      field: 'audio/modalities',
      status,
      callOptions: callOptions(),
      evidence: '"alloy"',
    });
  });
});

// ---------------------------------------------------------------------------
// G10 (OC6) — `tool_choice: {type:'allowed_tools'}` must constrain the model
// (activeTools + mode) or 400; unknown shapes must 400. Today both silently
// degrade to the SDK default (`auto`).
// ---------------------------------------------------------------------------

// G10
describe('tool_choice allowed_tools / unknown shapes', () => {
  const TOOLS = [
    {
      type: 'function',
      function: { name: 'get_weather', parameters: { type: 'object', properties: {} } },
    },
    {
      type: 'function',
      function: { name: 'get_time', parameters: { type: 'object', properties: {} } },
    },
  ];

  // G10 — allowed_tools maps to activeTools + mode.
  it('allowed_tools mode=required constrains the upstream call (or 400)', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel('openai', createRecordingModel({
      onCall: (options) => { callOptions = options; },
    }));

    const { status } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      tools: TOOLS,
      tool_choice: {
        type: 'allowed_tools',
        allowed_tools: {
          mode: 'required',
          tools: [{ type: 'function', function: { name: 'get_weather' } }],
        },
      },
    });

    if (status !== 400) {
      expect(status).toBe(200);
      expect(
        callOptions?.toolChoice,
        'allowed_tools mode=required silently degraded to the SDK default (auto)',
      ).toEqual(expect.objectContaining({ type: 'required' }));
    }
  });

  // G10 — unknown tool_choice shapes must 400 instead of silently degrading to auto.
  it('rejects a genuinely unknown tool_choice shape with a 400', async () => {
    const app = makeAppWithModel('openai', createRecordingModel());

    const { status, body } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      tools: TOOLS,
      tool_choice: { type: 'g10-bogus-shape' },
    });

    expect(status, `unknown tool_choice shape must 400, got ${status}: ${JSON.stringify(body)}`).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// G11 (OC7) — streaming chat must preserve reasoning providerMetadata
// (Anthropic thinking signature / redacted data) as `reasoning_details`, the
// way the non-streaming path already does. Without the signature on the wire
// a streaming client cannot reconstruct a valid assistant turn — Anthropic
// rejects thinking blocks without their signature on the next request.
// ---------------------------------------------------------------------------

// G11
describe('streaming preserves reasoning_details metadata', () => {
  function reasoningStreamParts(providerMetadata: Record<string, Record<string, unknown>>): LanguageModelV4StreamPart[] {
    return [
      { type: 'stream-start', warnings: [] },
      { type: 'reasoning-start', id: 'r-0' },
      { type: 'reasoning-delta', id: 'r-0', delta: 'thinking hard', providerMetadata },
      { type: 'reasoning-end', id: 'r-0', providerMetadata },
      { type: 'text-start', id: 'text-0' },
      { type: 'text-delta', id: 'text-0', delta: 'the answer' },
      { type: 'text-end', id: 'text-0' },
      { type: 'finish', finishReason: STOP_FINISH, usage: DEFAULT_USAGE },
    ] as unknown as LanguageModelV4StreamPart[];
  }

  it('thinking signature survives to the streaming wire', async () => {
    const app = makeAppWithModel('anthropic', createRecordingModel({
      streamParts: reasoningStreamParts({ anthropic: { signature: 'sig-g11-signature' } }),
    }));

    const { status, text } = await postRaw(app, '/v1/chat/completions', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'think then answer' }],
      stream: true,
    });

    expect(status).toBe(200);
    // Sanity: the reasoning text itself did stream.
    expect(text).toContain('thinking hard');
    // The signature must appear somewhere on the wire (reasoning_details) for
    // the client to round-trip the thinking block.
    expect(text).toContain('sig-g11-signature');
  });

  it('redacted thinking data survives to the streaming wire', async () => {
    const app = makeAppWithModel('anthropic', createRecordingModel({
      streamParts: reasoningStreamParts({ anthropic: { redactedData: 'g11-redacted-blob' } }),
    }));

    const { status, text } = await postRaw(app, '/v1/chat/completions', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'think then answer' }],
      stream: true,
    });

    expect(status).toBe(200);
    expect(text).toContain('g11-redacted-blob');
  });
});
