// P2 triage — /v1/messages findings G60–G69.
//
// Each `it.fails` is tagged // G## and marks a CONFIRMED bug.
// Each `it` (passing) is tagged // G## and marks a REJECTED finding.
// D-class findings (G61/G66/G69) are confirmed via grep evidence in comments.
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
// Shared harness
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
  usage?: typeof DEFAULT_USAGE;
  providerMetadata?: Record<string, Record<string, unknown>>;
  onCall?: (options: LanguageModelV4CallOptions) => void;
}): LanguageModelV4 {
  const { text = 'Hello', streamParts, finishReason = STOP_FINISH, usage = DEFAULT_USAGE, providerMetadata, onCall } = opts ?? {};
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
        usage,
        warnings: [],
        ...(providerMetadata ? { providerMetadata } : {}),
        response: {
          id: 'mock-msg-1',
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
        { type: 'finish', finishReason, usage, ...(providerMetadata ? { providerMetadata } : {}) },
      ]);
      return {
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            for (const part of parts) {controller.enqueue(part);}
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
// G60 — stop_sequence field echoes the matched sequence (FIXED)
// toAnthropicResponse now forwards providerMetadata.anthropic.stopSequence and
// mapStopReason prefers the raw `stop_sequence` finish reason, matching the
// AI SDK anthropic provider (map-anthropic-stop-reason.ts:16 folds raw
// stop_sequence into unified 'stop'; the metadata carries the matched string).
// ---------------------------------------------------------------------------

describe('G60 — stop_sequence response field always null', () => {
  it('stop_sequence field echoes the matched stop sequence', async () => {
    // Real anthropic provider shape for a stop-sequence halt: unified 'stop',
    // raw 'stop_sequence', matched sequence in providerMetadata.anthropic.
    const stopSequenceFinish = { unified: 'stop', raw: 'stop_sequence' };

    const app = makeAppWithModel('anthropic', createRecordingModel({
      finishReason: stopSequenceFinish,
      providerMetadata: { anthropic: { stopSequence: 'STOP' } },
    }));

    const { status, body } = await postJson(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'stop here' }],
      max_tokens: 128,
      stop_sequences: ['STOP'],
    });

    expect(status).toBe(200);
    // When stop_reason is 'stop_sequence', the stop_sequence field should be the matched sequence.
    const resp = body as Record<string, unknown>;
    expect(resp.stop_reason).toBe('stop_sequence');
    // stop_sequence should echo which one was matched, not null.
    expect(resp.stop_sequence, 'stop_sequence field should not be null when stop_reason is stop_sequence').not.toBeNull();
    expect(resp.stop_sequence).toBe('STOP');
  });
});

// ---------------------------------------------------------------------------
// G61 — stop-reason taxonomy (FIXED)
//
// mapStopReason now emits the raw upstream stop_reason verbatim when it is a
// known Anthropic wire literal (pause_turn, model_context_window_exceeded,
// compaction, ...), and maps unified 'other'/'error' to 'end_turn' instead of
// null. The Anthropic spec requires a non-null stop_reason on every completed
// non-streaming message.
// ---------------------------------------------------------------------------

