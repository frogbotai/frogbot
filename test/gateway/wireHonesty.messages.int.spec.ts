// Review 056 batch-2 triage — reproduction tests for G12–G18 (all /v1/messages,
// Anthropic wire) from dev/plans/frogbot_gateway/056_full_gateway_review/00_SUMMARY.md §3
// and findings/03_anthropic_messages_wire.md (+ findings/07 HE14 for G16).
//
// Each test asserts the CORRECT (spec-compliant) behavior at the composed-app
// seam. Confirmed findings are wrapped as `it.fails(...)` so the suite stays
// green; flip to `it()` when the corresponding fix lands. Policy-compliant
// current behavior (G18) is a plain passing `it()`.
//
// Expected shapes verified against:
//   - Anthropic error spec (platform.claude.com/docs/en/api/errors):
//     402 billing_error, 413 request_too_large, 504 timeout_error,
//     529 overloaded_error; error bodies carry a top-level `request_id`.
//   - Anthropic Messages spec: stop_reason includes 'refusal'
//     (AI SDK map-anthropic-stop-reason.ts maps refusal → 'content-filter');
//     request `service_tier: 'auto'|'standard_only'`, response
//     `usage.service_tier: 'standard'|'priority'|'batch'`;
//     structured output via `output_config.format: {type:'json_schema', schema}`.
//   - AI SDK anthropic source (~/Documents/Code/ai/packages/anthropic/src):
//     URL documents accepted only as application/pdf or text/plain
//     (convert-to-anthropic-prompt.ts, else UnsupportedFunctionalityError);
//     `providerOptions.anthropic.metadata.userId` → `metadata.user_id`
//     (anthropic-language-model.ts:495-496); raw usage (incl. service_tier)
//     surfaces at `providerMetadata.anthropic.usage`; responseFormat
//     {type:'json', schema} → `output_config.format` on the Anthropic wire.

import { describe, expect, it } from 'vitest';
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';

/**
 * Builds an error that passes `APICallError.isInstance()` at runtime without
 * importing `@ai-sdk/provider` as a value (see paramForwarding.int.spec.ts for the
 * rationale — the AI SDK identifies error classes via `Symbol.for` markers).
 * `isRetryable: false` keeps the SDK's retry loop out of the way so the
 * original status code reaches the gateway envelope untouched.
 */
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

/**
 * Recording mock LanguageModelV4 — captures the exact callOptions the AI SDK
 * hands to `doGenerate`/`doStream`. Mirrors the batch-1 recording model, plus:
 *   - `finishReason` in the real `{ unified, raw }` shape (generateText reads
 *     `finishReason.unified` — a bare string mock would masquerade as
 *     `undefined` and default-map, hiding the G12 defect),
 *   - `providerMetadata` on the doGenerate result (how the real anthropic
 *     model surfaces raw usage, incl. `service_tier`),
 *   - `streamParts` to override the doStream chunk sequence.
 */
