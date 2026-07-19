// Gateway E2E — /v1/responses (OpenAI Responses wire) against OpenCode Zen's
// FREE models.
//
// Responses-wire clients (the OpenAI SDK's modern surface) pointed at the
// gateway, translated live to Zen's OpenAI-compatible /chat/completions
// upstream. Covers the response envelope (string + message-array input),
// streaming event sequence, function tool calls, and the error envelope.
//
// Model notes (probed 2026-07-11): deepseek-v4-flash-free reasons (reasoning
// items/events appear on this wire) and calls tools reliably. See
// zen.chat.e2e.spec.ts header for the full probe.
//
// Known-bug interplay (dev/plans/frogbot_gateway/056_full_gateway_review):
//   - G7 — response id flips mid-stream (response.created resp_<uuid> vs
//     response.completed upstream id): it.fails real-model confirmation.
//   - G3 — function_call/function_call_output input items 400, making the
//     tool round trip impossible: it.fails real-model confirmation.
//
// Run: RUN_E2E=1 pnpm vitest run --project=gateway-e2e test/gateway/zen.responses.e2e.spec.ts
// Skips cleanly (does not fail) when RUN_E2E !== '1'.

import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import { buildProviderRegistry, type ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { parseSse } from '../__helpers/gateway/parse-sse.js';
import { postJson } from '../__helpers/gateway/post-json.js';

const OPENCODE_API_KEY = process.env.OPENCODE_API_KEY ?? 'public';
const RUN_E2E = process.env.RUN_E2E === '1';

const ZEN_BASE_URL = 'https://opencode.ai/zen/v1';
const MODEL = 'zen/deepseek-v4-flash-free';

const TEST_TIMEOUT = 90_000;

function makeZenApp() {
  const registry = buildProviderRegistry({}, [
    { name: 'zen', baseURL: ZEN_BASE_URL, apiKey: OPENCODE_API_KEY },
  ]) as ProviderRegistry;
  return createApp({ registry });
}

type OutputItem = {
  type?: string;
  id?: string;
  status?: string;
  role?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
  content?: Array<{ type?: string; text?: string }>;
};

type ResponsesBody = {
  id?: string;
  object?: string;
  status?: string;
  model?: string;
  output?: OutputItem[];
  output_text?: string;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
  error?: { message?: string; type?: string } | null;
};

type ResponsesEvent = {
  event?: string;
  data: {
    type?: string;
    sequence_number?: number;
    delta?: string;
    item?: OutputItem;
    response?: ResponsesBody;
  };
};

async function streamResponses(app: ReturnType<typeof makeZenApp>, body: Record<string, unknown>) {
  const res = await app.request('http://localhost/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, stream: true }),
  });
  return res;
}

function eventsOf(raw: string): ResponsesEvent[] {
  return parseSse(raw)
    .filter((f) => f.data !== '[DONE]')
    .map((f) => ({ event: f.event, data: JSON.parse(f.data) as ResponsesEvent['data'] }));
}

function findMessageItem(output: OutputItem[] | undefined): OutputItem | undefined {
  return (output ?? []).find((item) => item.type === 'message');
}

const WEATHER_TOOL = {
  type: 'function',
  name: 'get_weather',
  description: 'Get the current weather for a city',
  parameters: {
    type: 'object',
    properties: { city: { type: 'string', description: 'City name' } },
    required: ['city'],
  },
};

