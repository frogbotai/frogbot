import { expect } from 'vitest';

import { parseSse } from '../../__helpers/gateway/parse-sse.js';
import { type LiveApp, post, postRaw } from './routes.js';

const MAX_TOKENS = 1024;

const WEATHER_PARAMS = {
  type: 'object',
  properties: { city: { type: 'string', description: 'City name' } },
  required: ['city'],
};

const POPULATION_PARAMS = {
  type: 'object',
  properties: { country: { type: 'string', description: 'Country name' } },
  required: ['country'],
};

const CHAT_WEATHER_TOOL = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'Get the current weather for a city',
    parameters: WEATHER_PARAMS,
  },
};

const CHAT_POPULATION_TOOL = {
  type: 'function',
  function: {
    name: 'get_population',
    description: 'Get the population of a country',
    parameters: POPULATION_PARAMS,
  },
};

const MESSAGES_WEATHER_TOOL = {
  name: 'get_weather',
  description: 'Get the current weather for a city',
  input_schema: WEATHER_PARAMS,
};

const RESPONSES_WEATHER_TOOL = {
  type: 'function',
  name: 'get_weather',
  description: 'Get the current weather for a city',
  parameters: WEATHER_PARAMS,
};

const TOOL_PROMPT = 'What is the weather in Paris right now? Use the get_weather tool.';
const TOOL_RESULT_JSON = '{"temp_c":18,"condition":"sunny"}';
const FINAL_ANSWER = /18|sunny/i;

function noToolCall(model: string, wire: string, detail: string): Error {
  return new Error(
    `[scenarios] ${model} did not call the tool on ${wire} (${detail}). ` +
      'If this model is tool-unreliable, drop tools from scenario.features or pick a ' +
      'different scenario.model in matrix.ts.',
  );
}

type ChatToolCall = {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
};

type ChatBody = {
  choices?: Array<{
    message?: { role?: string; content?: string | null; tool_calls?: ChatToolCall[] };
    finish_reason?: string | null;
  }>;
};

export async function expectChatToolRoundTrip(app: LiveApp, model: string): Promise<void> {
  const first = await post<ChatBody>(app, '/v1/chat/completions', {
    model,
    messages: [{ role: 'user', content: TOOL_PROMPT }],
    tools: [CHAT_WEATHER_TOOL],
    max_tokens: MAX_TOKENS,
  });

  expect(first.status).toBe(200);
  const message = first.body.choices?.[0]?.message;
  const toolCall = message?.tool_calls?.[0];
  if (!toolCall?.id || !toolCall.function?.name) {
    throw noToolCall(
      model,
      '/v1/chat/completions',
      `finish_reason=${String(first.body.choices?.[0]?.finish_reason)}`,
    );
  }

  expect(toolCall.function.name).toBe('get_weather');
  const args = JSON.parse(toolCall.function.arguments ?? '{}') as { city?: string };
  expect(typeof args.city).toBe('string');

  const second = await post<ChatBody>(app, '/v1/chat/completions', {
    model,
    messages: [
      { role: 'user', content: TOOL_PROMPT },
      { role: 'assistant', content: message?.content ?? null, tool_calls: [toolCall] },
      { role: 'tool', tool_call_id: toolCall.id, content: TOOL_RESULT_JSON },
    ],
    tools: [CHAT_WEATHER_TOOL],
    max_tokens: MAX_TOKENS,
  });

  expect(second.status).toBe(200);
  const answer = second.body.choices?.[0]?.message?.content ?? '';
  expect(answer).toMatch(FINAL_ANSWER);
}

type MessagesContentBlock = {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
};

type MessagesBody = {
  type?: string;
  content?: MessagesContentBlock[];
  stop_reason?: string | null;
  error?: { type?: string; message?: string };
};