describe('G61 — stop-reason taxonomy: other → null is spec-invalid', () => {
  it('non-streaming message never returns null stop_reason (G61)', async () => {
    const app = makeAppWithModel('anthropic', createRecordingModel({
      // AI SDK surfaces context-window / unmapped stops as finishReason 'other'
      finishReason: { unified: 'other', raw: 'model_context_window_exceeded' },
    }));

    const { status, body } = await postJson(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'a very long prompt' }],
      max_tokens: 128,
    });

    expect(status).toBe(200);
    const resp = body as Record<string, unknown>;
    // Anthropic clients switch on stop_reason; null breaks the discriminant.
    expect(resp.stop_reason, 'completed message must carry a non-null stop_reason').not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// G62 — usage detail fields (FIXED)
// toAnthropicResponse and the stream translator now emit
// `output_tokens_details.thinking_tokens` (from raw usage or the normalized
// outputTokenDetails.reasoningTokens) and the per-TTL `cache_creation`
// breakdown (from the raw provider usage; providerMetadata.anthropic.usage
// non-streaming, finish-step usage.raw streaming). Fields are omitted when the
// upstream provides no data — never backfilled with 0/0.
// ---------------------------------------------------------------------------

describe('G62 — usage detail fields on messages responses', () => {
  it('messages response includes output_tokens_details.thinking_tokens', async () => {
    const usageWithReasoning = {
      inputTokens: { total: 10, noCache: 10 },
      outputTokens: { total: 15, text: 10, reasoning: 5 },
    };

    const app = makeAppWithModel('anthropic', createRecordingModel({
      usage: usageWithReasoning,
    }));

    const { status, body } = await postJson(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'think before answering' }],
      max_tokens: 128,
    });

    expect(status).toBe(200);
    const resp = body as Record<string, unknown>;
    const usage = resp.usage as Record<string, unknown>;
    expect(usage).toBeDefined();
    // Anthropic's API surfaces thinking tokens in output_tokens_details
    expect(usage).toHaveProperty('output_tokens_details');
    const details = usage.output_tokens_details as Record<string, unknown>;
    expect(details.thinking_tokens).toBe(5);
  });

  it('messages response includes cache_creation breakdown from raw provider usage', async () => {
    const app = makeAppWithModel('anthropic', createRecordingModel({
      providerMetadata: {
        anthropic: {
          usage: {
            input_tokens: 5,
            output_tokens: 4,
            cache_creation_input_tokens: 248,
            cache_creation: { ephemeral_5m_input_tokens: 148, ephemeral_1h_input_tokens: 100 },
          },
          stopSequence: null,
        },
      },
    }));

    const { status, body } = await postJson(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'cache this' }],
      max_tokens: 128,
    });

    expect(status).toBe(200);
    const usage = (body as Record<string, unknown>).usage as Record<string, unknown>;
    expect(usage.cache_creation).toEqual({
      ephemeral_5m_input_tokens: 148,
      ephemeral_1h_input_tokens: 100,
    });
  });

  it('streaming message_delta includes thinking_tokens and cache_creation breakdown', async () => {
    const streamParts = [
      { type: 'stream-start', warnings: [] },
      { type: 'text-start', id: 'text-0' },
      { type: 'text-delta', id: 'text-0', delta: 'Hello' },
      { type: 'text-end', id: 'text-0' },
      {
        type: 'finish',
        finishReason: STOP_FINISH,
        usage: {
          inputTokens: { total: 10, noCache: 8, cacheRead: 0, cacheWrite: 2 },
          outputTokens: { total: 15, text: 10, reasoning: 5 },
          raw: {
            input_tokens: 8,
            output_tokens: 15,
            cache_creation_input_tokens: 248,
            cache_creation: { ephemeral_5m_input_tokens: 148, ephemeral_1h_input_tokens: 100 },
            output_tokens_details: { thinking_tokens: 5 },
          },
        },
      },
    ] as unknown as LanguageModelV4StreamPart[];

    const app = makeAppWithModel('anthropic', createRecordingModel({ streamParts }));
    const { status, text } = await postRaw(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'think before answering' }],
      max_tokens: 128,
      stream: true,
    });

    expect(status).toBe(200);
    const deltaFrame = parseSse(text).find((f) => f.event === 'message_delta');
    expect(deltaFrame).toBeDefined();
    const usage = (JSON.parse(deltaFrame!.data) as Record<string, unknown>).usage as Record<string, unknown>;
    expect(usage).toHaveProperty('output_tokens_details.thinking_tokens', 5);
    expect(usage.cache_creation).toEqual({
      ephemeral_5m_input_tokens: 148,
      ephemeral_1h_input_tokens: 100,
    });
  });

  it('omits output_tokens_details and cache_creation when the upstream provides neither', async () => {
    const app = makeAppWithModel('anthropic', createRecordingModel());

    const { status, body } = await postJson(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 128,
    });

    expect(status).toBe(200);
    const usage = (body as Record<string, unknown>).usage as Record<string, unknown>;
    // Never backfill 0/0 — omit the fields when the upstream has no data.
    expect(usage).not.toHaveProperty('output_tokens_details');
    expect(usage).not.toHaveProperty('cache_creation');
  });
});

