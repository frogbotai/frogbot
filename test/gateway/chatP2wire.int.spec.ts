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
import { finish, mockUsage, partStream } from './mockModel.js';

const DEFAULT_USAGE = mockUsage({
  inputTokens: { total: 5, noCache: 5 },
  outputTokens: { total: 4, text: 4 },
});

const STOP_FINISH = finish('stop', 'stop');

function createRecordingModel(opts?: {
  text?: string;
  streamParts?: LanguageModelV4StreamPart[];
  finishReason?: LanguageModelV4FinishReason;
  onCall?: (options: LanguageModelV4CallOptions) => void;
  providerMetadata?: SharedV4ProviderMetadata;
  responseBody?: unknown;
}): LanguageModelV4 {
  const {
    text = 'Hello',
    streamParts,
    finishReason = STOP_FINISH,
    onCall,
    providerMetadata,
    responseBody,
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
        usage: DEFAULT_USAGE,
        warnings: [],
        response: {
          id: 'mock-resp-1',
          modelId: 'mock-model',
          timestamp: new Date('2026-01-01T00:00:00Z'),
          ...(responseBody !== undefined ? { body: responseBody } : {}),
        },
        ...(providerMetadata ? { providerMetadata } : {}),
      });
    },
    doStream: (options: LanguageModelV4CallOptions) => {
      onCall?.(options);
      const parts: LanguageModelV4StreamPart[] = streamParts ?? [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text-0' },
        { type: 'text-delta', id: 'text-0', delta: text },
        { type: 'text-end', id: 'text-0' },
        { type: 'finish', finishReason, usage: DEFAULT_USAGE },
      ];

      return Promise.resolve({ stream: partStream(parts) });
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

describe('G47 — tool-input-delta id fallback corrupts wrong tool-call index', () => {
  it.fails(
    'tool-input-delta with unseen id does not corrupt tool_calls[0] arguments (G47)',
    async () => {
      const model = createRecordingModel({
        streamParts: [
          { type: 'stream-start', warnings: [] },
          { type: 'tool-input-start', id: 'call_a', toolName: 'search', toolCallType: 'function' },
          { type: 'tool-input-start', id: 'call_b', toolName: 'calc', toolCallType: 'function' },
          { type: 'tool-input-delta', id: 'call_unknown', delta: '"corrupted"' },
          { type: 'finish', finishReason: STOP_FINISH, usage: DEFAULT_USAGE },
        ] as unknown as LanguageModelV4StreamPart[],
      });

      const app = makeAppWithModel('openai', model);
      const res = await app.request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'openai/gpt-4o',
          messages: [{ role: 'user', content: 'search and calc' }],
          stream: true,
        }),
      });

      const text = await res.text();
      const chunks = parseSse(text).filter((c) => {
        if (typeof c.data !== 'string' || c.data === '[DONE]') return false;
        const d = JSON.parse(c.data) as Record<string, unknown>;
        const choices = d.choices as Array<Record<string, unknown>>;
        const delta = choices?.[0]?.delta as Record<string, unknown>;
        const calls = delta?.tool_calls as Array<Record<string, unknown>>;

        return calls?.some(
          (tc) =>
            typeof tc.function === 'object' &&
            (tc.function as Record<string, unknown>).arguments === '"corrupted"',
        );
      });

      const corruptedOnZero = chunks.some((c) => {
        const d = JSON.parse(c.data) as Record<string, unknown>;
        const calls = (
          (d.choices as Array<Record<string, unknown>>)[0]?.delta as Record<string, unknown>
        )?.tool_calls as Array<Record<string, unknown>>;

        return calls?.some(
          (tc) =>
            tc.index === 0 && (tc.function as Record<string, unknown>)?.arguments === '"corrupted"',
        );
      });

      expect(corruptedOnZero).toBe(false);
    },
  );
});

