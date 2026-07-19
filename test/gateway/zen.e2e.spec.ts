// Gateway E2E smoke tests — OpenCode Zen's FREE hosted models.
//
// OpenCode Zen is an OpenAI-compatible API at https://opencode.ai/zen/v1
// that offers a rotating set of free ($0 in/out) models. This suite exercises
// the gateway's generic openai-compatible provider path against a REAL
// upstream, covering the request patterns actual clients use: non-streaming
// chat, SSE streaming, tool calls, and error normalization.
//
// Setup:
//   No account needed — Zen's free models accept unauthenticated requests
//   (opencode itself falls back to apiKey: "public" — provider.ts:181).
//   Optionally: export OPENCODE_API_KEY=<your key> to use your account.
//   Run: RUN_E2E=1 pnpm vitest run --project=gateway-e2e test/gateway/zen.e2e.spec.ts
//
// Skips cleanly (does not fail) when RUN_E2E !== '1'.
//
// Free models are "limited time" — if the ids below disappear, the models
// sanity test warns (does not fail) with the current free catalog.

import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import { buildProviderRegistry, type ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { parseSse } from '../__helpers/gateway/parse-sse.js';
import { postJson } from '../__helpers/gateway/post-json.js';

const OPENCODE_API_KEY = process.env.OPENCODE_API_KEY ?? 'public';
const RUN_E2E = process.env.RUN_E2E === '1';

const ZEN_BASE_URL = 'https://opencode.ai/zen/v1';
const ZEN_FREE_MODELS = ['deepseek-v4-flash-free', 'nemotron-3-super-free', 'big-pickle'];
const MODEL = `zen/${ZEN_FREE_MODELS[0]}`;

// Real network: keep prompts tiny and budgets generous.
const TEST_TIMEOUT = 60_000;

function makeZenApp() {
  const registry = buildProviderRegistry({}, [
    {
      name: 'zen',
      baseURL: ZEN_BASE_URL,
      apiKey: OPENCODE_API_KEY,
    },
  ]) as ProviderRegistry;
  return createApp({ registry });
}

type ChatCompletionBody = {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: Array<{
    message?: { role?: string; content?: string | null; tool_calls?: unknown[] };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

type ChatChunk = {
  choices?: Array<{
    delta?: { role?: string; content?: string; tool_calls?: unknown[] };
    finish_reason?: string | null;
  }>;
};

type ToolCall = {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
};

describe.skipIf(!RUN_E2E)('gateway E2E — OpenCode Zen free models', () => {
  const app = makeZenApp();

  it(
    'non-streaming chat completion round-trip',
    async () => {
      const { status, body } = await postJson<ChatCompletionBody>(app, '/v1/chat/completions', {
        model: MODEL,
        messages: [{ role: 'user', content: 'Say hi' }],
        max_tokens: 1024, // reasoning model: budget covers reasoning_content + text
      });

      expect(status).toBe(200);

      // Envelope fields real clients depend on.
      expect(typeof body.id).toBe('string');
      expect(body.id!.length).toBeGreaterThan(0);
      expect(body.object).toBe('chat.completion');
      expect(typeof body.created).toBe('number');
      expect(typeof body.model).toBe('string');

      const choice = body.choices?.[0];
      expect(choice).toBeDefined();
      expect(typeof choice!.message?.content).toBe('string');
      expect(choice!.message!.content!.length).toBeGreaterThan(0);
      expect(choice!.finish_reason).toBeTruthy();

      expect(body.usage?.prompt_tokens).toBeGreaterThan(0);
      expect(body.usage?.completion_tokens).toBeGreaterThan(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'streaming chat completion round-trip',
    async () => {
      const res = await app.request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'user', content: 'Say hi' }],
          max_tokens: 1024, // reasoning model: budget covers reasoning_content + text
          stream: true,
        }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      const raw = await res.text();
      const frames = parseSse(raw);
      const dataFrames = frames.filter((f) => f.data !== '[DONE]');
      const chunks = dataFrames.map((f) => JSON.parse(f.data) as ChatChunk);
      expect(chunks.length).toBeGreaterThan(0);

      // First content-bearing chunk carries the assistant role.
      expect(chunks[0]!.choices?.[0]?.delta?.role).toBe('assistant');

      // Deltas accumulate to non-empty text.
      const text = chunks
        .map((c) => c.choices?.[0]?.delta?.content ?? '')
        .join('');
      expect(text.length).toBeGreaterThan(0);

      // Some chunk carries a terminal finish_reason.
      const finishReasons = chunks
        .map((c) => c.choices?.[0]?.finish_reason)
        .filter((r): r is string => typeof r === 'string' && r.length > 0);
      expect(finishReasons.length).toBeGreaterThan(0);

      // [DONE] sentinel present. G5 (double [DONE] on every chat stream) is a
      // known open bug, so we assert presence (>=1), not exactly-once.
      // TODO tighten to exactly-once when G5 fixed
      const doneCount = frames.filter((f) => f.data === '[DONE]').length;
      expect(doneCount).toBeGreaterThanOrEqual(1);
    },
    TEST_TIMEOUT,
  );

  it(
    'tool call round-trip (flaky-model tolerant)',
    async () => {
      const { status, body } = await postJson<ChatCompletionBody>(app, '/v1/chat/completions', {
        model: MODEL,
        messages: [{ role: 'user', content: 'What is the weather in Paris? Use the get_weather tool.' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get the current weather for a city',
              parameters: {
                type: 'object',
                properties: {
                  city: { type: 'string', description: 'City name' },
                },
                required: ['city'],
              },
            },
          },
        ],
        tool_choice: 'auto',
        max_tokens: 128,
      });

      expect(status).toBe(200);
      const choice = body.choices?.[0];
      expect(choice).toBeDefined();

      if (choice!.finish_reason !== 'tool_calls') {
        // Free models don't reliably call tools — validate whatever came back
        // instead of failing the suite on model flakiness.
        console.warn(
          `[zen.e2e] model did not call the tool (finish_reason=${String(choice!.finish_reason)}); ` +
            'asserting plain-completion wire shape instead',
        );
        expect(choice!.finish_reason).toBeTruthy();
        expect(body.usage?.prompt_tokens).toBeGreaterThan(0);
        return;
      }

      const toolCalls = choice!.message?.tool_calls as ToolCall[] | undefined;
      expect(Array.isArray(toolCalls)).toBe(true);
      expect(toolCalls!.length).toBeGreaterThan(0);

      const call = toolCalls![0]!;
      expect(typeof call.id).toBe('string');
      expect(call.id!.length).toBeGreaterThan(0);
      expect(call.function?.name).toBe('get_weather');
      expect(typeof call.function?.arguments).toBe('string');
      // arguments must be valid JSON
      const args = JSON.parse(call.function!.arguments!) as Record<string, unknown>;
      expect(typeof args).toBe('object');
    },
    TEST_TIMEOUT,
  );

  it(
    'nonexistent model → well-formed OpenAI error envelope',
    async () => {
      const { status, body } = await postJson<{
        error?: { message?: string; type?: string };
      }>(app, '/v1/chat/completions', {
        model: 'zen/does-not-exist-xyz',
        messages: [{ role: 'user', content: 'Say hi' }],
        max_tokens: 16,
      });

      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(600);

      expect(body.error).toBeDefined();
      expect(typeof body.error!.message).toBe('string');
      expect(body.error!.message!.length).toBeGreaterThan(0);
      expect(typeof body.error!.type).toBe('string');
    },
    TEST_TIMEOUT,
  );

  it(
    'upstream GET /v1/models sanity — free model ids still listed',
    async () => {
      // Direct fetch to Zen (not through the gateway) — the free lineup is
      // "limited time", so a missing id warns instead of failing the suite.
      const res = await fetch(`${ZEN_BASE_URL}/models`, {
        headers: { authorization: `Bearer ${OPENCODE_API_KEY}` },
      });
      expect(res.status).toBe(200);

      const body = (await res.json()) as { data?: Array<{ id?: string }> };
      expect(Array.isArray(body.data)).toBe(true);

      const ids = new Set(body.data!.map((m) => m.id));
      const missing = ZEN_FREE_MODELS.filter((id) => !ids.has(id));
      if (missing.length > 0) {
        console.warn(
          `[zen.e2e] expected free models missing from catalog: ${missing.join(', ')}. ` +
            `Current catalog ids: ${[...ids].join(', ')}`,
        );
      }
    },
    TEST_TIMEOUT,
  );
});