export async function expectMessagesToolRoundTrip(app: LiveApp, model: string): Promise<void> {
  const first = await post<MessagesBody>(app, '/v1/messages', {
    model,
    messages: [{ role: 'user', content: TOOL_PROMPT }],
    tools: [MESSAGES_WEATHER_TOOL],
    max_tokens: MAX_TOKENS,
  });

  expect(first.status).toBe(200);
  const toolUse = (first.body.content ?? []).find((b) => b.type === 'tool_use');
  if (!toolUse?.id || !toolUse.name) {
    throw noToolCall(model, '/v1/messages', `stop_reason=${String(first.body.stop_reason)}`);
  }

  expect(toolUse.name).toBe('get_weather');
  expect(typeof (toolUse.input as { city?: unknown } | undefined)?.city).toBe('string');

  const second = await post<MessagesBody>(app, '/v1/messages', {
    model,
    messages: [
      { role: 'user', content: TOOL_PROMPT },
      { role: 'assistant', content: first.body.content },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: TOOL_RESULT_JSON }],
      },
    ],
    tools: [MESSAGES_WEATHER_TOOL],
    max_tokens: MAX_TOKENS,
  });

  expect(second.status).toBe(200);
  const answer = (second.body.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');

  expect(answer).toMatch(FINAL_ANSWER);
}

type ResponsesOutputItem = {
  type?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
  role?: string;
  content?: Array<{ type?: string; text?: string }>;
};

type ResponsesBody = {
  object?: string;
  status?: string;
  output?: ResponsesOutputItem[];
  output_text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    output_tokens_details?: { reasoning_tokens?: number };
  };
  error?: { type?: string; message?: string } | null;
};

export async function expectResponsesToolRoundTrip(app: LiveApp, model: string): Promise<void> {
  const first = await post<ResponsesBody>(app, '/v1/responses', {
    model,
    input: TOOL_PROMPT,
    tools: [RESPONSES_WEATHER_TOOL],
    max_output_tokens: MAX_TOKENS,
  });

  expect(first.status).toBe(200);
  const call = (first.body.output ?? []).find((item) => item.type === 'function_call');
  if (!call?.call_id || !call.name) {
    throw noToolCall(model, '/v1/responses', `status=${String(first.body.status)}`);
  }

  expect(call.name).toBe('get_weather');
  const args = JSON.parse(call.arguments ?? '{}') as { city?: string };
  expect(typeof args.city).toBe('string');

  const second = await post<ResponsesBody>(app, '/v1/responses', {
    model,
    input: [
      { role: 'user', content: TOOL_PROMPT },
      {
        type: 'function_call',
        call_id: call.call_id,
        name: call.name,
        arguments: call.arguments ?? '{}',
      },
      { type: 'function_call_output', call_id: call.call_id, output: TOOL_RESULT_JSON },
    ],
    tools: [RESPONSES_WEATHER_TOOL],
    max_output_tokens: MAX_TOKENS,
  });

  expect(second.status).toBe(200);
  expect(second.body.output_text ?? '').toMatch(FINAL_ANSWER);
}

export async function expectChatParallelToolCalls(app: LiveApp, model: string): Promise<void> {
  const { status, body } = await post<ChatBody>(app, '/v1/chat/completions', {
    model,
    messages: [
      {
        role: 'user',
        content:
          'Use your tools to answer BOTH: the current weather in Paris AND the population of France.',
      },
    ],
    tools: [CHAT_WEATHER_TOOL, CHAT_POPULATION_TOOL],
    max_tokens: MAX_TOKENS,
  });

  expect(status).toBe(200);
  const toolCalls = body.choices?.[0]?.message?.tool_calls ?? [];
  if (toolCalls.length === 0) {
    throw noToolCall(model, '/v1/chat/completions (parallel)', 'no tool_calls');
  }

  const names = toolCalls.map((c) => c.function?.name);

  for (const name of names) {
    expect(['get_weather', 'get_population']).toContain(name);
  }

  const ids = toolCalls.map((c) => c.id);
  expect(new Set(ids).size).toBe(ids.length);
}

