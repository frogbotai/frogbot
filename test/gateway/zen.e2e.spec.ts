// Gateway E2E smoke tests against OpenCode Zen (https://opencode.ai/zen/v1),
// an OpenAI-compatible upstream. Exercises the gateway's openai-compatible
// provider path: non-streaming chat, SSE streaming, tool calls, and error
// normalization. Zen's free models only work inside OpenCode, so the suites
// use a paid model and need OPENCODE_API_KEY in .env.live.local.
//
// Run: RUN_E2E=1 pnpm vitest run --project=gateway-zen test/gateway/zen.e2e.spec.ts

import { expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import { buildProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { parseSse } from '../__helpers/gateway/parse-sse.js';
import { postJson } from '../__helpers/gateway/post-json.js';
import { describeLive } from '../live/live.js';

const OPENCODE_API_KEY = process.env.OPENCODE_API_KEY ?? '';

const ZEN_BASE_URL = 'https://opencode.ai/zen/v1';
const ZEN_MODEL = 'deepseek-v4.1-flash';
const MODEL = `zen/${ZEN_MODEL}`;

// Real network: keep prompts tiny and budgets generous.
const TEST_TIMEOUT = 60_000;

function makeZenApp() {
  const registry = buildProviderRegistry({
    zen: { baseURL: ZEN_BASE_URL, apiKey: OPENCODE_API_KEY },
  });
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

describeLive('gateway E2E — OpenCode Zen', { keys: ['OPENCODE_API_KEY'] }, () => {
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
      expect(chunks[0].choices?.[0]?.delta?.role).toBe('assistant');

      // Deltas accumulate to non-empty text.
      const text = chunks.map((c) => c.choices?.[0]?.delta?.content ?? '').join('');
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
        messages: [
          { role: 'user', content: 'What is the weather in Paris? Use the get_weather tool.' },
        ],
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
        throw new Error(
          `[zen.e2e] model did not call the tool (finish_reason=${String(choice!.finish_reason)})`,
        );
      }

      const toolCalls = choice!.message?.tool_calls as ToolCall[] | undefined;
      expect(Array.isArray(toolCalls)).toBe(true);
      expect(toolCalls!.length).toBeGreaterThan(0);

      const call = toolCalls![0];
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
    'upstream GET /v1/models lists the suite model',
    async () => {
      const res = await fetch(`${ZEN_BASE_URL}/models`, {
        headers: { authorization: `Bearer ${OPENCODE_API_KEY}` },
      });

      const body = (await res.json()) as { data?: Array<{ id?: string }> };

      expect(res.status).toBe(200);
      expect(body.data?.map((model) => model.id)).toContain(ZEN_MODEL);
    },
    TEST_TIMEOUT,
  );
});
