import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4FinishReason,
  LanguageModelV4StreamPart,
  SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import type { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { parseSse } from '../__helpers/gateway/parse-sse.js';
import { postJson } from '../__helpers/gateway/post-json.js';
import { finish, mockUsage } from './mockModel.js';

const DEFAULT_USAGE = mockUsage({
  inputTokens: { total: 5, noCache: 5 },
  outputTokens: { total: 4, text: 4 },
});

const STOP_FINISH = finish('stop', 'stop');

function createRecordingModel(opts?: {
  text?: string;
  streamParts?: LanguageModelV4StreamPart[];
  finishReason?: LanguageModelV4FinishReason;
  usage?: typeof DEFAULT_USAGE;
  providerMetadata?: SharedV4ProviderMetadata;
  onCall?: (options: LanguageModelV4CallOptions) => void;
}): LanguageModelV4 {
  const {
    text = 'Hello',
    streamParts,
    finishReason = STOP_FINISH,
    usage = DEFAULT_USAGE,
    providerMetadata,
    onCall,
  } = opts ?? {};

  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() {
      return Promise.resolve({});
    },
    doGenerate: (options: LanguageModelV4CallOptions) => {
      onCall?.(options);

      return Promise.resolve({
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
      });
    },
    doStream: (options: LanguageModelV4CallOptions) => {
      onCall?.(options);
      const parts: LanguageModelV4StreamPart[] = streamParts ?? [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text-0' },
        { type: 'text-delta', id: 'text-0', delta: text },
        { type: 'text-end', id: 'text-0' },
        { type: 'finish', finishReason, usage, ...(providerMetadata ? { providerMetadata } : {}) },
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

describe('G60 — stop_sequence response field always null', () => {
  it('stop_sequence field echoes the matched stop sequence', async () => {
    const stopSequenceFinish = finish('stop', 'stop_sequence');

    const app = makeAppWithModel(
      'anthropic',
      createRecordingModel({
        finishReason: stopSequenceFinish,
        providerMetadata: { anthropic: { stopSequence: 'STOP' } },
      }),
    );

    const { status, body } = await postJson(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'stop here' }],
      max_tokens: 128,
      stop_sequences: ['STOP'],
    });

    expect(status).toBe(200);

    const resp = body as Record<string, unknown>;

    expect(resp.stop_reason).toBe('stop_sequence');
    expect(
      resp.stop_sequence,
      'stop_sequence field should not be null when stop_reason is stop_sequence',
    ).not.toBeNull();
    expect(resp.stop_sequence).toBe('STOP');
  });
});

describe('G61 — stop-reason taxonomy: other → null is spec-invalid', () => {
  it('non-streaming message never returns null stop_reason (G61)', async () => {
    const app = makeAppWithModel(
      'anthropic',
      createRecordingModel({
        finishReason: finish('other', 'model_context_window_exceeded'),
      }),
    );

    const { status, body } = await postJson(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'a very long prompt' }],
      max_tokens: 128,
    });

    expect(status).toBe(200);

    const resp = body as Record<string, unknown>;

    expect(resp.stop_reason, 'completed message must carry a non-null stop_reason').not.toBeNull();
  });
});

describe('G62 — usage detail fields on messages responses', () => {
  it('messages response includes output_tokens_details.thinking_tokens', async () => {
    const usageWithReasoning = mockUsage({
      inputTokens: { total: 10, noCache: 10 },
      outputTokens: { total: 15, text: 10, reasoning: 5 },
    });

    const app = makeAppWithModel(
      'anthropic',
      createRecordingModel({
        usage: usageWithReasoning,
      }),
    );

    const { status, body } = await postJson(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'think before answering' }],
      max_tokens: 128,
    });

    expect(status).toBe(200);

    const resp = body as Record<string, unknown>;
    const usage = resp.usage as Record<string, unknown>;

    expect(usage).toBeDefined();
    expect(usage).toHaveProperty('output_tokens_details');

    const details = usage.output_tokens_details as Record<string, unknown>;

    expect(details.thinking_tokens).toBe(5);
  });

  it('messages response includes cache_creation breakdown from raw provider usage', async () => {
    const app = makeAppWithModel(
      'anthropic',
      createRecordingModel({
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
      }),
    );

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
        usage: mockUsage({
          inputTokens: { total: 10, noCache: 8, cacheRead: 0, cacheWrite: 2 },
          outputTokens: { total: 15, text: 10, reasoning: 5 },
          raw: {
            input_tokens: 8,
            output_tokens: 15,
            cache_creation_input_tokens: 248,
            cache_creation: { ephemeral_5m_input_tokens: 148, ephemeral_1h_input_tokens: 100 },
            output_tokens_details: { thinking_tokens: 5 },
          },
        }),
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

    const usage = (JSON.parse(deltaFrame!.data) as Record<string, unknown>).usage as Record<
      string,
      unknown
    >;

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

    expect(usage).not.toHaveProperty('output_tokens_details');
    expect(usage).not.toHaveProperty('cache_creation');
  });
});