function createRecordingModel(opts?: {
  text?: string;
  error?: unknown;
  finishReason?: { unified: string; raw?: string };
  providerMetadata?: Record<string, Record<string, unknown>>;
  streamParts?: LanguageModelV4StreamPart[];
  onCall?: (options: LanguageModelV4CallOptions) => void;
}): LanguageModelV4 {
  const {
    text = 'Hello from mock!',
    error,
    finishReason = { unified: 'stop', raw: 'end_turn' },
    providerMetadata,
    streamParts,
    onCall,
  } = opts ?? {};
  const usage = {
    inputTokens: { total: 5, noCache: 5 },
    outputTokens: { total: 4, text: 4 },
  };
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    // Accept every URL natively so the AI SDK forwards URL file parts to the
    // model instead of trying to download them (keeps G14 hermetic).
    get supportedUrls() { return Promise.resolve({ '*': [/.*/] }); },
    doGenerate: async (options: LanguageModelV4CallOptions) => {
      onCall?.(options);
      if (error) throw error;
      return {
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
      };
    },
    doStream: async (options: LanguageModelV4CallOptions) => {
      onCall?.(options);
      if (error) throw error;
      const parts: LanguageModelV4StreamPart[] = streamParts ?? [
        { type: 'stream-start', warnings: [] } as unknown as LanguageModelV4StreamPart,
        { type: 'text-start', id: 'text-0' } as LanguageModelV4StreamPart,
        { type: 'text-delta', id: 'text-0', delta: text } as LanguageModelV4StreamPart,
        { type: 'text-end', id: 'text-0' } as LanguageModelV4StreamPart,
        { type: 'finish', finishReason, usage } as unknown as LanguageModelV4StreamPart,
      ];
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

function postMessages(app: ReturnType<typeof createApp>, body: Record<string, unknown>) {
  return postJson(app, '/v1/messages', {
    model: 'anthropic/claude-sonnet-4-20250514',
    messages: [{ role: 'user', content: 'hi' }],
    max_tokens: 128,
    ...body,
  });
}

// ---------------------------------------------------------------------------
// G12 (AM3) — `content-filter` finish reason must surface as
// stop_reason 'refusal' on the Anthropic wire (the AI SDK's inverse map:
// refusal → 'content-filter'); today it is emitted as 'stop_sequence' — a
// wire lie claiming one of the client's stop_sequences matched.
// ---------------------------------------------------------------------------

// G12
describe('messages content-filter → stop_reason refusal', () => {
  // G12
  it('non-streaming: content-filter finish emits stop_reason refusal', async () => {
    const app = makeAppWithModel('anthropic', createRecordingModel({
      text: 'I cannot help with that.',
      finishReason: { unified: 'content-filter', raw: 'refusal' },
    }));

    const { status, body } = await postMessages(app, {});

    expect(status).toBe(200);
    expect(body).toHaveProperty('stop_reason', 'refusal');
  });

  // G12
  it('streaming: content-filter finish emits message_delta stop_reason refusal', async () => {
    const usage = {
      inputTokens: { total: 5, noCache: 5 },
      outputTokens: { total: 4, text: 4 },
    };
    const app = makeAppWithModel('anthropic', createRecordingModel({
      streamParts: [
        { type: 'stream-start', warnings: [] } as unknown as LanguageModelV4StreamPart,
        { type: 'text-start', id: 'text-0' } as LanguageModelV4StreamPart,
        { type: 'text-delta', id: 'text-0', delta: 'nope' } as LanguageModelV4StreamPart,
        { type: 'text-end', id: 'text-0' } as LanguageModelV4StreamPart,
        {
          type: 'finish',
          finishReason: { unified: 'content-filter', raw: 'refusal' },
          usage,
        } as unknown as LanguageModelV4StreamPart,
      ],
    }));

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
    const delta = JSON.parse(deltaMatch![1]!) as { delta: { stop_reason: string } };
    expect(delta.delta.stop_reason).toBe('refusal');
  });
});

// ---------------------------------------------------------------------------
// G13 (AM4) — server tool definitions (web_search_20250305 etc.) must NOT be
// converted into client function tools with empty schemas. Compliant
// behaviors: filter-and-warn (hebo parity), provider-defined tool mapping, or
// a typed 400 — anything except registering a fake client tool the model may
// call and then dead-end on (stop_reason tool_use with no executor).
// ---------------------------------------------------------------------------

// G13
describe('messages server tools not mis-translated', () => {
  // G13 — tools.ts:9-21 ignores the `type` discriminator: web_search_20250305 becomes a client function tool with an empty schema; flip to it() when fixed. See 056_full_gateway_review.
  it('does not register web_search_20250305 as a client function tool', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel('anthropic', createRecordingModel({
      onCall: (options) => { callOptions = options; },
    }));

    await postMessages(app, {
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
    });

    // Regardless of whether the request 200s (drop/provider-defined) or 400s,
    // the upstream must never see a plain function tool for a server tool.
    const tools = (callOptions?.tools ?? []) as Array<{ type: string; name: string }>;
    const fakeClientTool = tools.find((t) => t.type === 'function' && t.name === 'web_search');
    expect(fakeClientTool).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// G14 (AM5) — URL document blocks without media_type (the normal Anthropic
// wire shape: URL documents are PDFs and carry no media_type field) must not
// be forwarded as application/octet-stream — the AI SDK anthropic converter
// accepts URL file parts only as application/pdf or text/plain and throws
// UnsupportedFunctionalityError (→ gateway 500) for anything else.
// ---------------------------------------------------------------------------

// G14
describe('messages URL document defaults to application/pdf', () => {
  it('forwards a media_type-less URL document as application/pdf', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel('anthropic', createRecordingModel({
      onCall: (options) => { callOptions = options; },
    }));

    const { status } = await postMessages(app, {
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'summarize this' },
          { type: 'document', source: { type: 'url', url: 'https://example.com/doc.pdf' } },
        ],
      }],
    });

    expect(status).toBe(200);
    const userMessage = callOptions?.prompt.find((m) => m.role === 'user');
    const fileParts = (Array.isArray(userMessage?.content) ? userMessage.content : [])
      .filter((p): p is { type: 'file'; mediaType: string } => (p as { type: string }).type === 'file');
    expect(fileParts).toHaveLength(1);
    expect(fileParts[0]!.mediaType).toBe('application/pdf');
  });
});

