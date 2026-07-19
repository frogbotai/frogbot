// Gateway E2E — /v1/chat/completions against OpenCode Zen's FREE hosted models.
//
// Realistic OpenAI-wire client behaviors against a REAL upstream: multi-turn
// conversations, the full agentic tool loop, streaming (incl. usage, tool-call
// delta accumulation, client abort), sampling/stop params, error envelopes,
// and concurrent streams.
//
// Model probe results (2026-07-11):
//   - deepseek-v4-flash-free — reasoning model (reasoning_content burns tokens;
//     always budget max_tokens >= 1024). Calls tools reliably. PRIMARY.
//   - big-pickle — also emits reasoning; honors tiny max_tokens with
//     finish_reason 'length' and exact completion_tokens. TINY/secondary.
//   - nemotron-3-super-free is GONE from the catalog (replaced by
//     nemotron-3-ultra-free); do not depend on it.
//
// Known-bug interplay (dev/plans/frogbot_gateway/056_full_gateway_review):
//   - G53 — stream_options.include_usage semantics: FIXED — real-model confirmation of the dedicated empty-choices usage chunk.
//   - G5  — double [DONE]: presence (>=1) asserted, exactly-once NOT (smoke file owns the note).
//   - G1  — response_format no-op: SKIPPED here; a real model can comply with
//     "reply in JSON" by chance and we cannot introspect what was sent
//     upstream, so a live test can neither prove nor disprove the drop.
//     review056.int.spec.ts owns the G1 proof at the AI SDK seam.
//
// Run: RUN_E2E=1 pnpm vitest run --project=gateway-e2e test/gateway/zen.chat.e2e.spec.ts
// Skips cleanly (does not fail) when RUN_E2E !== '1'.

