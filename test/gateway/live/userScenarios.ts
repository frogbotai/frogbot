import { expect } from 'vitest';

import { parseSse } from '../../__helpers/gateway/parse-sse.js';
import { FIXTURE_FACTS, fixtureBase64, fixtureDataUrl, type LiveFixture } from '../../live/live.js';
import { type LiveApp, post, postRaw } from './routes.js';

const MAX_TOKENS = 2048;

const RECEIPT_QUESTION = 'What is the TOTAL on this receipt? Reply with just the amount.';
const PDF_QUESTION = 'What renewal code does this agreement mention? Reply with just the code.';

type ChatMessage = {
  role: string;
  content?: unknown;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
};

type ChatToolCall = {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
};

type ChatBody = {
  choices?: Array<{
    message?: { content?: string | null; tool_calls?: ChatToolCall[] };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens_details?: { cached_tokens?: number } };
};

type MessagesBlock = {
  type?: string;
  text?: string;
  thinking?: string;
  signature?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
};

type MessagesBody = {
  content?: MessagesBlock[];
  stop_reason?: string | null;
  usage?: { cache_read_input_tokens?: number };
};

type ResponsesBody = {
  status?: string;
  output_text?: string;
  usage?: { input_tokens_details?: { cached_tokens?: number } };
};

function chatImage(name: LiveFixture) {
  return { type: 'image_url', image_url: { url: fixtureDataUrl(name) } };
}

function chatPdf() {
  return {
    type: 'file',
    file: { filename: 'agreement.pdf', file_data: fixtureDataUrl('agreement.pdf') },
  };
}

function messagesImage(name: LiveFixture) {
  return {
    type: 'image',
    source: { type: 'base64', media_type: 'image/png', data: fixtureBase64(name) },
  };
}

function messagesPdf() {
  return {
    type: 'document',
    source: { type: 'base64', media_type: 'application/pdf', data: fixtureBase64('agreement.pdf') },
  };
}

function responsesImage(name: LiveFixture) {
  return { type: 'input_image', image_url: fixtureDataUrl(name) };
}

function responsesPdf() {
  return {
    type: 'input_file',
    filename: 'agreement.pdf',
    file_data: fixtureDataUrl('agreement.pdf'),
  };
}

async function chat(app: LiveApp, body: Record<string, unknown>): Promise<ChatBody> {
  const response = await post<ChatBody>(app, '/v1/chat/completions', {
    max_tokens: MAX_TOKENS,
    ...body,
  });

  expect(response.status, JSON.stringify(response.body)).toBe(200);

  return response.body;
}

async function chatText(app: LiveApp, body: Record<string, unknown>): Promise<string> {
  const result = await chat(app, body);

  return result.choices?.[0]?.message?.content ?? '';
}

async function messages(app: LiveApp, body: Record<string, unknown>): Promise<MessagesBody> {
  const response = await post<MessagesBody>(app, '/v1/messages', {
    max_tokens: MAX_TOKENS,
    ...body,
  });

  expect(response.status, JSON.stringify(response.body)).toBe(200);

  return response.body;
}

function messagesText(body: MessagesBody): string {
  return (body.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('');
}

async function responses(app: LiveApp, body: Record<string, unknown>): Promise<ResponsesBody> {
  const response = await post<ResponsesBody>(app, '/v1/responses', {
    max_output_tokens: MAX_TOKENS,
    ...body,
  });

  expect(response.status, JSON.stringify(response.body)).toBe(200);
  expect(response.body.status).toBe('completed');

  return response.body;
}

async function streamChatText(app: LiveApp, body: Record<string, unknown>): Promise<string> {
  const response = await postRaw(app, '/v1/chat/completions', {
    max_tokens: MAX_TOKENS,
    stream: true,
    ...body,
  });

  expect(response.status).toBe(200);

  const frames = parseSse(await response.text()).filter((frame) => frame.data !== '[DONE]');

  return frames
    .map((frame) => JSON.parse(frame.data) as { choices?: Array<{ delta?: { content?: string } }> })
    .map((chunk) => chunk.choices?.[0]?.delta?.content ?? '')
    .join('');
}

export async function runChatVision(app: LiveApp, model: string): Promise<void> {
  const text = await chatText(app, {
    model,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: RECEIPT_QUESTION }, chatImage('receipt.png')],
      },
    ],
  });

  expect(text).toMatch(FIXTURE_FACTS.receiptTotal);
}