const PLANT = 'My name is Waldo. Remember it.';
const PLANT_ACK = 'Nice to meet you, Waldo.';
const RECALL = 'What is my name? Reply with just the name.';
const RECALLED = /waldo/i;

export async function expectChatMultiTurn(app: LiveApp, model: string): Promise<void> {
  const { status, body } = await post<ChatBody>(app, '/v1/chat/completions', {
    model,
    messages: [
      { role: 'user', content: PLANT },
      { role: 'assistant', content: PLANT_ACK },
      { role: 'user', content: RECALL },
    ],
    max_tokens: MAX_TOKENS,
  });

  expect(status).toBe(200);
  expect(body.choices?.[0]?.message?.content ?? '').toMatch(RECALLED);
}

export async function expectMessagesMultiTurn(app: LiveApp, model: string): Promise<void> {
  const { status, body } = await post<MessagesBody>(app, '/v1/messages', {
    model,
    messages: [
      { role: 'user', content: PLANT },
      { role: 'assistant', content: PLANT_ACK },
      { role: 'user', content: RECALL },
    ],
    max_tokens: MAX_TOKENS,
  });

  expect(status).toBe(200);
  const text = (body.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');

  expect(text).toMatch(RECALLED);
}

export async function expectResponsesMultiTurn(app: LiveApp, model: string): Promise<void> {
  const { status, body } = await post<ResponsesBody>(app, '/v1/responses', {
    model,
    input: [
      { role: 'user', content: PLANT },
      { role: 'assistant', content: [{ type: 'output_text', text: PLANT_ACK }] },
      { role: 'user', content: RECALL },
    ],
    max_output_tokens: MAX_TOKENS,
  });

  expect(status).toBe(200);
  expect(body.output_text ?? '').toMatch(RECALLED);
}

const LONG_ASK = 'Write a detailed 2000-word essay about the history of frogs.';
const TINY_BUDGET = 16;

export async function expectChatTruncation(app: LiveApp, model: string): Promise<void> {
  const { status, body } = await post<ChatBody>(app, '/v1/chat/completions', {
    model,
    messages: [{ role: 'user', content: LONG_ASK }],
    max_tokens: TINY_BUDGET,
  });

  expect(status).toBe(200);
  expect(body.choices?.[0]?.finish_reason).toBe('length');
}

export async function expectMessagesTruncation(app: LiveApp, model: string): Promise<void> {
  const { status, body } = await post<MessagesBody>(app, '/v1/messages', {
    model,
    messages: [{ role: 'user', content: LONG_ASK }],
    max_tokens: TINY_BUDGET,
  });

  expect(status).toBe(200);
  expect(body.stop_reason).toBe('max_tokens');
}

export async function expectResponsesTruncation(app: LiveApp, model: string): Promise<void> {
  const { status, body } = await post<ResponsesBody>(app, '/v1/responses', {
    model,
    input: LONG_ASK,
    max_output_tokens: TINY_BUDGET,
  });

  expect(status).toBe(200);
  expect(['incomplete', 'completed']).toContain(body.status);
  const visible =
    (body.usage?.output_tokens ?? 0) - (body.usage?.output_tokens_details?.reasoning_tokens ?? 0);

  expect(visible).toBeLessThanOrEqual(TINY_BUDGET * 4);
}

const BOGUS_MODEL_SUFFIX = 'does-not-exist-xyz';

type OpenAIErrorBody = { error?: { message?: string; type?: string; code?: string | null } };

type AnthropicErrorBody = { type?: string; error?: { type?: string; message?: string } };

export async function expectChatErrorEnvelope(app: LiveApp, label: string): Promise<void> {
  const { status, body } = await post<OpenAIErrorBody>(app, '/v1/chat/completions', {
    model: `${label}/${BOGUS_MODEL_SUFFIX}`,
    messages: [{ role: 'user', content: 'hi' }],
    max_tokens: 16,
  });

  expect(status).toBeGreaterThanOrEqual(400);
  expect(status).toBeLessThan(600);
  expect(typeof body.error?.message).toBe('string');
  expect(typeof body.error?.type).toBe('string');
}

export async function expectMessagesErrorEnvelope(app: LiveApp, label: string): Promise<void> {
  const { status, body } = await post<AnthropicErrorBody>(app, '/v1/messages', {
    model: `${label}/${BOGUS_MODEL_SUFFIX}`,
    messages: [{ role: 'user', content: 'hi' }],
    max_tokens: 16,
  });

  expect(status).toBeGreaterThanOrEqual(400);
  expect(status).toBeLessThan(600);
  expect(body.type).toBe('error');
  expect(typeof body.error?.type).toBe('string');
  expect(typeof body.error?.message).toBe('string');
}

export async function expectResponsesErrorEnvelope(app: LiveApp, label: string): Promise<void> {
  const { status, body } = await post<OpenAIErrorBody>(app, '/v1/responses', {
    model: `${label}/${BOGUS_MODEL_SUFFIX}`,
    input: 'hi',
    max_output_tokens: 16,
  });

  expect(status).toBeGreaterThanOrEqual(400);
  expect(status).toBeLessThan(600);
  expect(typeof body.error?.message).toBe('string');
}

export async function expectChatStreamAbort(
  app: LiveApp,
  model: string,
  label: string,
): Promise<void> {
  const res = await postRaw(app, '/v1/chat/completions', {
    model,
    messages: [{ role: 'user', content: LONG_ASK }],
    max_tokens: MAX_TOKENS,
    stream: true,
  });

  expect(res.status).toBe(200);
  const reader = res.body!.getReader();
  const first = await reader.read();
  expect(first.done).toBe(false);
  await reader.cancel();

  await expectChatErrorEnvelope(app, label);
}

const OVERSIZED_PROMPT = Array.from({ length: 1_300_000 }, (_, index) => `w${index % 1000}`).join(
  ' ',
);

export async function expectChatContextOverflow(app: LiveApp, model: string): Promise<void> {
  const res = await postRaw(app, '/v1/chat/completions', {
    model,
    messages: [{ role: 'user', content: OVERSIZED_PROMPT }],
    max_tokens: 32,
  });

  const body = (await res.json()) as OpenAIErrorBody;

  expect(res.status, JSON.stringify(body)).toBe(400);
  expect(body.error?.code).toBe('context_length_exceeded');
}

type ChatChunk = {
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
};

export async function expectChatStreamingToolCall(app: LiveApp, model: string): Promise<void> {
  const res = await postRaw(app, '/v1/chat/completions', {
    model,
    messages: [{ role: 'user', content: TOOL_PROMPT }],
    tools: [CHAT_WEATHER_TOOL],
    max_tokens: MAX_TOKENS,
    stream: true,
  });

  expect(res.status).toBe(200);
  const chunks = parseSse(await res.text())
    .filter((f) => f.data !== '[DONE]')
    .map((f) => JSON.parse(f.data) as ChatChunk);

  let id: string | undefined;
  let name = '';
  let args = '';

  for (const chunk of chunks) {
    for (const tc of chunk.choices?.[0]?.delta?.tool_calls ?? []) {
      id ??= tc.id;
      name += tc.function?.name ?? '';
      args += tc.function?.arguments ?? '';
    }
  }

  if (!id || !name) {
    throw noToolCall(model, '/v1/chat/completions (streaming)', 'no tool_call deltas');
  }

  expect(name).toBe('get_weather');
  const parsed = JSON.parse(args) as { city?: string };
  expect(typeof parsed.city).toBe('string');
  expect(chunks.some((c) => c.choices?.[0]?.finish_reason === 'tool_calls')).toBe(true);
}