import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import { buildProviderRegistry, type ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { parseSse } from '../__helpers/gateway/parse-sse.js';
import { postJson } from '../__helpers/gateway/post-json.js';

const OPENCODE_API_KEY = process.env.OPENCODE_API_KEY ?? 'public';
const RUN_E2E = process.env.RUN_E2E === '1';

const ZEN_BASE_URL = 'https://opencode.ai/zen/v1';
// Primary: reliable tool-caller. Reasoning model — generous budgets everywhere.
const MODEL = 'zen/deepseek-v4-flash-free';
// Secondary: used where deepseek's reasoning interferes (tiny-budget test) and
// to spread load on the concurrency test.
const TINY_MODEL = 'zen/big-pickle';

const TEST_TIMEOUT = 90_000;

function makeZenApp() {
  const registry = buildProviderRegistry({}, [
    { name: 'zen', baseURL: ZEN_BASE_URL, apiKey: OPENCODE_API_KEY },
  ]) as ProviderRegistry;
  return createApp({ registry });
}

type ToolCall = {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
};

type ChatCompletionBody = {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: Array<{
    message?: { role?: string; content?: string | null; tool_calls?: ToolCall[] };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

type ToolCallDelta = {
  index?: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
};

type ChatChunk = {
  id?: string;
  model?: string;
  choices?: Array<{
    delta?: { role?: string; content?: string; tool_calls?: ToolCallDelta[] };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
};

type ErrorBody = {
  error?: { message?: string; type?: string; param?: string; code?: string };
};

async function streamChat(app: ReturnType<typeof makeZenApp>, body: Record<string, unknown>, init?: RequestInit) {
  const res = await app.request('http://localhost/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, stream: true }),
    ...init,
  });
  return res;
}

function chunksOf(raw: string): ChatChunk[] {
  return parseSse(raw)
    .filter((f) => f.data !== '[DONE]')
    .map((f) => JSON.parse(f.data) as ChatChunk);
}

const WEATHER_TOOL = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'Get the current weather for a city',
    parameters: {
      type: 'object',
      properties: { city: { type: 'string', description: 'City name' } },
      required: ['city'],
    },
  },
};

const TIME_TOOL = {
  type: 'function',
  function: {
    name: 'get_time',
    description: 'Get the current local time for a city',
    parameters: {
      type: 'object',
      properties: { city: { type: 'string', description: 'City name' } },
      required: ['city'],
    },
  },
};

const POPULATION_TOOL = {
  type: 'function',
  function: {
    name: 'get_population',
    description: 'Get the population of a country',
    parameters: {
      type: 'object',
      properties: { country: { type: 'string', description: 'Country name' } },
      required: ['country'],
    },
  },
};

describe.skipIf(!RUN_E2E)('gateway E2E — Zen /v1/chat/completions realistic client behaviors', () => {
  const app = makeZenApp();

  // -------------------------------------------------------------------------
  // 1. Multi-turn conversation with a system prompt and prior assistant turn —
  //    the most common call shape in existence.
  // -------------------------------------------------------------------------
  // G155 regression guard — system prompts must work on this route.
  it(
    'multi-turn conversation with system prompt and assistant history',
    async () => {
      const { status, body } = await postJson<ChatCompletionBody>(app, '/v1/chat/completions', {
        model: MODEL,
        messages: [
          { role: 'system', content: 'You are a terse assistant. Answer in as few words as possible.' },
          { role: 'user', content: 'My name is Waldo.' },
          { role: 'assistant', content: 'Nice to meet you, Waldo.' },
          { role: 'user', content: 'What is my name? Reply with just the name.' },
        ],
        max_tokens: 1024,
      });

      expect(status).toBe(200);
      expect(body.object).toBe('chat.completion');
      const content = body.choices?.[0]?.message?.content;
      expect(typeof content).toBe('string');
      expect(content!.length).toBeGreaterThan(0);
      // The model must actually use the conversation history.
      expect(content!.toLowerCase()).toContain('waldo');
      expect(body.choices?.[0]?.finish_reason).toBe('stop');
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 2. FULL AGENTIC TOOL LOOP — turn 1 returns tool_calls, turn 2 sends the
  //    role:'tool' result back, final answer references it. THE core agent
  //    pattern.
  // -------------------------------------------------------------------------
  it(
    'full agentic tool loop: tool_calls → role:tool result → final answer references it',
    async () => {
      const turn1Messages = [
        { role: 'user', content: 'What is the weather in Paris? You MUST use the get_weather tool.' },
      ];
      const turn1 = await postJson<ChatCompletionBody>(app, '/v1/chat/completions', {
        model: MODEL,
        messages: turn1Messages,
        tools: [WEATHER_TOOL],
        tool_choice: 'auto',
        max_tokens: 1024,
      });

      expect(turn1.status).toBe(200);
      const choice = turn1.body.choices?.[0];
      expect(choice).toBeDefined();

      if (choice!.finish_reason !== 'tool_calls' || !choice!.message?.tool_calls?.length) {
        console.warn(
          `[zen.chat.e2e] model did not call the tool (finish_reason=${String(choice!.finish_reason)}); ` +
            'skipping loop turn 2',
        );
        expect(choice!.finish_reason).toBeTruthy();
        return;
      }

      const call = choice!.message.tool_calls[0]!;
      expect(typeof call.id).toBe('string');
      expect(call.function?.name).toBe('get_weather');
      const args = JSON.parse(call.function!.arguments!) as Record<string, unknown>;
      expect(typeof args).toBe('object');

      // Turn 2 — echo the assistant turn + tool result, ask for the final answer.
      const turn2 = await postJson<ChatCompletionBody>(app, '/v1/chat/completions', {
        model: MODEL,
        messages: [
          ...turn1Messages,
          {
            role: 'assistant',
            content: choice!.message.content ?? null,
            tool_calls: [
              {
                id: call.id,
                type: 'function',
                function: { name: call.function!.name, arguments: call.function!.arguments },
              },
            ],
          },
          {
            role: 'tool',
            tool_call_id: call.id,
            content: '{"temperature":"18C","condition":"sunny"}',
          },
        ],
        tools: [WEATHER_TOOL],
        max_tokens: 1024,
      });

      expect(turn2.status).toBe(200);
      const final = turn2.body.choices?.[0];
      expect(final?.finish_reason).toBe('stop');
      const finalText = final?.message?.content ?? '';
      expect(finalText.length).toBeGreaterThan(0);
      // The final answer must reference the tool result we injected.
      expect(finalText).toMatch(/18|sunny/i);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 3. Streaming + stream_options.include_usage.
  // -------------------------------------------------------------------------
  it(
    'streaming carries real usage numbers on the wire',
    async () => {
      const res = await streamChat(app, {
        model: MODEL,
        messages: [{ role: 'user', content: 'Say hi' }],
        max_tokens: 1024,
        stream_options: { include_usage: true },
      });

      expect(res.status).toBe(200);
      const raw = await res.text();
      const frames = parseSse(raw);
      const chunks = chunksOf(raw);

      const usageChunk = chunks.find((c) => c.usage && typeof c.usage.prompt_tokens === 'number');
      expect(usageChunk).toBeDefined();
      expect(usageChunk!.usage!.prompt_tokens).toBeGreaterThan(0);
      expect(usageChunk!.usage!.completion_tokens).toBeGreaterThan(0);

      // [DONE] present (G5 double-[DONE] tracked in the smoke file — presence only).
      expect(frames.some((f) => f.data === '[DONE]')).toBe(true);
    },
    TEST_TIMEOUT,
  );

  // G53 — real-model confirmation. OpenAI semantics for
  // stream_options.include_usage: the usage arrives on a FINAL EXTRA chunk with
  // `choices: []`. Fixed: the gateway now emits a dedicated empty-choices usage
  // chunk before [DONE] when include_usage is requested.
  it(
    'stream_options.include_usage emits a usage-only chunk with empty choices (G53 — real-model confirmation)',
    async () => {
      const res = await streamChat(app, {
        model: MODEL,
        messages: [{ role: 'user', content: 'Say hi' }],
        max_tokens: 1024,
        stream_options: { include_usage: true },
      });

      expect(res.status).toBe(200);
      const chunks = chunksOf(await res.text());
      const usageChunk = chunks.find((c) => c.usage && typeof c.usage.prompt_tokens === 'number');
      expect(usageChunk).toBeDefined();
      // Spec: the usage chunk is an extra terminal chunk with no choices.
      expect(usageChunk!.choices ?? []).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 4. Streaming tool call — accumulate tool_calls deltas into valid JSON.
  // -------------------------------------------------------------------------
  it(
    'streaming tool call: deltas accumulate to a valid tool call (flaky-model tolerant)',
    async () => {
      const res = await streamChat(app, {
        model: MODEL,
        messages: [{ role: 'user', content: 'What is the weather in Paris? You MUST use the get_weather tool.' }],
        tools: [WEATHER_TOOL],
        tool_choice: 'auto',
        max_tokens: 1024,
      });

      expect(res.status).toBe(200);
      const chunks = chunksOf(await res.text());
      expect(chunks.length).toBeGreaterThan(0);

      // Accumulate tool_calls deltas keyed by index, OpenAI-client style.
      const acc = new Map<number, { id: string; name: string; args: string }>();
      for (const chunk of chunks) {
        for (const delta of chunk.choices?.[0]?.delta?.tool_calls ?? []) {
          const index = delta.index ?? 0;
          const entry = acc.get(index) ?? { id: '', name: '', args: '' };
          if (delta.id) entry.id = delta.id;
          if (delta.function?.name) entry.name += delta.function.name;
          if (delta.function?.arguments) entry.args += delta.function.arguments;
          acc.set(index, entry);
        }
      }

      if (acc.size === 0) {
        console.warn('[zen.chat.e2e] model did not stream a tool call; asserting plain stream shape instead');
        const finishReasons = chunks
          .map((c) => c.choices?.[0]?.finish_reason)
          .filter((r): r is string => typeof r === 'string');
        expect(finishReasons.length).toBeGreaterThan(0);
        return;
      }

      const call = acc.get(0)!;
      expect(call.id.length).toBeGreaterThan(0);
      expect(call.name).toBe('get_weather');
      const args = JSON.parse(call.args) as Record<string, unknown>;
      expect(typeof args).toBe('object');

      const finishReasons = chunks
        .map((c) => c.choices?.[0]?.finish_reason)
        .filter((r): r is string => typeof r === 'string');
      expect(finishReasons).toContain('tool_calls');
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 5a. Stop sequences: the upstream must cut generation at the stop sequence
  //     (the text after it never appears; the sequence itself is excluded).
  // -------------------------------------------------------------------------
  it(
    'stop sequence cuts generation before the post-stop text',
    async () => {
      const { status, body } = await postJson<ChatCompletionBody>(app, '/v1/chat/completions', {
        model: MODEL,
        messages: [{ role: 'user', content: 'Repeat this exact sentence and nothing else: alpha BANANA omega' }],
        stop: ['BANANA'],
        max_tokens: 1024,
      });

      expect(status).toBe(200);
      const choice = body.choices?.[0];
      expect(choice?.finish_reason).toBeTruthy();
      const content = choice?.message?.content ?? '';
      if (content.length === 0) {
        // Reasoning models can hit the stop sequence inside reasoning_content,
        // leaving the visible content empty. Wire-legal — warn, don't fail.
        console.warn('[zen.chat.e2e] stop sequence produced empty content (stop hit during reasoning?)');
      }
      // The text after the stop sequence must never reach the client.
      expect(content).not.toContain('omega');
      expect(content).not.toContain('BANANA');
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 5b. temperature: 0 accepted + max_tokens honored → finish_reason 'length'.
  //     Uses big-pickle: deepseek's reasoning burns the tiny budget invisibly.
  // -------------------------------------------------------------------------
  it(
    'temperature 0 + tiny max_tokens → finish_reason length, completion_tokens capped',
    async () => {
      const { status, body } = await postJson<ChatCompletionBody>(app, '/v1/chat/completions', {
        model: TINY_MODEL,
        messages: [{ role: 'user', content: 'Count from 1 to 100 separated by spaces.' }],
        temperature: 0,
        max_tokens: 16,
      });

      expect(status).toBe(200);
      expect(body.choices?.[0]?.finish_reason).toBe('length');
      expect(body.usage?.completion_tokens).toBeGreaterThan(0);
      expect(body.usage?.completion_tokens).toBeLessThanOrEqual(16);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 6. response_format json_object — G1 (response_format silently dropped).
  //    SKIPPED as a live test: a real model can produce valid JSON by chance
  //    (prompt-following), and we cannot introspect what the gateway sent
  //    upstream, so a green JSON.parse here would NOT prove response_format
  //    was forwarded — and a red one would flake. The mock-seam proof lives in
  //    review056.int.spec.ts (G1). Re-enable only if a deterministic live
  //    oracle for "JSON mode active" exists.
  // -------------------------------------------------------------------------
  it.skip('response_format json_object yields parseable JSON (G1 — unprovable against a live model)', () => {
    // intentionally empty — see comment above
  });

  // -------------------------------------------------------------------------
  // 7. Client abort mid-stream — real-upstream abort-chain exercise.
  // -------------------------------------------------------------------------
  it(
    'client abort mid-stream terminates cleanly without crashing the app',
    async () => {
      const controller = new AbortController();
      const res = await streamChat(
        app,
        {
          model: MODEL,
          messages: [{ role: 'user', content: 'Write a long story about a frog. At least 500 words.' }],
          max_tokens: 2048,
        },
        { signal: controller.signal },
      );

      expect(res.status).toBe(200);
      const reader = res.body!.getReader();

      // Read a couple of chunks, then abort mid-stream.
      await reader.read();
      await reader.read();
      controller.abort();

      // The stream must terminate (done or abort rejection) — not hang, not crash.
      let terminated = false;
      try {
        // Bounded loop: a broken abort chain that keeps streaming to completion
        // still terminates via done; a hang is caught by the test timeout.
        for (;;) {
          const { done } = await reader.read();
          if (done) {
            terminated = true;
            break;
          }
        }
      } catch {
        terminated = true; // abort rejection is a clean termination
      }
      expect(terminated).toBe(true);

      // The app must still serve requests after the abort (no crashed state).
      const after = await postJson<ErrorBody>(app, '/v1/chat/completions', {
        model: 'zen/does-not-exist-xyz',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 16,
      });
      expect(after.status).toBeGreaterThanOrEqual(400);
      expect(after.body.error).toBeDefined();
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 8. Error envelopes: unprefixed model id, empty messages array.
  //    (Bad-but-prefixed model id is covered by the smoke suite.)
  // -------------------------------------------------------------------------
  it(
    'model id without provider prefix → 400 invalid_model_id',
    async () => {
      const { status, body } = await postJson<ErrorBody>(app, '/v1/chat/completions', {
        model: 'big-pickle',
        messages: [{ role: 'user', content: 'Say hi' }],
        max_tokens: 16,
      });

      expect(status).toBe(400);
      expect(body.error?.code).toBe('invalid_model_id');
      expect(typeof body.error?.message).toBe('string');
    },
    TEST_TIMEOUT,
  );

  it(
    'empty messages array → 400 invalid_request_error at param messages',
    async () => {
      const { status, body } = await postJson<ErrorBody>(app, '/v1/chat/completions', {
        model: MODEL,
        messages: [],
        max_tokens: 16,
      });

      expect(status).toBe(400);
      expect(body.error?.type).toBe('invalid_request_error');
      expect(body.error?.param).toBe('messages');
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 9. Concurrency: three simultaneous streams complete independently.
  // -------------------------------------------------------------------------
  it(
    'three concurrent streams all complete independently',
    async () => {
      const prompts = ['Say hi', 'Name one color.', 'Say goodbye'];
      const results = await Promise.all(
        prompts.map(async (content) => {
          const res = await streamChat(app, {
            model: TINY_MODEL,
            messages: [{ role: 'user', content }],
            max_tokens: 1024,
          });
          const raw = await res.text();
          return { status: res.status, chunks: chunksOf(raw), raw };
        }),
      );

      for (const result of results) {
        expect(result.status).toBe(200);
        const text = result.chunks.map((c) => c.choices?.[0]?.delta?.content ?? '').join('');
        expect(text.length).toBeGreaterThan(0);
        const finishReasons = result.chunks
          .map((c) => c.choices?.[0]?.finish_reason)
          .filter((r): r is string => typeof r === 'string');
        expect(finishReasons.length).toBeGreaterThan(0);
        expect(parseSse(result.raw).some((f) => f.data === '[DONE]')).toBe(true);
      }
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 21. TWO-STEP SEQUENTIAL tool loop — model calls tool A (get_weather), we
  //     return A's result, model then calls tool B (get_population) that
  //     depends on the flow, we return B, final answer references both. The
  //     real multi-hop agent shape. Each turn's envelope + tool_call_id
  //     round-trip is asserted; the model's *choice* to call is flaky-tolerant.
  // -------------------------------------------------------------------------
  it(
    'two-step sequential tool loop: tool A → result → tool B → result → final answer',
    async () => {
      const tools = [WEATHER_TOOL, POPULATION_TOOL];
      const baseMessages: Array<Record<string, unknown>> = [
        {
          role: 'user',
          content:
            'First call get_weather for Paris. After you get the weather, call get_population for France. ' +
            'Then give a one-sentence summary. Use the tools one at a time.',
        },
      ];

      // Turn 1 — expect a get_weather call.
      const turn1 = await postJson<ChatCompletionBody>(app, '/v1/chat/completions', {
        model: MODEL,
        messages: baseMessages,
        tools,
        tool_choice: 'auto',
        max_tokens: 1024,
      });
      expect(turn1.status).toBe(200);
      const c1 = turn1.body.choices?.[0];
      expect(c1).toBeDefined();

      if (c1!.finish_reason !== 'tool_calls' || !c1!.message?.tool_calls?.length) {
        console.warn(
          `[zen.chat.e2e] seq-loop: model skipped tool A (finish_reason=${String(c1!.finish_reason)}); ` +
            'asserting plain envelope and stopping',
        );
        expect(c1!.finish_reason).toBeTruthy();
        return;
      }

      const callA = c1!.message.tool_calls[0]!;
      expect(typeof callA.id).toBe('string');
      expect(callA.id!.length).toBeGreaterThan(0);
      expect(typeof callA.function?.name).toBe('string');
      // arguments must be valid JSON regardless of which tool the model picked
      expect(typeof JSON.parse(callA.function!.arguments!)).toBe('object');

      // Turn 2 — return A's result, expect the model to continue (call B or answer).
      const turn2Messages: Array<Record<string, unknown>> = [
        ...baseMessages,
        {
          role: 'assistant',
          content: c1!.message.content ?? null,
          tool_calls: [
            { id: callA.id, type: 'function', function: { name: callA.function!.name, arguments: callA.function!.arguments } },
          ],
        },
        { role: 'tool', tool_call_id: callA.id, content: '{"temperature":"18C","condition":"sunny"}' },
      ];
      const turn2 = await postJson<ChatCompletionBody>(app, '/v1/chat/completions', {
        model: MODEL,
        messages: turn2Messages,
        tools,
        tool_choice: 'auto',
        max_tokens: 1024,
      });
      expect(turn2.status).toBe(200);
      const c2 = turn2.body.choices?.[0];
      expect(c2).toBeDefined();
      expect(c2!.finish_reason).toBeTruthy();

      // If the model called a SECOND tool, complete the loop (turn 3) and
      // assert the final answer. If it answered directly, that answer is the
      // terminal turn — either is protocol-valid.
      if (c2!.finish_reason === 'tool_calls' && c2!.message?.tool_calls?.length) {
        const callB = c2!.message.tool_calls[0]!;
        expect(typeof callB.id).toBe('string');
        expect(callB.id!.length).toBeGreaterThan(0);
        // Distinct id from callA — the round-trip must not reuse ids.
        expect(callB.id).not.toBe(callA.id);
        expect(typeof JSON.parse(callB.function!.arguments!)).toBe('object');

        const turn3 = await postJson<ChatCompletionBody>(app, '/v1/chat/completions', {
          model: MODEL,
          messages: [
            ...turn2Messages,
            {
              role: 'assistant',
              content: c2!.message.content ?? null,
              tool_calls: [
                { id: callB.id, type: 'function', function: { name: callB.function!.name, arguments: callB.function!.arguments } },
              ],
            },
            { role: 'tool', tool_call_id: callB.id, content: '{"population":"68 million"}' },
          ],
          tools,
          max_tokens: 1024,
        });
        expect(turn3.status).toBe(200);
        const c3 = turn3.body.choices?.[0];
        expect(c3?.finish_reason).toBe('stop');
        expect((c3?.message?.content ?? '').length).toBeGreaterThan(0);
      } else {
        expect(c2!.finish_reason).toBe('stop');
        expect((c2!.message?.content ?? '').length).toBeGreaterThan(0);
      }
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 22. PARALLEL tool calls in ONE turn — two tools needed, both requested in
  //     a single assistant turn. Exercises tool_call_id matching + index
  //     tracking on the return path. Return BOTH tool results and assert the
  //     final answer. Flaky-tolerant: a model that emits only one still gets a
  //     well-formedness check.
  // -------------------------------------------------------------------------
  it(
    'parallel tool calls in one turn: two tools, both results returned, final answer',
    async () => {
      const tools = [WEATHER_TOOL, TIME_TOOL];
      const baseMessages: Array<Record<string, unknown>> = [
        {
          role: 'user',
          content:
            'What is the weather in Paris AND what time is it in Tokyo? ' +
            'You MUST call both get_weather and get_time.',
        },
      ];
      const turn1 = await postJson<ChatCompletionBody>(app, '/v1/chat/completions', {
        model: MODEL,
        messages: baseMessages,
        tools,
        tool_choice: 'auto',
        max_tokens: 1024,
      });
      expect(turn1.status).toBe(200);
      const c1 = turn1.body.choices?.[0];
      expect(c1).toBeDefined();

      if (c1!.finish_reason !== 'tool_calls' || !c1!.message?.tool_calls?.length) {
        console.warn(
          `[zen.chat.e2e] parallel: model called no tools (finish_reason=${String(c1!.finish_reason)}); ` +
            'asserting plain envelope and stopping',
        );
        expect(c1!.finish_reason).toBeTruthy();
        return;
      }

      const calls = c1!.message.tool_calls;
      // Every emitted call is individually well-formed with a unique id.
      const ids = new Set<string>();
      for (const call of calls) {
        expect(typeof call.id).toBe('string');
        expect(call.id!.length).toBeGreaterThan(0);
        expect(ids.has(call.id!)).toBe(false);
        ids.add(call.id!);
        expect(typeof call.function?.name).toBe('string');
        expect(typeof JSON.parse(call.function!.arguments!)).toBe('object');
      }

      if (calls.length < 2) {
        console.warn(
          `[zen.chat.e2e] parallel: model emitted only ${calls.length} tool call(s); ` +
            'single call is well-formed, skipping the two-result follow-up',
        );
        return;
      }

      // Return a result for EACH call, matching tool_call_id. Order of tool
      // results must not matter to the upstream.
      const toolResults = calls.map((call, i) => ({
        role: 'tool' as const,
        tool_call_id: call.id,
        content: i === 0 ? '{"temperature":"18C","condition":"sunny"}' : '{"time":"22:00"}',
      }));

      const turn2 = await postJson<ChatCompletionBody>(app, '/v1/chat/completions', {
        model: MODEL,
        messages: [
          ...baseMessages,
          {
            role: 'assistant',
            content: c1!.message.content ?? null,
            tool_calls: calls.map((call) => ({
              id: call.id,
              type: 'function',
              function: { name: call.function!.name, arguments: call.function!.arguments },
            })),
          },
          ...toolResults,
        ],
        tools,
        max_tokens: 1024,
      });
      expect(turn2.status).toBe(200);
      const final = turn2.body.choices?.[0];
      expect(final?.finish_reason).toBe('stop');
      expect((final?.message?.content ?? '').length).toBeGreaterThan(0);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 23. Streaming WITH tools — accumulate tool-call deltas across chunks into a
  //     valid call, then feed it back on a (non-streamed) follow-up turn and
  //     assert a coherent final answer. The real streaming-agent shape.
  // -------------------------------------------------------------------------
  it(
    'streaming tool call then follow-up: accumulate deltas, round-trip, coherent answer',
    async () => {
      const baseMessages: Array<Record<string, unknown>> = [
        { role: 'user', content: 'What is the weather in Paris? You MUST use the get_weather tool.' },
      ];
      const res = await streamChat(app, {
        model: MODEL,
        messages: baseMessages,
        tools: [WEATHER_TOOL],
        tool_choice: 'auto',
        max_tokens: 1024,
      });
      expect(res.status).toBe(200);
      const chunks = chunksOf(await res.text());
      expect(chunks.length).toBeGreaterThan(0);

      const acc = new Map<number, { id: string; name: string; args: string }>();
      for (const chunk of chunks) {
        for (const delta of chunk.choices?.[0]?.delta?.tool_calls ?? []) {
          const index = delta.index ?? 0;
          const entry = acc.get(index) ?? { id: '', name: '', args: '' };
          if (delta.id) entry.id = delta.id;
          if (delta.function?.name) entry.name += delta.function.name;
          if (delta.function?.arguments) entry.args += delta.function.arguments;
          acc.set(index, entry);
        }
      }

      if (acc.size === 0) {
        console.warn('[zen.chat.e2e] streaming+tools: model streamed no tool call; skipping follow-up');
        const finishReasons = chunks
          .map((c) => c.choices?.[0]?.finish_reason)
          .filter((r): r is string => typeof r === 'string');
        expect(finishReasons.length).toBeGreaterThan(0);
        return;
      }

      const call = acc.get(0)!;
      expect(call.id.length).toBeGreaterThan(0);
      expect(call.name).toBe('get_weather');
      const args = JSON.parse(call.args) as Record<string, unknown>;
      expect(typeof args).toBe('object');

      // Follow-up turn (non-streamed): return the accumulated call's result.
      const turn2 = await postJson<ChatCompletionBody>(app, '/v1/chat/completions', {
        model: MODEL,
        messages: [
          ...baseMessages,
          {
            role: 'assistant',
            content: null,
            tool_calls: [{ id: call.id, type: 'function', function: { name: call.name, arguments: call.args } }],
          },
          { role: 'tool', tool_call_id: call.id, content: '{"temperature":"18C","condition":"sunny"}' },
        ],
        tools: [WEATHER_TOOL],
        max_tokens: 1024,
      });
      expect(turn2.status).toBe(200);
      const final = turn2.body.choices?.[0];
      expect(final?.finish_reason).toBe('stop');
      const finalText = final?.message?.content ?? '';
      expect(finalText.length).toBeGreaterThan(0);
      expect(finalText).toMatch(/18|sunny/i);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 24. Long interleaved conversation — system + >=6 turns mixing user /
  //     assistant / tool messages. Hard version of the G155 shape: the model
  //     must honor the system prompt AND recall a fact from the earliest turn.
  // -------------------------------------------------------------------------
  it(
    'long interleaved conversation (system + tool + >=6 turns) recalls early context',
    async () => {
      const messages: Array<Record<string, unknown>> = [
        { role: 'system', content: 'You are a terse travel assistant. Always answer in as few words as possible.' },
        { role: 'user', content: 'My name is Waldo and my favorite city is Lisbon.' },
        { role: 'assistant', content: 'Noted, Waldo.' },
        { role: 'user', content: 'What is the weather in Lisbon? Use the get_weather tool.' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            { id: 'call_hist_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Lisbon"}' } },
          ],
        },
        { role: 'tool', tool_call_id: 'call_hist_1', content: '{"temperature":"24C","condition":"clear"}' },
        { role: 'assistant', content: 'Lisbon: 24C, clear.' },
        { role: 'user', content: 'Thanks. Should I bring a jacket?' },
        { role: 'assistant', content: 'No.' },
        { role: 'user', content: 'What is my favorite city? Reply with just the city name.' },
      ];
      const { status, body } = await postJson<ChatCompletionBody>(app, '/v1/chat/completions', {
        model: MODEL,
        messages,
        tools: [WEATHER_TOOL],
        max_tokens: 1024,
      });

      expect(status).toBe(200);
      expect(body.object).toBe('chat.completion');
      const content = body.choices?.[0]?.message?.content ?? '';
      expect(content.length).toBeGreaterThan(0);
      expect(body.choices?.[0]?.finish_reason).toBe('stop');
      // Must recall the fact from the very first user turn through a long,
      // tool-interleaved history.
      expect(content.toLowerCase()).toContain('lisbon');
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 25a. tool_choice FORCED (named) — the model MUST return exactly that tool
  //      call. This is deterministic (forced), so asserted strictly. Uses
  //      big-pickle: the deepseek-v4-flash-free upstream rejects tool_choice
  //      forcing with a 400 (a Zen/upstream limitation, not a gateway bug),
  //      whereas big-pickle (mimo-v2.5) honors it.
  // -------------------------------------------------------------------------
  it(
    'tool_choice forced (named) → model returns exactly that tool call',
    async () => {
      const { status, body } = await postJson<ChatCompletionBody>(app, '/v1/chat/completions', {
        model: TINY_MODEL,
        messages: [{ role: 'user', content: 'What is the weather in Berlin?' }],
        tools: [WEATHER_TOOL],
        tool_choice: { type: 'function', function: { name: 'get_weather' } },
        max_tokens: 1024,
      });

      expect(status).toBe(200);
      const choice = body.choices?.[0];
      expect(choice?.finish_reason).toBe('tool_calls');
      const calls = choice?.message?.tool_calls;
      expect(Array.isArray(calls)).toBe(true);
      expect(calls!.length).toBeGreaterThan(0);
      const call = calls![0]!;
      expect(typeof call.id).toBe('string');
      expect(call.id!.length).toBeGreaterThan(0);
      expect(call.function?.name).toBe('get_weather');
      expect(typeof JSON.parse(call.function!.arguments!)).toBe('object');
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 25b. tool_choice: 'required' — the model MUST call some tool. Deterministic
  //      given a tool-relevant prompt; asserted strictly on big-pickle.
  // -------------------------------------------------------------------------
  it(
    "tool_choice 'required' → model must emit a tool call",
    async () => {
      const { status, body } = await postJson<ChatCompletionBody>(app, '/v1/chat/completions', {
        model: TINY_MODEL,
        messages: [{ role: 'user', content: 'What is the weather in Paris?' }],
        tools: [WEATHER_TOOL],
        tool_choice: 'required',
        max_tokens: 1024,
      });

      expect(status).toBe(200);
      const choice = body.choices?.[0];
      expect(choice?.finish_reason).toBe('tool_calls');
      const calls = choice?.message?.tool_calls;
      expect(Array.isArray(calls)).toBe(true);
      expect(calls!.length).toBeGreaterThan(0);
      const call = calls![0]!;
      expect(typeof call.function?.name).toBe('string');
      expect(typeof JSON.parse(call.function!.arguments!)).toBe('object');
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 26. Usage accounting across a full multi-turn — prompt_tokens must grow as
  //     the history grows; totals must equal prompt + completion each turn.
  //     Catches billing-accounting drift.
  // -------------------------------------------------------------------------
  it(
    'usage accounting is monotonic and self-consistent across a 3-turn conversation',
    async () => {
      const history: Array<Record<string, unknown>> = [
        { role: 'system', content: 'You are a terse assistant.' },
        { role: 'user', content: 'Remember the number 7.' },
      ];

      const usages: Array<{ prompt: number; completion: number; total: number }> = [];
      const prompts = ['What number did I ask you to remember? Reply with just the number.', 'Add 3 to it. Reply with just the number.'];

      // Turn 1
      let turn = await postJson<ChatCompletionBody>(app, '/v1/chat/completions', {
        model: MODEL,
        messages: history,
        max_tokens: 1024,
      });
      expect(turn.status).toBe(200);
      let u = turn.body.usage!;
      expect(u.prompt_tokens).toBeGreaterThan(0);
      expect(u.completion_tokens).toBeGreaterThan(0);
      expect(u.total_tokens).toBe(u.prompt_tokens! + u.completion_tokens!);
      usages.push({ prompt: u.prompt_tokens!, completion: u.completion_tokens!, total: u.total_tokens! });
      history.push({ role: 'assistant', content: turn.body.choices?.[0]?.message?.content ?? '7' });

      // Turns 2 and 3 — each appends the prior answer, growing the prompt.
      for (const content of prompts) {
        history.push({ role: 'user', content });
        turn = await postJson<ChatCompletionBody>(app, '/v1/chat/completions', {
          model: MODEL,
          messages: history,
          max_tokens: 1024,
        });
        expect(turn.status).toBe(200);
        u = turn.body.usage!;
        expect(u.prompt_tokens).toBeGreaterThan(0);
        expect(u.completion_tokens).toBeGreaterThan(0);
        expect(u.total_tokens).toBe(u.prompt_tokens! + u.completion_tokens!);
        usages.push({ prompt: u.prompt_tokens!, completion: u.completion_tokens!, total: u.total_tokens! });
        history.push({ role: 'assistant', content: turn.body.choices?.[0]?.message?.content ?? '' });
      }

      // prompt_tokens must grow strictly as history accumulates.
      expect(usages[1]!.prompt).toBeGreaterThan(usages[0]!.prompt);
      expect(usages[2]!.prompt).toBeGreaterThan(usages[1]!.prompt);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 27. Malformed tool result — a role:'tool' message whose tool_call_id
  //     matches NO prior assistant tool_call. Pins the CURRENT reality: the
  //     Zen upstream rejects this orphan tool message and the gateway surfaces
  //     it as a 400 invalid_request_error (it is not silently accepted). If a
  //     future upstream/gateway starts forwarding it, this test will flip.
  // -------------------------------------------------------------------------
  it(
    'orphan tool message (tool_call_id matching no prior tool_call) → 400 invalid_request_error',
    async () => {
      const { status, body } = await postJson<ErrorBody>(app, '/v1/chat/completions', {
        model: MODEL,
        messages: [
          { role: 'user', content: 'What is the weather in Paris?' },
          { role: 'tool', tool_call_id: 'call_orphan_does_not_exist', content: '{"temperature":"18C"}' },
        ],
        max_tokens: 1024,
      });

      // Current reality: surfaced as a 4xx client error, not a 5xx or a 200.
      expect(status).toBe(400);
      expect(body.error).toBeDefined();
      expect(typeof body.error?.message).toBe('string');
      expect(body.error!.message!.length).toBeGreaterThan(0);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 28. Abort mid tool-call stream — start a streaming tool-call request, abort
  //     after the first chunk, assert the app doesn't crash and the stream
  //     terminates cleanly. Extends the plain-text abort test into the tool
  //     path (where a partial tool-call delta stream is torn down).
  // -------------------------------------------------------------------------
  it(
    'client abort mid tool-call stream terminates cleanly without crashing',
    async () => {
      const controller = new AbortController();
      const res = await streamChat(
        app,
        {
          model: MODEL,
          messages: [
            {
              role: 'user',
              content:
                'What is the weather in Paris, London, Berlin, Madrid, and Rome? ' +
                'You MUST call get_weather once for each city.',
            },
          ],
          tools: [WEATHER_TOOL],
          tool_choice: 'auto',
          max_tokens: 2048,
        },
        { signal: controller.signal },
      );

      expect(res.status).toBe(200);
      const reader = res.body!.getReader();
      await reader.read();
      controller.abort();

      let terminated = false;
      try {
        for (;;) {
          const { done } = await reader.read();
          if (done) {
            terminated = true;
            break;
          }
        }
      } catch {
        terminated = true;
      }
      expect(terminated).toBe(true);

      // App still serves requests after aborting a tool-call stream.
      const after = await postJson<ErrorBody>(app, '/v1/chat/completions', {
        model: 'zen/does-not-exist-xyz',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 16,
      });
      expect(after.status).toBeGreaterThanOrEqual(400);
      expect(after.body.error).toBeDefined();
    },
    TEST_TIMEOUT,
  );

  // G31 (SP1) — live confirmation against the REAL Zen upstream. An operator
  // configures maxBodyBytes as a DoS guard; a real client POSTs an oversized
  // body. The gateway must reject with 413 BEFORE it buffers + forwards the
  // body upstream. (Mock proof lives in bodyLimit.int.spec.ts; this proves a
  // real client actually hits it.)
  it(
    'rejects an oversized real chat request with 413 when maxBodyBytes is configured',
    async () => {
      const registry = buildProviderRegistry({}, [
        { name: 'zen', baseURL: ZEN_BASE_URL, apiKey: OPENCODE_API_KEY },
      ]) as ProviderRegistry;
      const app = createApp({ registry, maxBodyBytes: 4096 });

      const huge = 'x'.repeat(2 * 1024 * 1024);
      const res = await postJson<ErrorBody>(app, '/v1/chat/completions', {
        model: MODEL,
        messages: [{ role: 'user', content: huge }],
        max_tokens: 16,
      });

      expect(res.status).toBe(413);
      expect(res.body.error?.code).toBe('request_entity_too_large');
    },
    TEST_TIMEOUT,
  );
});