// ---------------------------------------------------------------------------
// G63 — tool strict + cache_control (FIXED)
// toAISDKTools (messages/translators/tools.ts) forwards per-tool cache_control
// via tool.providerOptions.anthropic.cacheControl and passes `strict` through.
// ---------------------------------------------------------------------------

describe('G63 — messages tools: strict and cache_control forwarded', () => {
  // G63 — per-tool cache_control rides tool.providerOptions.anthropic.cacheControl
  // (AI SDK anthropic-prepare-tools.ts + get-cache-control.ts:15-18).
  it('tool cache_control reaches upstream providerOptions', async () => {
    let capturedOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel('anthropic', createRecordingModel({
      onCall: (options) => { capturedOptions = options; },
    }));

    const { status } = await postJson(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'call a tool' }],
      max_tokens: 128,
      tools: [{
        name: 'get_weather',
        description: 'Get weather',
        input_schema: { type: 'object', properties: { city: { type: 'string' } } },
        cache_control: { type: 'ephemeral' },
      }],
    });

    expect(status).toBe(200);
    const toolsStr = JSON.stringify(capturedOptions?.tools ?? {});
    // AI SDK Anthropic provider reads per-tool cache_control from
    // tool.providerOptions.anthropic.cacheControl (get-cache-control.ts:15-18
    // prefers `cacheControl`, snake `cache_control` also accepted). Tools are
    // NOT run through forwardMessageProviderOptions (that only walks messages),
    // so a correct fix sets `cacheControl` directly under the `anthropic`
    // namespace — asserting snake `cache_control` would enforce the wrong key.
    expect(toolsStr).toContain('ephemeral');
    expect(toolsStr).toContain('anthropic');
    expect(toolsStr).toContain('cacheControl');
  });
});

// ---------------------------------------------------------------------------
// G64 — assistant-side cache_control (FIXED)
// parseAssistantMessage (messages/translators/toModelMessages/assistant.ts)
// attaches providerOptions.unknown.cache_control to text and tool_use parts;
// forwardMessageProviderOptions re-homes it to the provider namespace.
// ---------------------------------------------------------------------------

describe('G64 — assistant cache_control forwarded in messages route', () => {
  // G64 — assistant text/tool_use blocks mirror the user-side cache_control pattern.
  it('assistant message cache_control reaches upstream providerOptions', async () => {
    let capturedOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel('anthropic', createRecordingModel({
      onCall: (options) => { capturedOptions = options; },
    }));

    const { status } = await postJson(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [
        { role: 'user', content: 'hi' },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'I will help you.', cache_control: { type: 'ephemeral' } }],
        },
        { role: 'user', content: 'continue' },
      ],
      max_tokens: 128,
    });

    expect(status).toBe(200);
    const assistantMsg = capturedOptions?.prompt.find((m) => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    const promptStr = JSON.stringify(capturedOptions?.prompt ?? {});
    expect(promptStr, 'assistant cache_control not forwarded').toContain('ephemeral');
  });
});

// ---------------------------------------------------------------------------
// G65 — system block array cache breakpoints (FIXED)
// parseSystemParam (messages/translators/toModelMessages/system.ts) emits one
// system message per block, each carrying its own cache_control. AI SDK
// SystemModelMessage.content is string-only, and the anthropic provider emits
// one system text block per system message (convert-to-anthropic-prompt.ts
// system case), so N blocks round-trip as N wire blocks with N breakpoints.
// ---------------------------------------------------------------------------

