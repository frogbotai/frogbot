import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
  SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import type { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { parseSse } from '../__helpers/gateway/parse-sse.js';
import { postJson } from '../__helpers/gateway/post-json.js';
import { requiredToolCall } from '../__helpers/gateway/required-tool-call.js';
import { finish, mockUsage } from './mockModel.js';

const DEFAULT_USAGE = mockUsage({
  inputTokens: { total: 5, noCache: 5 },
  outputTokens: { total: 4, text: 4 },
});

const STOP_FINISH = finish('stop', 'stop');

const TOOL_CALLS_FINISH = finish('tool-calls', 'tool_calls');

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
    get supportedUrls() {
      return Promise.resolve({});
    },
    doGenerate: (options: LanguageModelV4CallOptions) => {
      onCall?.(options);

      const toolCalls = requiredToolCall(options);

      return Promise.resolve({
        content: toolCalls.length > 0 ? toolCalls : [{ type: 'text' as const, text }],
        finishReason: toolCalls.length > 0 ? TOOL_CALLS_FINISH : STOP_FINISH,
        usage: DEFAULT_USAGE,
        warnings: [],
        response: {
          id: 'mock-resp-1',
          modelId: 'mock-model',
          timestamp: new Date('2026-01-01T00:00:00Z'),
        },
      });
    },
    doStream: (options: LanguageModelV4CallOptions) => {
      onCall?.(options);
      const parts: LanguageModelV4StreamPart[] = streamParts ?? [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text-0' },
        { type: 'text-delta', id: 'text-0', delta: text },
        { type: 'text-end', id: 'text-0' },
        { type: 'finish', finishReason: STOP_FINISH, usage: DEFAULT_USAGE },
      ];

      return Promise.resolve({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            for (const part of parts) {
              controller.enqueue(part);
            }

            controller.close();
          },
        }),
      });
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

function parseChatChunks(sseText: string): Array<Record<string, any>> {
  return parseSse(sseText)
    .filter((f) => f.data !== '[DONE]')
    .map((f) => JSON.parse(f.data) as Record<string, any>);
}

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
    expect(messageDelta!.usage.output_tokens).toBe(4);
    expect(messageDelta!.usage.input_tokens).toBe(5);
  });
});

describe('stream id/model stability', () => {
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
    expect(completed!.response.id, 'envelope id must be stable created → completed').toBe(
      created!.response.id,
    );
    expect(completed!.response.model, 'envelope model must be stable created → completed').toBe(
      created!.response.model,
    );
  });
});