// ---------------------------------------------------------------------------
// G15 (AM6) — `service_tier` must be forwarded on the request and emitted in
// response usage. Spec: request `service_tier: 'auto'|'standard_only'`;
// response `usage.service_tier: 'standard'|'priority'|'batch'`. NOTE: the
// current AI SDK anthropic package has no typed serviceTier language-model
// option (verified against ~/Documents/Code/ai — the finding's proposed
// `providerOptions.anthropic.serviceTier` key does not exist there), so the
// request-side assertion only requires the value to reach the upstream call's
// providerOptions under some namespace. Raw usage (incl. service_tier) comes
// back via `providerMetadata.anthropic.usage`.
// ---------------------------------------------------------------------------

// G15
describe('messages service_tier round trip', () => {
  // G15 — service_tier forwarded to the upstream call under providerOptions.unknown. See 056_full_gateway_review.
  it('forwards request service_tier to the upstream call', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel('anthropic', createRecordingModel({
      onCall: (options) => { callOptions = options; },
    }));

    const { status } = await postMessages(app, { service_tier: 'standard_only' });

    expect(status).toBe(200);
    // Namespace-agnostic: the fix may land under anthropic or the unknown
    // passthrough — what matters is the value reaches the provider call.
    expect(JSON.stringify(callOptions?.providerOptions ?? {})).toContain('standard_only');
  });

  // G15 — usage.service_tier emitted from providerMetadata.anthropic.usage. See 056_full_gateway_review.
  it('emits usage.service_tier from provider metadata on the response', async () => {
    const app = makeAppWithModel('anthropic', createRecordingModel({
      providerMetadata: {
        anthropic: {
          usage: { input_tokens: 5, output_tokens: 4, service_tier: 'standard' },
          stopSequence: null,
        },
      },
    }));

    const { status, body } = await postMessages(app, {});

    expect(status).toBe(200);
    expect(body).toHaveProperty('usage.service_tier', 'standard');
  });
});

// ---------------------------------------------------------------------------
// G16 (AM7 + AM23 + HE14) — Anthropic error envelope defects. Spec
// (platform.claude.com/docs/en/api/errors): 402 billing_error,
// 413 request_too_large, 504 timeout_error, 529 overloaded_error (reserved
// for 529 — a 502 from an OpenAI upstream is NOT "overloaded"), and every
// error body carries a top-level `request_id`. AM23: the streaming peek map
// (messages/handler.ts:390-397) re-materializes `overloaded_error` as 503
// while the envelope's inverse (envelope.ts:478) produces it from 529.
// ---------------------------------------------------------------------------