describe('G48 — service_tier missing from streaming SSE output', () => {
  it('streaming chat includes service_tier on wire when provider returns it', async () => {
    const rawChunk = {
      id: 'chatcmpl-test',
      object: 'chat.completion.chunk',
      created: 1700000000,
      model: 'mock-model',
      service_tier: 'default',
      choices: [{ index: 0, delta: {}, finish_reason: null }],
    };

    const streamParts: LanguageModelV4StreamPart[] = [
      { type: 'stream-start', warnings: [] },
      { type: 'raw', rawValue: rawChunk },
      { type: 'text-start', id: 'text-0' },
      { type: 'text-delta', id: 'text-0', delta: 'hi' },
      { type: 'text-end', id: 'text-0' },
      { type: 'finish', finishReason: STOP_FINISH, usage: DEFAULT_USAGE },
    ];

    const app = makeAppWithModel('openai', createRecordingModel({ streamParts }));
    const { status, text } = await postRaw(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
    });

    expect(status).toBe(200);

    const chunks = parseSse(text)
      .filter((f) => f.data !== '[DONE]')
      .map((f) => JSON.parse(f.data) as Record<string, unknown>);

    const hasServiceTier = chunks.some((c) => c.service_tier !== undefined);

    expect(hasServiceTier, 'no chunk contained service_tier').toBe(true);
  });
});

describe('G48 — service_tier on non-streaming chat response', () => {
  it('non-streaming chat includes service_tier from provider metadata', async () => {
    const model = createRecordingModel({
      providerMetadata: { openai: { service_tier: 'flex' } },
    });

    const app = makeAppWithModel('openai', model);
    const { status, text } = await postRaw(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(status).toBe(200);

    const body = JSON.parse(text) as Record<string, unknown>;

    expect(body.service_tier).toBe('flex');
  });
});

describe('G49 — x-request-id absent on streaming SSE response', () => {
  it('streaming chat response includes x-request-id header', async () => {
    const app = makeAppWithModel('openai', createRecordingModel());
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
    expect(
      res.headers.get('x-request-id'),
      'streaming SSE response missing x-request-id',
    ).not.toBeNull();

    await res.text();
  });
});

describe('G52 — max_tokens/max_completion_tokens precedence', () => {
  it('max_completion_tokens takes priority over max_tokens when both present', async () => {
    let capturedOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel(
      'openai',
      createRecordingModel({
        onCall: (options) => {
          capturedOptions = options;
        },
      }),
    );

    await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 100,
      max_completion_tokens: 200,
    });

    expect(capturedOptions?.maxOutputTokens, 'max_completion_tokens should take priority').toBe(
      200,
    );
  });
});

describe('G53 — stream_options.include_usage wire semantics', () => {
  it('stream_options.include_usage produces a usage-only chunk before [DONE]', async () => {
    const app = makeAppWithModel('openai', createRecordingModel());
    const { status, text } = await postRaw(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
      stream_options: { include_usage: true },
    });

    expect(status).toBe(200);

    const chunks = parseSse(text)
      .filter((f) => f.data !== '[DONE]')
      .map((f) => JSON.parse(f.data) as Record<string, unknown>);

    const usageChunk = chunks.find(
      (c) =>
        c.usage !== null &&
        c.usage !== undefined &&
        Array.isArray(c.choices) &&
        (c.choices as unknown[]).length === 0,
    );

    expect(usageChunk, 'no usage-only chunk found before [DONE]').toBeDefined();
  });

  it('include_usage: true → usage:null on non-final chunks, one dedicated usage chunk last, sharing id/model', async () => {
    const app = makeAppWithModel('openai', createRecordingModel());
    const { status, text } = await postRaw(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
      stream_options: { include_usage: true },
    });

    expect(status).toBe(200);

    const chunks = parseSse(text)
      .filter((f) => f.data !== '[DONE]')
      .map((f) => JSON.parse(f.data) as Record<string, unknown>);

    const usageChunks = chunks.filter(
      (c) => Array.isArray(c.choices) && (c.choices as unknown[]).length === 0 && c.usage != null,
    );

    expect(usageChunks).toHaveLength(1);

    const usageChunk = usageChunks[0];

    expect(usageChunk.usage as Record<string, unknown>).toHaveProperty('total_tokens');
    expect(chunks[chunks.length - 1]).toBe(usageChunk);

    const deltaChunks = chunks.filter(
      (c) => Array.isArray(c.choices) && (c.choices as unknown[]).length > 0,
    );

    expect(deltaChunks.length).toBeGreaterThan(0);

    for (const c of deltaChunks) {
      expect(c.usage, 'non-final chunk must carry usage: null').toBeNull();
    }

    expect(usageChunk.id).toBe(deltaChunks[0].id);
    expect(usageChunk.model).toBe(deltaChunks[0].model);
  });

  it('include_usage absent → legacy wire shape (usage on finish chunk, no null stubs, no dedicated chunk)', async () => {
    const app = makeAppWithModel('openai', createRecordingModel());
    const { status, text } = await postRaw(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
    });

    expect(status).toBe(200);

    const chunks = parseSse(text)
      .filter((f) => f.data !== '[DONE]')
      .map((f) => JSON.parse(f.data) as Record<string, unknown>);

    const dedicated = chunks.filter(
      (c) => Array.isArray(c.choices) && (c.choices as unknown[]).length === 0,
    );

    expect(dedicated).toHaveLength(0);

    const withUsage = chunks.filter((c) => c.usage !== undefined);

    expect(withUsage).toHaveLength(1);

    const finishChunk = withUsage[0];

    expect((finishChunk.choices as Array<Record<string, unknown>>)[0].finish_reason).toBe('stop');

    expect(chunks.some((c) => c.usage === null)).toBe(false);
  });
});

