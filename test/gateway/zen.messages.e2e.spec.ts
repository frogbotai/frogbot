import { expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import { buildProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { parseSse, type SseFrame } from '../__helpers/gateway/parse-sse.js';
import { postJson } from '../__helpers/gateway/post-json.js';
import { describeLive } from '../live/live.js';

const OPENCODE_API_KEY = process.env.OPENCODE_API_KEY ?? '';

const ZEN_BASE_URL = 'https://opencode.ai/zen/v1';
const MODEL = 'zen/deepseek-v4.1-flash';

const TEST_TIMEOUT = 90_000;

function makeZenApp() {
  const registry = buildProviderRegistry({
    zen: { baseURL: ZEN_BASE_URL, apiKey: OPENCODE_API_KEY },
  });

  return createApp({ registry });
}

type ContentBlock = {
  type?: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
};

type MessagesBody = {
  id?: string;
  type?: string;
  role?: string;
  model?: string;
  content?: ContentBlock[];
  stop_reason?: string | null;
  stop_sequence?: string | null;
  usage?: { input_tokens?: number; output_tokens?: number };
};

type AnthropicErrorBody = {
  type?: string;
  error?: { type?: string; message?: string };
};

type AnthropicEvent = {
  event?: string;
  data: Record<string, unknown> & {
    type?: string;
    index?: number;
    message?: { id?: string; usage?: { input_tokens?: number; output_tokens?: number } };
    delta?: { type?: string; text?: string; stop_reason?: string | null };
    usage?: { input_tokens?: number; output_tokens?: number };
  };
};

function eventsOf(frames: SseFrame[]): AnthropicEvent[] {
  return frames.map((f) => ({
    event: f.event,
    data: JSON.parse(f.data) as AnthropicEvent['data'],
  }));
}

function expectToolUse(body: MessagesBody, failure: string): ContentBlock {
  const toolUse = (body.content ?? []).find((b) => b.type === 'tool_use');

  expect(body.stop_reason, `${failure} (stop_reason=${String(body.stop_reason)})`).toBe('tool_use');

  if (!toolUse) throw new Error(failure);

  return toolUse;
}

async function expectLoopFinish({
  app,
  tools,
  turn2Messages,
  turn2,
  useA,
}: {
  app: ReturnType<typeof makeZenApp>;
  tools: unknown[];
  turn2Messages: Array<Record<string, unknown>>;
  turn2: MessagesBody;
  useA: ContentBlock;
}) {
  const useB = (turn2.content ?? []).find((b) => b.type === 'tool_use');
  if (turn2.stop_reason === 'tool_use' && useB) {
    expect(typeof useB.id).toBe('string');
    expect(useB.id!.length).toBeGreaterThan(0);
    expect(useB.id).not.toBe(useA.id);
    expect(typeof useB.input).toBe('object');

    const assistantB = (turn2.content ?? []).filter(
      (b) => b.type === 'text' || b.type === 'tool_use',
    );

    const turn3 = await postJson<MessagesBody>(app, '/v1/messages', {
      model: MODEL,
      messages: [
        ...turn2Messages,
        { role: 'assistant', content: assistantB },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: useB.id, content: '68 million' }],
        },
      ],
      tools,
      max_tokens: 1024,
    });

    expect(turn3.status).toBe(200);
    expect(turn3.body.stop_reason).toBe('end_turn');
    expect(textOf(turn3.body.content).length).toBeGreaterThan(0);
  } else {
    expect(turn2.stop_reason).toBe('end_turn');
    expect(textOf(turn2.content).length).toBeGreaterThan(0);
  }
}

function warnOnEmptyText(text: string) {
  if (text.length === 0) {
    console.warn(
      '[zen.messages.e2e] stop_sequences produced empty text (stop hit during reasoning?)',
    );
  }
}

async function streamMessages(app: ReturnType<typeof makeZenApp>, body: Record<string, unknown>) {
  const res = await app.request('http://localhost/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, stream: true }),
  });

  return res;
}