export async function runChatVisionStream(app: LiveApp, model: string): Promise<void> {
  const text = await streamChatText(app, {
    model,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: RECEIPT_QUESTION }, chatImage('receipt.png')],
      },
    ],
  });

  expect(text).toMatch(FIXTURE_FACTS.receiptTotal);
}

export async function runMessagesVision(app: LiveApp, model: string): Promise<void> {
  const body = await messages(app, {
    model,
    messages: [
      {
        role: 'user',
        content: [messagesImage('receipt.png'), { type: 'text', text: RECEIPT_QUESTION }],
      },
    ],
  });

  expect(messagesText(body)).toMatch(FIXTURE_FACTS.receiptTotal);
}

export async function runResponsesVision(app: LiveApp, model: string): Promise<void> {
  const body = await responses(app, {
    model,
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: RECEIPT_QUESTION }, responsesImage('receipt.png')],
      },
    ],
  });

  expect(body.output_text).toMatch(FIXTURE_FACTS.receiptTotal);
}

export async function runChatMultiImage(app: LiveApp, model: string): Promise<void> {
  const text = await chatText(app, {
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Image 1:' },
          chatImage('receipt.png'),
          { type: 'text', text: 'Image 2:' },
          chatImage('shapes.png'),
          {
            type: 'text',
            text: 'What is the cafe name in image 1, and what colour is the circle in image 2? Answer in one short sentence.',
          },
        ],
      },
    ],
  });

  expect(text).toMatch(FIXTURE_FACTS.cafeName);
  expect(text).toMatch(FIXTURE_FACTS.circleColor);
}

export async function runChatImageFollowUp(app: LiveApp, model: string): Promise<void> {
  const history: ChatMessage[] = [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Here is a picture of shapes.' }, chatImage('shapes.png')],
    },
  ];

  const first = await chatText(app, { model, messages: history });

  history.push({ role: 'assistant', content: first });
  history.push({
    role: 'user',
    content: 'What colour is the square in the picture I sent? Reply with one word.',
  });

  const text = await chatText(app, { model, messages: history });

  expect(text).toMatch(FIXTURE_FACTS.squareColor);
}

export async function runChatPdf(app: LiveApp, model: string): Promise<void> {
  const text = await chatText(app, {
    model,
    messages: [{ role: 'user', content: [{ type: 'text', text: PDF_QUESTION }, chatPdf()] }],
  });

  expect(text).toMatch(FIXTURE_FACTS.renewalCode);
}

export async function runMessagesPdf(app: LiveApp, model: string): Promise<void> {
  const body = await messages(app, {
    model,
    messages: [{ role: 'user', content: [messagesPdf(), { type: 'text', text: PDF_QUESTION }] }],
  });

  expect(messagesText(body)).toMatch(FIXTURE_FACTS.renewalCode);
}

export async function runResponsesPdf(app: LiveApp, model: string): Promise<void> {
  const body = await responses(app, {
    model,
    input: [
      { role: 'user', content: [{ type: 'input_text', text: PDF_QUESTION }, responsesPdf()] },
    ],
  });

  expect(body.output_text).toMatch(FIXTURE_FACTS.renewalCode);
}

export async function runChatAudio(app: LiveApp, model: string): Promise<void> {
  const text = await chatText(app, {
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Transcribe this recording exactly.' },
          {
            type: 'input_audio',
            input_audio: { data: fixtureBase64('speech.wav'), format: 'wav' },
          },
        ],
      },
    ],
  });

  expect(text).toMatch(FIXTURE_FACTS.speech);
}

const EXPENSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    merchant: { type: 'string' },
    total: { type: 'number' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { name: { type: 'string' }, price: { type: 'number' } },
        required: ['name', 'price'],
      },
    },
  },
  required: ['merchant', 'total', 'items'],
};

const RECEIPT_TEXT =
  'FROGBOT CAFE\nLatte $5.50\nAvocado toast $12.00\nPond salad $18.25\nTax $6.42\nTOTAL $42.17';

type Expense = { merchant: string; total: number; items: Array<{ name: string; price: number }> };