describe('G54 — refusal finish_reason: content_filter instead of stop', () => {
  it('refusal finish_reason is stop not content_filter', async () => {
    const refusalRaw = {
      id: 'chatcmpl-test',
      object: 'chat.completion.chunk',
      created: 1700000000,
      model: 'gpt-4o',
      choices: [{ index: 0, delta: { refusal: 'I cannot help with that.' }, finish_reason: null }],
    };

    const streamParts: LanguageModelV4StreamPart[] = [
      { type: 'stream-start', warnings: [] },
      { type: 'raw', rawValue: refusalRaw },
      { type: 'finish', finishReason: STOP_FINISH, usage: DEFAULT_USAGE },
    ];

    const app = makeAppWithModel('openai', createRecordingModel({ streamParts }));
    const { status, text } = await postRaw(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'do something bad' }],
      stream: true,
    });

    expect(status).toBe(200);

    const chunks = parseSse(text)
      .filter((f) => f.data !== '[DONE]')
      .map((f) => JSON.parse(f.data) as Record<string, unknown>);

    const finishChunk = chunks.find(
      (c) =>
        Array.isArray(c.choices) &&
        (c.choices as Array<Record<string, unknown>>).some((ch) => ch.finish_reason !== null),
    );

    expect(finishChunk).toBeDefined();

    const finishReason = (finishChunk!.choices as Array<Record<string, unknown>>)[0].finish_reason;

    expect(finishReason, 'refusal should map to stop not content_filter').toBe('stop');
  });
});

describe('G55 — assistant refusal preserved on re-ingestion', () => {
  it('assistant message refusal reaches upstream prompt', async () => {
    let capturedOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel(
      'openai',
      createRecordingModel({
        onCall: (options) => {
          capturedOptions = options;
        },
      }),
    );

    const { status } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [
        { role: 'user', content: 'do something bad' },
        { role: 'assistant', content: null, refusal: 'I cannot do that.' },
        { role: 'user', content: 'why not?' },
      ],
    });

    expect(status).toBe(200);

    const assistantMsg = capturedOptions?.prompt.find((m) => m.role === 'assistant');

    expect(assistantMsg).toBeDefined();

    const opts = JSON.stringify(capturedOptions?.prompt ?? {});

    expect(opts).toContain('I cannot do that.');
  });
});

describe('G56 — over-broad 400s on benign values', () => {
  it('parallel_tool_calls: true is accepted (not a 400)', async () => {
    const app = makeAppWithModel('openai', createRecordingModel());
    const { status } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      parallel_tool_calls: true,
    });

    expect(status, 'parallel_tool_calls:true should not 400').toBe(200);
  });

  it('user field is accepted (not a 400)', async () => {
    const app = makeAppWithModel('openai', createRecordingModel());
    const { status } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      user: 'user-alice',
    });

    expect(status, 'user field should not 400').toBe(200);
  });

  it('logprobs: false is accepted (not a 400)', async () => {
    const app = makeAppWithModel('openai', createRecordingModel());
    const { status } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      logprobs: false,
    });

    expect(status, 'logprobs:false should not 400').toBe(200);
  });
});