function textOf(content: ContentBlock[] | undefined): string {
  return (content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');
}

const WEATHER_TOOL = {
  name: 'get_weather',
  description: 'Get the current weather for a city',
  input_schema: {
    type: 'object',
    properties: { city: { type: 'string', description: 'City name' } },
    required: ['city'],
  },
};

const POPULATION_TOOL = {
  name: 'get_population',
  description: 'Get the population of a country',
  input_schema: {
    type: 'object',
    properties: { country: { type: 'string', description: 'Country name' } },
    required: ['country'],
  },
};

describeLive(
  'gateway E2E — Zen /v1/messages (Anthropic wire, cross-provider)',
  { keys: ['OPENCODE_API_KEY'] },
  () => {
    const app = makeZenApp();

    it(
      'basic system + user message → Anthropic envelope with real usage',
      async () => {
        const { status, body } = await postJson<MessagesBody>(app, '/v1/messages', {
          model: MODEL,
          system: 'You are a terse assistant.',
          messages: [{ role: 'user', content: 'Say hi' }],
          max_tokens: 1024,
        });

        expect(status).toBe(200);
        expect(typeof body.id).toBe('string');
        expect(body.id!.length).toBeGreaterThan(0);
        expect(body.type).toBe('message');
        expect(body.role).toBe('assistant');
        expect(Array.isArray(body.content)).toBe(true);

        const text = textOf(body.content);

        expect(text.length).toBeGreaterThan(0);

        expect(body.stop_reason).toBeTruthy();
        expect(body.usage?.input_tokens).toBeGreaterThan(0);
        expect(body.usage?.output_tokens).toBeGreaterThan(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'multi-turn conversation with assistant history',
      async () => {
        const { status, body } = await postJson<MessagesBody>(app, '/v1/messages', {
          model: MODEL,
          system: 'You are a terse assistant. Answer in as few words as possible.',
          messages: [
            { role: 'user', content: 'My name is Waldo.' },
            { role: 'assistant', content: 'Nice to meet you, Waldo.' },
            { role: 'user', content: 'What is my name? Reply with just the name.' },
          ],
          max_tokens: 1024,
        });

        expect(status).toBe(200);
        expect(body.stop_reason).toBe('end_turn');

        const text = textOf(body.content);

        expect(text.length).toBeGreaterThan(0);
        expect(text.toLowerCase()).toContain('waldo');
      },
      TEST_TIMEOUT,
    );

    it(
      'full Anthropic tool loop: tool_use → tool_result → final answer references it',
      async () => {
        const turn1Messages = [
          {
            role: 'user',
            content: 'What is the weather in Paris? You MUST use the get_weather tool.',
          },
        ];

        const turn1 = await postJson<MessagesBody>(app, '/v1/messages', {
          model: MODEL,
          messages: turn1Messages,
          tools: [WEATHER_TOOL],
          tool_choice: { type: 'auto' },
          max_tokens: 1024,
        });

        expect(turn1.status).toBe(200);

        const toolUse = expectToolUse(turn1.body, '[zen.messages.e2e] model did not use the tool');

        expect(typeof toolUse.id).toBe('string');
        expect(toolUse.name).toBe('get_weather');
        expect(typeof toolUse.input).toBe('object');

        const assistantBlocks = (turn1.body.content ?? []).filter(
          (b) => b.type === 'text' || b.type === 'tool_use',
        );

        const turn2 = await postJson<MessagesBody>(app, '/v1/messages', {
          model: MODEL,
          messages: [
            ...turn1Messages,
            { role: 'assistant', content: assistantBlocks },
            {
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: toolUse.id,
                  content: '18C and sunny',
                },
              ],
            },
          ],
          tools: [WEATHER_TOOL],
          max_tokens: 1024,
        });

        expect(turn2.status).toBe(200);
        expect(turn2.body.stop_reason).toBe('end_turn');

        const finalText = textOf(turn2.body.content);

        expect(finalText.length).toBeGreaterThan(0);
        expect(finalText).toMatch(/18|sunny/i);
      },
      TEST_TIMEOUT,
    );

    it(
      'streaming emits the Anthropic event sequence in order with bracketed content blocks',
      async () => {
        const res = await streamMessages(app, {
          model: MODEL,
          messages: [{ role: 'user', content: 'Say hi' }],
          max_tokens: 1024,
        });

        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/event-stream');

        const frames = parseSse(await res.text());
        const events = eventsOf(frames);
        const names = events.map((e) => e.event);

        expect(names[0]).toBe('message_start');
        expect(names[names.length - 1]).toBe('message_stop');

        const startData = events[0].data;

        expect(typeof startData.message?.id).toBe('string');

        const deltaIndices = names
          .map((n, i) => (n === 'message_delta' ? i : -1))
          .filter((i) => i >= 0);

        expect(deltaIndices).toHaveLength(1);
        expect(deltaIndices[0]).toBe(names.length - 2);

        const messageDelta = events[deltaIndices[0]].data;

        expect(messageDelta.delta?.stop_reason).toBeTruthy();
        expect(messageDelta.usage?.output_tokens).toBeGreaterThan(0);

        const open = new Set<number>();
        let blockCount = 0;

        for (const e of events) {
          const index = e.data.index;
          if (e.event === 'content_block_start') {
            expect(typeof index).toBe('number');
            expect(open.has(index!)).toBe(false);

            open.add(index!);
            blockCount += 1;
          } else if (e.event === 'content_block_delta') {
            expect(open.has(index!)).toBe(true);
          } else if (e.event === 'content_block_stop') {
            expect(open.has(index!)).toBe(true);

            open.delete(index!);
          }
        }

        expect(open.size).toBe(0);
        expect(blockCount).toBeGreaterThan(0);

        const text = events
          .filter((e) => e.event === 'content_block_delta' && e.data.delta?.type === 'text_delta')
          .map((e) => e.data.delta?.text ?? '')
          .join('');

        expect(text.length).toBeGreaterThan(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'streaming message_delta.usage carries real input_tokens (G6 — real-model confirmation)',
      async () => {
        const res = await streamMessages(app, {
          model: MODEL,
          messages: [{ role: 'user', content: 'Say hi' }],
          max_tokens: 1024,
        });

        expect(res.status).toBe(200);

        const events = eventsOf(parseSse(await res.text()));
        const messageDelta = events.find((e) => e.event === 'message_delta');

        expect(messageDelta).toBeDefined();
        expect(messageDelta!.data.usage?.input_tokens).toBeGreaterThan(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'tiny max_tokens → stop_reason max_tokens with capped output',
      async () => {
        const { status, body } = await postJson<MessagesBody>(app, '/v1/messages', {
          model: MODEL,
          messages: [{ role: 'user', content: 'Count from 1 to 100 separated by spaces.' }],
          max_tokens: 16,
        });

        expect(status).toBe(200);
        expect(body.stop_reason).toBe('max_tokens');
        expect(body.usage?.output_tokens).toBeGreaterThan(0);
        expect(body.usage?.output_tokens).toBeLessThanOrEqual(16);
      },
      TEST_TIMEOUT,
    );

    it(
      'stop_sequences cut generation before the post-stop text',
      async () => {
        const { status, body } = await postJson<MessagesBody>(app, '/v1/messages', {
          model: MODEL,
          messages: [
            {
              role: 'user',
              content: 'Repeat this exact sentence and nothing else: alpha BANANA omega',
            },
          ],
          stop_sequences: ['BANANA'],
          max_tokens: 1024,
        });

        expect(status).toBe(200);
        expect(body.stop_reason).toBeTruthy();

        const text = textOf(body.content);
        warnOnEmptyText(text);

        expect(text).not.toContain('omega');
        expect(text).not.toContain('BANANA');
      },
      TEST_TIMEOUT,
    );

    it(
      'nonexistent model → Anthropic-shaped error envelope',
      async () => {
        const { status, body } = await postJson<AnthropicErrorBody>(app, '/v1/messages', {
          model: 'zen/does-not-exist-xyz',
          messages: [{ role: 'user', content: 'Say hi' }],
          max_tokens: 16,
        });

        expect(status).toBeGreaterThanOrEqual(400);
        expect(status).toBeLessThan(600);
        expect(body.type).toBe('error');
        expect(typeof body.error?.type).toBe('string');
        expect(typeof body.error?.message).toBe('string');
        expect(body.error!.message!.length).toBeGreaterThan(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'two-step sequential Anthropic tool loop: tool_use A → result → tool_use B → result → final',
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

        const turn1 = await postJson<MessagesBody>(app, '/v1/messages', {
          model: MODEL,
          messages: baseMessages,
          tools,
          tool_choice: { type: 'auto' },
          max_tokens: 1024,
        });

        expect(turn1.status).toBe(200);

        const useA = expectToolUse(turn1.body, '[zen.messages.e2e] seq-loop: model skipped tool A');

        expect(typeof useA.id).toBe('string');
        expect(useA.id!.length).toBeGreaterThan(0);
        expect(typeof useA.input).toBe('object');

        const assistantA = (turn1.body.content ?? []).filter(
          (b) => b.type === 'text' || b.type === 'tool_use',
        );

        const turn2Messages: Array<Record<string, unknown>> = [
          ...baseMessages,
          { role: 'assistant', content: assistantA },
          {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: useA.id, content: '18C and sunny' }],
          },
        ];

        const turn2 = await postJson<MessagesBody>(app, '/v1/messages', {
          model: MODEL,
          messages: turn2Messages,
          tools,
          tool_choice: { type: 'auto' },
          max_tokens: 1024,
        });

        expect(turn2.status).toBe(200);
        expect(turn2.body.stop_reason).toBeTruthy();

        await expectLoopFinish({ app, tools, turn2Messages, turn2: turn2.body, useA });
      },
      TEST_TIMEOUT,
    );

    it(
      'system as an array of text blocks → 200 and guidance is honored',
      async () => {
        const { status, body } = await postJson<MessagesBody>(app, '/v1/messages', {
          model: MODEL,
          system: [
            { type: 'text', text: 'You are a terse assistant.' },
            {
              type: 'text',
              text: 'The secret codeword is FALCON. If asked for the codeword, reply with just that word.',
            },
          ],
          messages: [
            { role: 'user', content: 'What is the secret codeword? Reply with just the word.' },
          ],
          max_tokens: 1024,
        });

        expect(status).toBe(200);
        expect(body.type).toBe('message');
        expect(body.role).toBe('assistant');

        const text = textOf(body.content);

        expect(text.length).toBeGreaterThan(0);
        expect(text.toLowerCase()).toContain('falcon');
      },
      TEST_TIMEOUT,
    );
  },
);