// G16 (+ AM23 / HE14)
describe('messages Anthropic error envelope fidelity', () => {
  function appWithUpstreamStatus(statusCode: number, message: string) {
    return makeAppWithModel('anthropic', createRecordingModel({
      error: createApiCallError({ message, statusCode }),
    }));
  }

  // G16 — 413 maps to request_too_large (envelope anthropicTypeForStatus). See 056_full_gateway_review.
  it('upstream 413 → request_too_large', async () => {
    const { status, body } = await postMessages(appWithUpstreamStatus(413, 'Request exceeds the maximum allowed number of bytes'), {});
    expect(status).toBe(413);
    expect(body).toHaveProperty('error.type', 'request_too_large');
  });

  // G16 — 402 maps to billing_error. See 056_full_gateway_review.
  it('upstream 402 → billing_error', async () => {
    const { status, body } = await postMessages(appWithUpstreamStatus(402, 'Payment required'), {});
    expect(status).toBe(402);
    expect(body).toHaveProperty('error.type', 'billing_error');
  });

  // G16 — 504 maps to timeout_error. See 056_full_gateway_review.
  it('upstream 504 → timeout_error', async () => {
    const { status, body } = await postMessages(appWithUpstreamStatus(504, 'Upstream timed out'), {});
    expect(status).toBe(504);
    expect(body).toHaveProperty('error.type', 'timeout_error');
  });

  // G16 — 502 maps to api_error; overloaded_error is reserved for 529. See 056_full_gateway_review.
  it('upstream 502 → api_error, not overloaded_error', async () => {
    const { status, body } = await postMessages(appWithUpstreamStatus(502, 'Bad gateway'), {});
    expect(status).toBe(502);
    expect(body).toHaveProperty('error.type', 'api_error');
  });

  // G16 — 529 passthrough is runtime-correct today (via the unchecked GatewayHttpStatus cast, envelope.ts:508); the HE14 type-level lie is not runtime-observable. Kept as passing evidence.
  it('upstream 529 passes through as 529 overloaded_error (runtime works despite GatewayHttpStatus excluding 529)', async () => {
    const { status, body } = await postMessages(appWithUpstreamStatus(529, 'Overloaded'), {});
    expect(status).toBe(529);
    expect(body).toHaveProperty('error.type', 'overloaded_error');
  });

  // G16 — top-level request_id field in the error body matches x-request-id header. See 056_full_gateway_review.
  it('error body carries a top-level request_id matching x-request-id', async () => {
    const { headers, body } = await postMessages(appWithUpstreamStatus(429, 'Rate limited'), {});
    const requestId = headers.get('x-request-id');
    expect(requestId).not.toBeNull();
    expect(body).toHaveProperty('request_id', requestId);
  });

  // G16/AM23 — peek map now maps overloaded_error→529 (shared statusForAnthropicErrorType). See 056_full_gateway_review.
  it('streaming pre-first-byte upstream 529 re-materializes as HTTP 529', async () => {
    const app = makeAppWithModel('anthropic', createRecordingModel({
      streamParts: [
        {
          type: 'error',
          error: Object.assign(new Error('Overloaded'), { statusCode: 529 }),
        } as unknown as LanguageModelV4StreamPart,
      ],
    }));

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

// ---------------------------------------------------------------------------
// G17 (AM8) — structured output must be forwarded: `output_config.format`
// (GA) with {type:'json_schema', schema} maps to the AI SDK's
// responseFormat {type:'json', schema} (which the anthropic provider turns
// back into output_config.format on the wire); today no reader exists and
// JSON mode silently no-ops with a 200.
// ---------------------------------------------------------------------------

// G17
describe('messages structured output forwarded upstream', () => {
  const schema = {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city'],
    additionalProperties: false,
  };

  it('forwards output_config.format json_schema as responseFormat {type: json, schema}', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    // Mock returns valid JSON text: generateText with `output` set eagerly
    // parses the final text (ai generate-text.ts parseCompleteOutput) and a
    // non-JSON reply would fail the request before the assertion lands.
    const app = makeAppWithModel('anthropic', createRecordingModel({
      text: '{"city":"Paris"}',
      onCall: (options) => { callOptions = options; },
    }));

    const { status } = await postMessages(app, {
      output_config: { format: { type: 'json_schema', schema } },
    });

    expect(status).toBe(200);
    expect(callOptions?.responseFormat).toEqual(expect.objectContaining({
      type: 'json',
      schema: expect.objectContaining({ type: 'object' }),
    }));
  });

  it('forwards deprecated top-level output_format as responseFormat {type: json, schema}', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel('anthropic', createRecordingModel({
      text: '{"city":"Paris"}',
      onCall: (options) => { callOptions = options; },
    }));

    const { status } = await postMessages(app, {
      output_format: { type: 'json_schema', schema },
    });

    expect(status).toBe(200);
    expect(callOptions?.responseFormat).toEqual(expect.objectContaining({ type: 'json' }));
  });
});

// ---------------------------------------------------------------------------
// G18 (AM9) — POLICY-DECISION. `metadata.user_id` is hard-rejected with a
// typed 400 (rejectUnsupportedMessagesParams, messages/handler.ts:309-322),
// which complies with the documented forward-or-400 rule (REASSESSMENT_2
// §1.4): the drop is explicit, typed, param-attributed, and int-tested
// (int.spec.ts:579) — not silent. Note for any future policy change: the AI
// SDK supports forwarding natively via
// `providerOptions.anthropic.metadata.userId` → `metadata: { user_id }`
// (anthropic-language-model.ts:495-496), so the compat-friendlier fix in
// AM9 is available. This test pins the current, policy-compliant behavior.
// ---------------------------------------------------------------------------

// G18
describe('messages metadata.user_id explicit 400', () => {
  // G18 POLICY — explicit typed 400 is forward-or-400 compliant; revisit only if the drop-in-compat decision is reversed. See 056_full_gateway_review.
  it('rejects metadata.user_id with a typed, param-attributed 400 (not a silent drop)', async () => {
    let upstreamCalled = false;
    const app = makeAppWithModel('anthropic', createRecordingModel({
      onCall: () => { upstreamCalled = true; },
    }));

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