describe('G57 — mapFinishReason masks error/unknown as stop', () => {
  it('streaming: error finish reason appears as error not stop on wire', async () => {
    const errorFinish = finish('error', 'error');
    const streamParts: LanguageModelV4StreamPart[] = [
      { type: 'stream-start', warnings: [] },
      { type: 'text-start', id: 'text-0' },
      { type: 'text-delta', id: 'text-0', delta: 'partial' },
      { type: 'text-end', id: 'text-0' },
      { type: 'finish', finishReason: errorFinish, usage: DEFAULT_USAGE },
    ];

    const app = makeAppWithModel('openai', createRecordingModel({ streamParts }));
    const { status, text } = await postRaw(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
    });

    expect(status).toBe(200);

    const chunks = parseSse(text)
      .filter((f) => f.data !== '[DONE]')
      .map((f) => JSON.parse(f.data) as Record<string, unknown>);

    const finishChunk = chunks.find(
      (c) =>
        Array.isArray(c.choices) &&
        (c.choices as Array<Record<string, unknown>>).some((ch) => ch.finish_reason !== null),
    );

    expect(finishChunk).toBeDefined();

    const finishReason = (finishChunk!.choices as Array<Record<string, unknown>>)[0].finish_reason;

    expect(finishReason, 'error finishReason masked as stop').not.toBe('stop');
    expect(finishReason).toBe('error');
  });
});

describe('G58 — tools strict field forwarded', () => {
  it('tool strict: true reaches upstream via providerOptions', async () => {
    let capturedOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel(
      'openai',
      createRecordingModel({
        onCall: (options) => {
          capturedOptions = options;
        },
      }),
    );

    const { status } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            strict: true,
            parameters: { type: 'object', properties: { city: { type: 'string' } } },
          },
        },
      ],
    });

    expect(status).toBe(200);

    const toolDef = JSON.stringify(capturedOptions?.tools ?? {});

    expect(toolDef).toContain('strict');
  });

  it('non-function tool type 400s with param tools[N].type', async () => {
    const app = makeAppWithModel('openai', createRecordingModel());
    const { status, body } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ type: 'custom', custom: { name: 'thing' } }],
    });

    expect(status).toBe(400);

    const error = (body as Record<string, unknown>).error as Record<string, unknown>;

    expect(error.param).toBe('tools[0].type');
  });
});

describe('G59 — non-streaming refusal surfaced', () => {
  it('non-streaming response includes refusal field when model refuses', async () => {
    const app = makeAppWithModel(
      'openai',
      createRecordingModel({
        text: '',
        finishReason: { unified: 'stop', raw: 'stop' },
        responseBody: {
          id: 'chatcmpl-refusal',
          object: 'chat.completion',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: null, refusal: 'I cannot help with that.' },
              finish_reason: 'stop',
            },
          ],
        },
      }),
    );

    const { status, body } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'do something bad' }],
    });

    expect(status).toBe(200);

    const choice = (body as Record<string, unknown>).choices as Array<Record<string, unknown>>;

    expect(choice[0]).toBeDefined();

    const message = choice[0].message as Record<string, unknown>;

    expect(message).toHaveProperty('refusal');
    expect(message.refusal).toBe('I cannot help with that.');
    expect(message.content).toBeNull();
  });

  it('non-streaming response omits refusal when provider body has none', async () => {
    const app = makeAppWithModel(
      'openai',
      createRecordingModel({
        text: 'Hello',
        responseBody: {
          id: 'chatcmpl-ok',
          object: 'chat.completion',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Hello', refusal: null },
              finish_reason: 'stop',
            },
          ],
        },
      }),
    );

    const { status, body } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(status).toBe(200);

    const choice = (body as Record<string, unknown>).choices as Array<Record<string, unknown>>;
    const message = choice[0].message as Record<string, unknown>;

    expect(message).not.toHaveProperty('refusal');
    expect(message.content).toBe('Hello');
  });
});