describe.skipIf(!RUN_E2E)('gateway E2E — Zen /v1/responses (Responses wire)', () => {
  const app = makeZenApp();

  // -------------------------------------------------------------------------
  // 16. Basic: input as string + instructions → response envelope.
  // -------------------------------------------------------------------------
  it(
    'string input + instructions → completed response envelope with usage',
    async () => {
      const { status, body } = await postJson<ResponsesBody>(app, '/v1/responses', {
        model: MODEL,
        input: 'Say hi',
        instructions: 'You are a terse assistant.',
        max_output_tokens: 1024,
      });

      expect(status).toBe(200);
      expect(typeof body.id).toBe('string');
      expect(body.id!.length).toBeGreaterThan(0);
      expect(body.object).toBe('response');
      expect(body.status).toBe('completed');

      const message = findMessageItem(body.output);
      expect(message).toBeDefined();
      expect(message!.role).toBe('assistant');
      const textPart = (message!.content ?? []).find((p) => p.type === 'output_text');
      expect(textPart).toBeDefined();
      expect(textPart!.text!.length).toBeGreaterThan(0);

      expect(typeof body.output_text).toBe('string');
      expect(body.output_text!.length).toBeGreaterThan(0);

      expect(body.usage?.input_tokens).toBeGreaterThan(0);
      expect(body.usage?.output_tokens).toBeGreaterThan(0);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 17. input as a message array (multi-turn with assistant history).
  // -------------------------------------------------------------------------
  it(
    'message-array input with assistant history → answer uses the history',
    async () => {
      const { status, body } = await postJson<ResponsesBody>(app, '/v1/responses', {
        model: MODEL,
        input: [
          { role: 'system', content: 'You are a terse assistant. Answer in as few words as possible.' },
          { role: 'user', content: [{ type: 'input_text', text: 'My name is Waldo.' }] },
          { role: 'assistant', content: [{ type: 'output_text', text: 'Nice to meet you, Waldo.' }] },
          { role: 'user', content: [{ type: 'input_text', text: 'What is my name? Reply with just the name.' }] },
        ],
        max_output_tokens: 1024,
      });

      expect(status).toBe(200);
      expect(body.status).toBe('completed');
      expect(typeof body.output_text).toBe('string');
      expect(body.output_text!.toLowerCase()).toContain('waldo');
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 18. Streaming: created → in_progress → output_item.added →
  //     output_text.delta* → output_item.done → completed, with monotonic
  //     sequence numbers and terminal usage. Reasoning events may interleave.
  // -------------------------------------------------------------------------
  it(
    'streaming emits the Responses event sequence with terminal usage',
    async () => {
      const res = await streamResponses(app, {
        model: MODEL,
        input: 'Say hi',
        max_output_tokens: 1024,
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      const events = eventsOf(await res.text());
      const names = events.map((e) => e.event);

      expect(names[0]).toBe('response.created');
      expect(names[1]).toBe('response.in_progress');
      expect(names[names.length - 1]).toBe('response.completed');

      // The message item lifecycle appears, in order.
      const added = names.indexOf('response.output_item.added');
      const done = names.lastIndexOf('response.output_item.done');
      expect(added).toBeGreaterThan(1);
      expect(done).toBeGreaterThan(added);

      // Text deltas accumulate to non-empty output.
      const text = events
        .filter((e) => e.event === 'response.output_text.delta')
        .map((e) => e.data.delta ?? '')
        .join('');
      expect(text.length).toBeGreaterThan(0);

      // sequence_number is 0..n monotonic across every event.
      const sequences = events.map((e) => e.data.sequence_number);
      expect(sequences).toEqual(sequences.map((_, i) => i));

      // Terminal usage on response.completed is real.
      const completed = events[events.length - 1]!.data.response;
      expect(completed?.status).toBe('completed');
      expect(completed?.usage?.input_tokens).toBeGreaterThan(0);
      expect(completed?.usage?.output_tokens).toBeGreaterThan(0);
    },
    TEST_TIMEOUT,
  );

  // G7 — real-model confirmation. The response id must be stable across the
  // stream: response.created and response.completed carry the SAME id.
  it(
    'streaming response id is stable created == completed (G7 — real-model confirmation)',
    async () => {
      const res = await streamResponses(app, {
        model: MODEL,
        input: 'Say hi',
        max_output_tokens: 1024,
      });

      expect(res.status).toBe(200);
      const events = eventsOf(await res.text());
      const created = events.find((e) => e.event === 'response.created')?.data.response;
      const completed = events.find((e) => e.event === 'response.completed')?.data.response;
      expect(created?.id).toBeTruthy();
      expect(completed?.id).toBeTruthy();
      expect(completed!.id).toBe(created!.id);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 19a. Function tool call: the model emits a function_call output item.
  // -------------------------------------------------------------------------
  it(
    'function tool: model emits a function_call output item (flaky-model tolerant)',
    async () => {
      const { status, body } = await postJson<ResponsesBody>(app, '/v1/responses', {
        model: MODEL,
        input: 'What is the weather in Paris? You MUST use the get_weather tool.',
        tools: [WEATHER_TOOL],
        tool_choice: 'auto',
        max_output_tokens: 1024,
      });

      expect(status).toBe(200);
      const call = (body.output ?? []).find((item) => item.type === 'function_call');

      if (!call) {
        console.warn('[zen.responses.e2e] model did not call the tool; asserting plain envelope instead');
        expect(body.object).toBe('response');
        expect(body.status).toBeTruthy();
        return;
      }

      expect(call.name).toBe('get_weather');
      expect(typeof call.call_id).toBe('string');
      expect(call.call_id!.length).toBeGreaterThan(0);
      const args = JSON.parse(call.arguments ?? '') as Record<string, unknown>;
      expect(typeof args).toBe('object');
    },
    TEST_TIMEOUT,
  );

  // 19b. G3 — real-model confirmation. The tool round trip: turn 2 sends
  // function_call + function_call_output input items back; today the input
  // schema 400s every non-message input item, so agentic Responses clients
  // cannot complete a tool loop at all. Items are hardcoded (no dependence on
  // the model calling the tool) so this fails deterministically on the schema
  // 400. Flip to it() when G3 is fixed.
  it(
    'tool round trip: function_call_output input items are accepted and answered (G3 — real-model confirmation)',
    async () => {
      const { status, body } = await postJson<ResponsesBody>(app, '/v1/responses', {
        model: MODEL,
        input: [
          { role: 'user', content: 'What is the weather in Paris? You MUST use the get_weather tool.' },
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
            output: '{"temperature":"18C","condition":"sunny"}',
          },
        ],
        tools: [WEATHER_TOOL],
        max_output_tokens: 1024,
      });

      expect(status, `expected 200, got ${status}: ${JSON.stringify(body)}`).toBe(200);
      expect(body.status).toBe('completed');
      expect(typeof body.output_text).toBe('string');
      expect(body.output_text!.length).toBeGreaterThan(0);
      // The final answer must reference the injected tool result.
      expect(body.output_text!).toMatch(/18|sunny/i);
    },
    TEST_TIMEOUT,
  );

  // G21 — real-model confirmation. The OpenAI Responses spec requires the
  // response envelope to echo back the always-present request-echo fields
  // (parallel_tool_calls, tool_choice, tools are required WITHOUT defaults in
  // openai-python's Response). Anything that re-validates our envelope
  // (Response.model_validate, LiteLLM chaining, typed SDKs) fails because the
  // gateway omits them. Assert the correct behavior: a 200 response echoes the
  // request's tools/tool_choice/parallel_tool_calls.
  it(
    'response envelope echoes spec-required tools/tool_choice/parallel_tool_calls (G21 — real-model confirmation)',
    async () => {
      const { status, body } = await postJson<ResponsesBody & {
        tools?: unknown[];
        tool_choice?: unknown;
        parallel_tool_calls?: boolean;
        temperature?: number;
        top_p?: number;
        instructions?: string | null;
      }>(app, '/v1/responses', {
        model: MODEL,
        input: 'Say hi',
        instructions: 'You are a terse assistant.',
        tools: [WEATHER_TOOL],
        tool_choice: 'auto',
        parallel_tool_calls: true,
        max_output_tokens: 1024,
      });

      expect(status).toBe(200);
      // The three spec-required-without-default echo fields must be present.
      expect(Array.isArray(body.tools)).toBe(true);
      expect(body.tool_choice).toBeDefined();
      expect(body.parallel_tool_calls).toBe(true);
    },
    TEST_TIMEOUT,
  );

  // G23 — real-model confirmation (KNOWN-DEFERRED mechanism, B6). Zen is a
  // NON-OpenAI provider, so the handler drops previous_response_id before
  // upstream (handler.ts gates the OpenAI options on providerName==='openai')
  // yet toResponse.ts still echoes previous_response_id back unconditionally.
  // The response claims it continued a conversation that was never loaded — a
  // behavioral lie. The honest fix is to reject with 400
  // unsupported_parameter_for_provider when the provider can't honor stateful
  // continuation. Assert that correct behavior. Flip to it() when fixed.
  it.fails(
    'rejects previous_response_id on a non-OpenAI provider instead of silently lying (G23 — real-model confirmation)',
    async () => {
      // Turn 1 — establish a fact and capture the response id.
      const first = await postJson<ResponsesBody>(app, '/v1/responses', {
        model: MODEL,
        input: 'Remember: the secret word is BANANA. Reply with just OK.',
        max_output_tokens: 1024,
      });
      expect(first.status).toBe(200);
      const priorId = first.body.id;
      expect(typeof priorId).toBe('string');

      // Turn 2 — reference the prior turn ONLY via previous_response_id, with
      // no re-inclusion of the fact in input. On a non-OpenAI provider the
      // gateway can't actually load that prior state, so the honest response
      // is a 400 rather than a 200 that echoes the id and answers blind.
      const { status, body } = await postJson<
        ResponsesBody & { error?: { code?: string; message?: string } | null }
      >(app, '/v1/responses', {
        model: MODEL,
        input: 'What was the secret word? Reply with just the word.',
        previous_response_id: priorId,
        max_output_tokens: 1024,
      });

      expect(status).toBe(400);
      expect(body.error?.code).toBe('unsupported_parameter_for_provider');
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 20. Error envelope shape on a bad model.
  // -------------------------------------------------------------------------
  it(
    'nonexistent model → well-formed error envelope',
    async () => {
      const { status, body } = await postJson<{ error?: { message?: string; type?: string } }>(
        app,
        '/v1/responses',
        {
          model: 'zen/does-not-exist-xyz',
          input: 'Say hi',
          max_output_tokens: 16,
        },
      );

      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(600);
      expect(body.error).toBeDefined();
      expect(typeof body.error!.message).toBe('string');
      expect(body.error!.message!.length).toBeGreaterThan(0);
    },
    TEST_TIMEOUT,
  );
});