describe('chat schema accepts spec-valid message shapes', () => {
  it('accepts system message with array-of-text-parts content', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel(
      'openai',
      createRecordingModel({
        onCall: (options) => {
          callOptions = options;
        },
      }),
    );

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

  it('accepts tool message with array-of-text-parts content', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel(
      'openai',
      createRecordingModel({
        onCall: (options) => {
          callOptions = options;
        },
      }),
    );

    const { status, body } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'user', content: 'weather in Paris?' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'get_weather', arguments: '{"city":"Paris"}' },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'call_1',
          content: [{ type: 'text', text: 'g8-tool-result-18C' }],
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            parameters: { type: 'object', properties: { city: { type: 'string' } } },
          },
        },
      ],
    });

    expect(status, `expected 200, got ${status}: ${JSON.stringify(body)}`).toBe(200);
    expect(JSON.stringify(callOptions?.prompt)).toContain('g8-tool-result-18C');
  });

  it('accepts assistant message with array-of-parts content', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel(
      'openai',
      createRecordingModel({
        onCall: (options) => {
          callOptions = options;
        },
      }),
    );

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

function expectOkOr400(status: number, check: () => void) {
  if (status === 400) return;

  expect(status).toBe(200);

  check();
}

function expectForwardedOr400(args: {
  field: string;
  status: number;
  callOptions: LanguageModelV4CallOptions | undefined;
  evidence: string | RegExp;
}) {
  if (args.status === 400) return;

  expect(args.status).toBe(200);

  const serialized = JSON.stringify(args.callOptions ?? {});
  const found =
    typeof args.evidence === 'string'
      ? serialized.includes(args.evidence)
      : args.evidence.test(serialized);

  expect(
    found,
    `\`${args.field}\` was accepted (HTTP ${args.status}) but never reached upstream callOptions — silently dropped`,
  ).toBe(true);
}

describe('documented chat fields: forward or 400, never drop', () => {
  async function post(body: Record<string, unknown>) {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel(
      'openai',
      createRecordingModel({
        onCall: (options) => {
          callOptions = options;
        },
      }),
    );

    const { status } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      ...body,
    });

    return { status, callOptions: () => callOptions };
  }

  it('legacy functions/function_call produce tools upstream (or 400)', async () => {
    const { status, callOptions } = await post({
      functions: [
        {
          name: 'get_weather',
          parameters: { type: 'object', properties: { city: { type: 'string' } } },
        },
      ],
      function_call: 'auto',
    });

    expectOkOr400(status, () => {
      expect(
        callOptions()?.tools,
        '`functions` accepted but the model received no tools — silently dropped',
      ).toBeDefined();
      expect(JSON.stringify(callOptions()?.tools)).toContain('get_weather');
    });
  });

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

  it('store forwarded (or 400)', async () => {
    const { status, callOptions } = await post({ store: true });

    expectForwardedOr400({
      field: 'store',
      status,
      callOptions: callOptions(),
      evidence: /"store":\s*true/,
    });
  });

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

  it('service_tier forwarded (or 400)', async () => {
    const { status, callOptions } = await post({ service_tier: 'flex' });

    expectForwardedOr400({
      field: 'service_tier',
      status,
      callOptions: callOptions(),
      evidence: '"flex"',
    });
  });

  it('safety_identifier forwarded (or 400)', async () => {
    const { status, callOptions } = await post({ safety_identifier: 'g9-safety-sentinel' });

    expectForwardedOr400({
      field: 'safety_identifier',
      status,
      callOptions: callOptions(),
      evidence: 'g9-safety-sentinel',
    });
  });

  it('top_logprobs forwarded (or 400)', async () => {
    const { status, callOptions } = await post({ top_logprobs: 7 });

    expectForwardedOr400({
      field: 'top_logprobs',
      status,
      callOptions: callOptions(),
      evidence: /top_?[lL]ogprobs/,
    });
  });

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

  it('allowed_tools mode=required constrains the upstream call (or 400)', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel(
      'openai',
      createRecordingModel({
        onCall: (options) => {
          callOptions = options;
        },
      }),
    );

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

    expectOkOr400(status, () => {
      expect(
        callOptions?.toolChoice,
        'allowed_tools mode=required silently degraded to the SDK default (auto)',
      ).toEqual(expect.objectContaining({ type: 'required' }));
    });
  });

  it('rejects a genuinely unknown tool_choice shape with a 400', async () => {
    const app = makeAppWithModel('openai', createRecordingModel());

    const { status, body } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      tools: TOOLS,
      tool_choice: { type: 'g10-bogus-shape' },
    });

    expect(
      status,
      `unknown tool_choice shape must 400, got ${status}: ${JSON.stringify(body)}`,
    ).toBe(400);
  });
});

describe('streaming preserves reasoning_details metadata', () => {
  function reasoningStreamParts(
    providerMetadata: SharedV4ProviderMetadata,
  ): LanguageModelV4StreamPart[] {
    return [
      { type: 'stream-start', warnings: [] },
      { type: 'reasoning-start', id: 'r-0' },
      { type: 'reasoning-delta', id: 'r-0', delta: 'thinking hard', providerMetadata },
      { type: 'reasoning-end', id: 'r-0', providerMetadata },
      { type: 'text-start', id: 'text-0' },
      { type: 'text-delta', id: 'text-0', delta: 'the answer' },
      { type: 'text-end', id: 'text-0' },
      { type: 'finish', finishReason: STOP_FINISH, usage: DEFAULT_USAGE },
    ];
  }

  it('thinking signature survives to the streaming wire', async () => {
    const app = makeAppWithModel(
      'anthropic',
      createRecordingModel({
        streamParts: reasoningStreamParts({ anthropic: { signature: 'sig-g11-signature' } }),
      }),
    );

    const { status, text } = await postRaw(app, '/v1/chat/completions', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'think then answer' }],
      stream: true,
    });

    expect(status).toBe(200);
    expect(text).toContain('thinking hard');
    expect(text).toContain('sig-g11-signature');
  });

  it('redacted thinking data survives to the streaming wire', async () => {
    const app = makeAppWithModel(
      'anthropic',
      createRecordingModel({
        streamParts: reasoningStreamParts({ anthropic: { redactedData: 'g11-redacted-blob' } }),
      }),
    );

    const { status, text } = await postRaw(app, '/v1/chat/completions', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'think then answer' }],
      stream: true,
    });

    expect(status).toBe(200);
    expect(text).toContain('g11-redacted-blob');
  });
});