describe('G63 — messages tools: strict and cache_control forwarded', () => {
  it('tool cache_control reaches upstream providerOptions', async () => {
    let capturedOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel(
      'anthropic',
      createRecordingModel({
        onCall: (options) => {
          capturedOptions = options;
        },
      }),
    );

    const { status } = await postJson(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'call a tool' }],
      max_tokens: 128,
      tools: [
        {
          name: 'get_weather',
          description: 'Get weather',
          input_schema: { type: 'object', properties: { city: { type: 'string' } } },
          cache_control: { type: 'ephemeral' },
        },
      ],
    });

    expect(status).toBe(200);

    const toolsStr = JSON.stringify(capturedOptions?.tools ?? {});

    expect(toolsStr).toContain('ephemeral');
    expect(toolsStr).toContain('anthropic');
    expect(toolsStr).toContain('cacheControl');
  });
});

describe('G64 — assistant cache_control forwarded in messages route', () => {
  it('assistant message cache_control reaches upstream providerOptions', async () => {
    let capturedOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel(
      'anthropic',
      createRecordingModel({
        onCall: (options) => {
          capturedOptions = options;
        },
      }),
    );

    const { status } = await postJson(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [
        { role: 'user', content: 'hi' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'I will help you.', cache_control: { type: 'ephemeral' } },
          ],
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

describe('G65 — system block array: cache_control breakpoints preserved', () => {
  it('multiple system blocks with cache_control produce separate cache breakpoints', async () => {
    let capturedOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel(
      'anthropic',
      createRecordingModel({
        onCall: (options) => {
          capturedOptions = options;
        },
      }),
    );

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

    const prompt = capturedOptions?.prompt ?? [];
    const systemMsgs = prompt.filter((m) => m.role === 'system');
    const cacheBreakpoints = systemMsgs.filter((m) => {
      const anthropic = (m.providerOptions as Record<string, Record<string, unknown>> | undefined)
        ?.anthropic;

      return anthropic?.cacheControl !== undefined;
    });

    expect(cacheBreakpoints.length, 'both system cache_control breakpoints should survive').toBe(2);
  });
});

describe('G66 — top-level mcp_servers forwarded', () => {
  it('mcp_servers reaches upstream providerOptions (G66)', async () => {
    let capturedOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel(
      'anthropic',
      createRecordingModel({
        onCall: (options) => {
          capturedOptions = options;
        },
      }),
    );

    const { status } = await postJson(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'use my mcp tools' }],
      max_tokens: 128,
      mcp_servers: [{ type: 'url', url: 'https://mcp.example.com', name: 'my-tools' }],
    });

    expect(status).toBe(200);

    const anthropicOpts = capturedOptions?.providerOptions?.anthropic as
      Record<string, unknown> | undefined;

    expect(anthropicOpts?.mcpServers ?? anthropicOpts?.mcp_servers).toBeDefined();
  });
});

describe('G68 — empty upstream stream produces invalid messages wire', () => {
  it.fails('empty upstream stream emits valid message_start + message_stop', async () => {
    const emptyStreamModel: LanguageModelV4 = {
      specificationVersion: 'v4',
      provider: 'mock',
      modelId: 'mock-model',
      get supportedUrls() {
        return Promise.resolve({});
      },
      doGenerate: () => {
        return Promise.reject(new Error('non-streaming not expected in this test'));
      },
      doStream: () =>
        Promise.resolve({
          stream: new ReadableStream<LanguageModelV4StreamPart>({
            start(controller) {
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

    const events = parseSse(text)
      .map((f) => f.event)
      .filter(Boolean);

    expect(events, 'empty stream must emit at least message_start + message_stop').toContain(
      'message_start',
    );
    expect(events).toContain('message_stop');
  });

  it.fails('empty upstream stream on chat completions emits at least [DONE]', async () => {
    const emptyStreamModel: LanguageModelV4 = {
      specificationVersion: 'v4',
      provider: 'mock',
      modelId: 'mock-model',
      get supportedUrls() {
        return Promise.resolve({});
      },
      doGenerate: () => {
        return Promise.reject(new Error('non-streaming not expected in this test'));
      },
      doStream: () =>
        Promise.resolve({
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

describe('G69 — document title dropped in translation', () => {
  it('document block title reaches the model (G69)', async () => {
    let capturedOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel(
      'anthropic',
      createRecordingModel({
        onCall: (options) => {
          capturedOptions = options;
        },
      }),
    );

    const { status } = await postJson(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      max_tokens: 128,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              title: 'Q3 Financials',
              source: { type: 'text', media_type: 'text/plain', data: 'revenue up 12%' },
            },
          ],
        },
      ],
    });

    expect(status).toBe(200);

    const prompt = capturedOptions?.prompt ?? [];
    const serialized = JSON.stringify(prompt);

    expect(serialized, 'document title should be forwarded to the model').toContain(
      'Q3 Financials',
    );
  });
});

describe('G49 — x-request-id present on streaming messages SSE response', () => {
  it('streaming messages response includes x-request-id header', async () => {
    const app = makeAppWithModel('anthropic', createRecordingModel());
    const { status, headers } = await postRaw(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 128,
      stream: true,
    });

    expect(status).toBe(200);
    expect(
      headers.get('x-request-id'),
      'streaming messages SSE response missing x-request-id',
    ).not.toBeNull();
  });
});

describe('G51 — messages stream terminal-frame count', () => {
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

    expect(stopFrames, 'messages stream must terminate with exactly one message_stop').toHaveLength(
      1,
    );

    const doneCount = (text.match(/^data: \[DONE\]$/gm) ?? []).length;

    expect(doneCount, 'messages wire must not carry the OpenAI-only [DONE] sentinel').toBe(0);
  });
});