describe('G65 — system block array: cache_control breakpoints preserved', () => {
  // G65 — each system block becomes its own system message with its own
  // providerOptions.anthropic.cacheControl after namespace forwarding.
  it('multiple system blocks with cache_control produce separate cache breakpoints', async () => {
    let capturedOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel('anthropic', createRecordingModel({
      onCall: (options) => { capturedOptions = options; },
    }));

    const { status } = await postJson(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 128,
      system: [
        { type: 'text', text: 'Block A', cache_control: { type: 'ephemeral' } },
        { type: 'text', text: 'Block B' },
        { type: 'text', text: 'Block C', cache_control: { type: 'ephemeral' } },
      ],
    });

    expect(status).toBe(200);
    // Two blocks carry cache_control, so the prompt must carry two cache
    // breakpoints. Since SystemModelMessage.content is string-only, that means
    // multiple system messages (each with its own cacheControl), not one.
    const prompt = capturedOptions?.prompt ?? [];
    const systemMsgs = prompt.filter((m) => m.role === 'system');
    const cacheBreakpoints = systemMsgs.filter((m) => {
      const anthropic = (m.providerOptions as Record<string, Record<string, unknown>> | undefined)?.anthropic;
      return anthropic?.cacheControl !== undefined;
    });
    expect(cacheBreakpoints.length, 'both system cache_control breakpoints should survive').toBe(2);
  });
});

// ---------------------------------------------------------------------------
// G66 — grouped top-level drops (FIXED for mcp_servers/container/cache_control)
//
// A client sending Anthropic's `mcp_servers` (remote MCP tool servers) expects
// the gateway to forward it to the upstream. The messages schema now models
// mcp_servers/container/cache_control and the handler maps them onto the
// SDK-read providerOptions.anthropic namespace (camelCase keys per
// anthropic-language-model-options.ts).
// ---------------------------------------------------------------------------

describe('G66 — top-level mcp_servers forwarded', () => {
  // G66 — mcp_servers → providerOptions.anthropic.mcpServers.
  it('mcp_servers reaches upstream providerOptions (G66)', async () => {
    let capturedOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel('anthropic', createRecordingModel({
      onCall: (options) => { capturedOptions = options; },
    }));

    const { status } = await postJson(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'use my mcp tools' }],
      max_tokens: 128,
      mcp_servers: [{ type: 'url', url: 'https://mcp.example.com', name: 'my-tools' }],
    });

    expect(status).toBe(200);
    const anthropicOpts = capturedOptions?.providerOptions?.anthropic as Record<string, unknown> | undefined;
    // The MCP servers must reach the provider; otherwise the client's tools vanish.
    expect(anthropicOpts?.mcpServers ?? anthropicOpts?.mcp_servers).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// G67 — streaming block indices: emission order only
// stream.ts comment (line 15) documents this as a design decision.
// The monotonic counter means an upstream that uses non-sequential block ids
// gets re-sequenced by emission order. This is observable but by design.
// The finding asks to confirm this is emission-order only — confirmed.
// DEFERRED as policy/design decision (stream.ts explicitly chooses this).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// G68 — empty upstream stream produces invalid wire on messages route.
// messages/handler.ts:185-191: if peekAnthropicStream returns undefined (no
// chunks), the handler returns createSseResponse(toSseStream(new ReadableStream,
// {appendDone:false})) which emits nothing — no message_start, no message_stop.
// The Anthropic spec requires at minimum message_start + message_stop.
// ---------------------------------------------------------------------------

describe('G68 — empty upstream stream produces invalid messages wire', () => {
  // G68 — messages handler !peeked branch (handler.ts:185) returns empty SSE with no message_start/message_stop; flip to it() when fixed.
  it.fails('empty upstream stream emits valid message_start + message_stop', async () => {
    // A model whose doStream returns a stream with zero parts.
    const emptyStreamModel: LanguageModelV4 = {
      specificationVersion: 'v4',
      provider: 'mock',
      modelId: 'mock-model',
      get supportedUrls() { return Promise.resolve({}); },
      doGenerate: async () => {
        throw new Error('non-streaming not expected in this test');
      },
      doStream: async () => ({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            // Emit nothing — empty stream
            controller.close();
          },
        }),
      }),
    };

    const app = makeAppWithModel('anthropic', emptyStreamModel);
    const { status, text } = await postRaw(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 128,
      stream: true,
    });

    expect(status).toBe(200);
    const events = parseSse(text).map((f) => f.event).filter(Boolean);
    expect(events, 'empty stream must emit at least message_start + message_stop').toContain('message_start');
    expect(events).toContain('message_stop');
  });

  // G68 — chat handler !peeked branch (handler.ts:184): an empty stream (no parts) causes the AI SDK to
  // throw "Stream finished with an error" and the handler returns 500 instead of a graceful [DONE].
  // appendDone:true only fires if the stream reach the normal done path; it never does with zero parts.
  it.fails('empty upstream stream on chat completions emits at least [DONE]', async () => {
    const emptyStreamModel: LanguageModelV4 = {
      specificationVersion: 'v4',
      provider: 'mock',
      modelId: 'mock-model',
      get supportedUrls() { return Promise.resolve({}); },
      doGenerate: async () => {
        throw new Error('non-streaming not expected in this test');
      },
      doStream: async () => ({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.close();
          },
        }),
      }),
    };

    const app = makeAppWithModel('openai', emptyStreamModel);
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
    const text = await res.text();
    expect(text).toContain('[DONE]');
  });
});