function expectExpense(raw: string | null | undefined): void {
  const expense = JSON.parse(raw ?? '') as Expense;

  expect(expense.merchant).toMatch(FIXTURE_FACTS.cafeName);
  expect(expense.total).toBeCloseTo(42.17, 2);
  expect(expense.items.map((item) => item.name.toLowerCase())).toEqual(
    expect.arrayContaining(['latte', 'avocado toast', 'pond salad']),
  );
}

export async function runChatStructuredOutput(app: LiveApp, model: string): Promise<void> {
  const text = await chatText(app, {
    model,
    messages: [
      { role: 'user', content: `Extract this receipt as an expense record.\n\n${RECEIPT_TEXT}` },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'expense', strict: true, schema: EXPENSE_SCHEMA },
    },
  });

  expectExpense(text);
}

export async function runResponsesStructuredOutput(app: LiveApp, model: string): Promise<void> {
  const body = await responses(app, {
    model,
    input: `Extract this receipt as an expense record.\n\n${RECEIPT_TEXT}`,
    text: {
      format: { type: 'json_schema', name: 'expense', strict: true, schema: EXPENSE_SCHEMA },
    },
  });

  expectExpense(body.output_text);
}

const RECORD_EXPENSE_TOOL = {
  type: 'function',
  function: {
    name: 'record_expense',
    description: 'Record an expense from a receipt',
    parameters: {
      type: 'object',
      properties: { merchant: { type: 'string' }, amount: { type: 'number' } },
      required: ['merchant', 'amount'],
    },
  },
};

export async function runChatVisionToolCall(app: LiveApp, model: string): Promise<void> {
  const body = await chat(app, {
    model,
    tools: [RECORD_EXPENSE_TOOL],
    tool_choice: 'required',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Record this receipt as an expense.' },
          chatImage('receipt.png'),
        ],
      },
    ],
  });

  const call = body.choices?.[0]?.message?.tool_calls?.[0];

  expect(call?.function?.name).toBe('record_expense');

  const args = JSON.parse(call?.function?.arguments ?? '{}') as { amount?: number };

  expect(args.amount).toBeCloseTo(42.17, 2);
}

const REASONING_QUESTION =
  'A pond has 17 lily pads with 23 frogs on each. 6 frogs leave. How many frogs remain? Reply with just the number.';

export async function runChatReasoning(app: LiveApp, model: string): Promise<void> {
  const text = await chatText(app, {
    model,
    reasoning_effort: 'low',
    messages: [{ role: 'user', content: REASONING_QUESTION }],
  });

  expect(text).toMatch(/\b385\b/);
}

export async function runResponsesReasoning(app: LiveApp, model: string): Promise<void> {
  const body = await responses(app, {
    model,
    reasoning: { effort: 'low' },
    input: REASONING_QUESTION,
  });

  expect(body.output_text).toMatch(/\b385\b/);
}

const THINKING = { type: 'enabled', budget_tokens: 1024 };

const MESSAGES_WEATHER_TOOL = {
  name: 'get_weather',
  description: 'Get the current weather for a city',
  input_schema: {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city'],
  },
};

export async function runMessagesThinking(app: LiveApp, model: string): Promise<void> {
  const body = await messages(app, {
    model,
    thinking: THINKING,
    messages: [{ role: 'user', content: REASONING_QUESTION }],
  });

  const thinking = body.content?.find((block) => block.type === 'thinking');

  expect(thinking?.thinking?.length).toBeGreaterThan(0);
  expect(thinking?.signature?.length).toBeGreaterThan(0);
  expect(messagesText(body)).toMatch(/\b8\b/);
}

export async function runMessagesThinkingToolLoop(app: LiveApp, model: string): Promise<void> {
  const question = {
    role: 'user',
    content: 'Should I bring an umbrella in Paris today? Check the weather first.',
  };

  const first = await messages(app, {
    model,
    thinking: THINKING,
    tools: [MESSAGES_WEATHER_TOOL],
    messages: [question],
  });

  const toolUse = first.content?.find((block) => block.type === 'tool_use');

  expect(first.stop_reason).toBe('tool_use');
  expect(first.content?.some((block) => block.type === 'thinking')).toBe(true);

  const second = await messages(app, {
    model,
    thinking: THINKING,
    tools: [MESSAGES_WEATHER_TOOL],
    messages: [
      question,
      { role: 'assistant', content: first.content },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUse?.id,
            content: '{"condition":"heavy rain","temp_c":12}',
          },
        ],
      },
    ],
  });

  expect(second.stop_reason).toBe('end_turn');
  expect(messagesText(second)).toMatch(/umbrella|rain/i);
}