// ---------------------------------------------------------------------------
// G69 — document title not plumbed (user-scenario)
//
// A client attaches a document block with a `title` (which Anthropic uses to
// label the source in citations). The schema accepts `title` (schema.ts:92)
// but the user translator (toModelMessages/user.ts document case) maps only
// `source` → file/text part and drops `title`. The model never sees the
// document label, so any citation it produces references an untitled source.
// We assert the title survives into the file part's provider metadata.
// ---------------------------------------------------------------------------

describe('G69 — document title dropped in translation', () => {
  // G69 — user.ts document case forwards block.title/citations/context to the
  // file part's providerOptions.anthropic so the model receives the label.
  it('document block title reaches the model (G69)', async () => {
    let capturedOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel('anthropic', createRecordingModel({
      onCall: (options) => { capturedOptions = options; },
    }));

    const { status } = await postJson(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      max_tokens: 128,
      messages: [{
        role: 'user',
        content: [{
          type: 'document',
          title: 'Q3 Financials',
          source: { type: 'text', media_type: 'text/plain', data: 'revenue up 12%' },
        }],
      }],
    });

    expect(status).toBe(200);
    // Find the file/text part the document was translated into and confirm the
    // title survived somewhere on it (providerOptions or a filename).
    const prompt = capturedOptions?.prompt ?? [];
    const serialized = JSON.stringify(prompt);
    expect(serialized, 'document title should be forwarded to the model').toContain('Q3 Financials');
  });
});

// ---------------------------------------------------------------------------
// G49 — streaming messages SSE responses must carry x-request-id, matching the
// non-streaming path. createSseResponse now merges the handler's requestId into
// the SSE response headers.
// ---------------------------------------------------------------------------

describe('G49 — x-request-id present on streaming messages SSE response', () => {
  // G49 — createSseResponse merges requestId into SSE headers; streaming parity with non-streaming.
  it('streaming messages response includes x-request-id header', async () => {
    const app = makeAppWithModel('anthropic', createRecordingModel());
    const { status, headers } = await postRaw(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 128,
      stream: true,
    });

    expect(status).toBe(200);
    expect(headers.get('x-request-id'), 'streaming messages SSE response missing x-request-id').not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// G51 (S17 ← S2/G5) — composed-wire terminal-frame count on a successful
// messages stream. The Anthropic wire terminates with `message_stop` and this
// route sets appendDone:false, so the OpenAI-only `data: [DONE]` sentinel must
// NEVER appear here (findings/01_streaming_sse.md: "[DONE] scoping: OpenAI-only").
// Guards the S2/G5 class of duplicate/leaked terminal sentinels for /v1/messages.
// ---------------------------------------------------------------------------

describe('G51 — messages stream terminal-frame count', () => {
  // G51 — exactly one message_stop, zero [DONE] on a successful stream.
  it('terminates with exactly one message_stop and no [DONE] sentinel', async () => {
    const app = makeAppWithModel('anthropic', createRecordingModel());
    const { status, text } = await postRaw(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 128,
      stream: true,
    });

    expect(status).toBe(200);
    const stopFrames = parseSse(text).filter((f) => f.event === 'message_stop');
    expect(stopFrames, 'messages stream must terminate with exactly one message_stop').toHaveLength(1);
    const doneCount = (text.match(/^data: \[DONE\]$/gm) ?? []).length;
    expect(doneCount, 'messages wire must not carry the OpenAI-only [DONE] sentinel').toBe(0);
  });
});