const HANDBOOK = Array.from(
  { length: 320 },
  (_, index) =>
    `Rule ${index + 1}: the ${['north', 'south', 'east', 'west'][index % 4]} pond keeper logs visitor ${index * 7} before feeding ${['koi', 'frogs', 'newts', 'ducks'][index % 4]}.`,
).join('\n');

const CACHE_SYSTEM = `You are the FrogBot pond assistant. Follow the handbook exactly.\n\n${HANDBOOK}`;

const CACHE_QUESTION = 'How many rules does the handbook have? Reply with just the number.';

export type CacheWire = 'chat' | 'chat-stream' | 'messages-stream' | 'responses-stream';

async function cachedTokens(app: LiveApp, model: string, wire: CacheWire): Promise<number> {
  const cacheControl = { type: 'ephemeral' };

  if (wire === 'chat') {
    const body = await chat(app, {
      model,
      max_tokens: 512,
      messages: [
        {
          role: 'system',
          content: [{ type: 'text', text: CACHE_SYSTEM, cache_control: cacheControl }],
        },
        { role: 'user', content: CACHE_QUESTION },
      ],
    });

    return body.usage?.prompt_tokens_details?.cached_tokens ?? 0;
  }

  if (wire === 'chat-stream') {
    const response = await postRaw(app, '/v1/chat/completions', {
      model,
      max_tokens: 512,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        {
          role: 'system',
          content: [{ type: 'text', text: CACHE_SYSTEM, cache_control: cacheControl }],
        },
        { role: 'user', content: CACHE_QUESTION },
      ],
    });

    expect(response.status).toBe(200);

    const chunks = parseSse(await response.text())
      .filter((frame) => frame.data !== '[DONE]')
      .map((frame) => JSON.parse(frame.data) as ChatBody);

    return chunks.at(-1)?.usage?.prompt_tokens_details?.cached_tokens ?? 0;
  }

  if (wire === 'messages-stream') {
    const response = await postRaw(app, '/v1/messages', {
      model,
      max_tokens: 512,
      stream: true,
      system: [{ type: 'text', text: CACHE_SYSTEM, cache_control: cacheControl }],
      messages: [{ role: 'user', content: CACHE_QUESTION }],
    });

    expect(response.status).toBe(200);

    const events = parseSse(await response.text()).map(
      (frame) =>
        JSON.parse(frame.data) as {
          message?: { usage?: { cache_read_input_tokens?: number } };
          usage?: { cache_read_input_tokens?: number };
        },
    );

    return Math.max(
      0,
      ...events.map(
        (event) =>
          event.usage?.cache_read_input_tokens ??
          event.message?.usage?.cache_read_input_tokens ??
          0,
      ),
    );
  }

  const response = await postRaw(app, '/v1/responses', {
    model,
    max_output_tokens: 512,
    stream: true,
    instructions: CACHE_SYSTEM,
    input: CACHE_QUESTION,
  });

  expect(response.status).toBe(200);

  const terminal = parseSse(await response.text())
    .map((frame) => JSON.parse(frame.data) as { type?: string; response?: ResponsesBody })
    .find((event) => event.type === 'response.completed' || event.type === 'response.incomplete');

  return terminal?.response?.usage?.input_tokens_details?.cached_tokens ?? 0;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runPromptCache(app: LiveApp, model: string, wire: CacheWire): Promise<void> {
  await cachedTokens(app, model, wire);

  let cached = 0;

  // Several providers (Groq, Gemini implicit) cache best-effort across a node
  // pool, so a hit can take a few tries; a real regression still fails all six.
  for (let attempt = 0; attempt < 6 && cached === 0; attempt++) {
    if (attempt > 0) await sleep(3000);

    cached = await cachedTokens(app, model, wire);
  }

  expect(cached, `${model} reported no cached tokens on ${wire}`).toBeGreaterThan(0);
}
