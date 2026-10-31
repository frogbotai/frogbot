import { zstdDecompressSync } from 'node:zlib';

import { createOpenAI as createOpenAIProvider } from '@ai-sdk/openai';
import { isGatewayError } from '@frogbotai/gateway/errors';
import { generateText, streamText, tool, wrapLanguageModel } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { pieceInstanceDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import {
  createChatGPTMiddleware,
  createOpenAI,
  PLAN_FALLBACK_MODELS,
} from '../../../packages/pieces/piece-openai/src/index.js';
import {
  eventStream,
  failedEvent,
  textEvents,
  textStream,
} from '../../__helpers/shared/openaiResponses.js';

const provider = pieceInstanceDefinition(createOpenAI()).provider!;
const plan = { apiKey: 'plan-token', chatgpt: { clientId: 'oaiapp_1' } };
const key = { apiKey: 'sk-user' };

type Sent = { url: string; headers: Headers; body: string };

const sent: Sent[] = [];
const replies: (() => Response)[] = [];

beforeEach(() => {
  sent.length = 0;
  replies.length = 0;

  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const raw = init?.body;
      const body =
        raw instanceof Uint8Array
          ? zstdDecompressSync(raw).toString()
          : typeof raw === 'string'
            ? raw
            : '';

      sent.push({ url: String(input), headers, body });

      return Promise.resolve((replies.shift() ?? (() => textStream('Hello')))());
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function planModel(middleware = provider.middleware!({ auth: plan })) {
  const settings = provider.credential({ auth: plan, via: 'app' });

  return wrapLanguageModel({
    model: createOpenAIProvider(settings).responses('gpt-5.5'),
    middleware: middleware!,
  });
}

const fastModel = () => planModel(createChatGPTMiddleware({ retryDelays: [0, 0] }));

const body = (index = 0) => JSON.parse(sent[index].body) as Record<string, unknown>;

describe('ChatGPT plan calls', () => {
  it('pins the API, sends the token as the key and drops the fields the plan route rejects', async () => {
    const openai = createOpenAIProvider({ apiKey: 'unused' });
    const result = await generateText({
      model: planModel(),
      system: 'Be brief.',
      prompt: 'Hi',
      temperature: 0.5,
      topP: 0.9,
      maxOutputTokens: 100,
      tools: {
        lookup: tool({ description: 'Look up', inputSchema: z.object({}), execute: () => 'ok' }),
        image: openai.tools.imageGeneration({}),
        search: openai.tools.webSearch({}),
      },
      providerOptions: {
        openai: {
          conversation: 'conversation-1',
          logprobs: true,
          maxToolCalls: 3,
          metadata: { app: 'frogbot' },
          previousResponseId: 'resp_0',
          promptCacheRetention: '24h',
          reasoningEffortUpdate: 'low',
          safetyIdentifier: 'user-1',
          truncation: 'auto',
          user: 'user-1',
        },
      },
    });

    expect(result.text).toBe('Hello');
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe('https://api.openai.com/v1/responses');
    expect(sent[0].headers.get('authorization')).toBe('Bearer plan-token');
    expect(sent[0].headers.get('content-encoding')).toBeNull();

    const request = body();

    expect(request).toMatchObject({ model: 'gpt-5.5', store: false, stream: true });
    expect((request.input as { role: string }[])[0]).toMatchObject({
      role: 'developer',
      content: 'Be brief.',
    });

    for (const field of [
      'temperature',
      'top_p',
      'max_output_tokens',
      'conversation',
      'top_logprobs',
      'max_tool_calls',
      'metadata',
      'previous_response_id',
      'prompt_cache_retention',
      'safety_identifier',
      'truncation',
      'user',
    ]) {
      expect(request).not.toHaveProperty(field);
    }

    expect(JSON.stringify(request.input)).not.toContain('configuration_update');
    expect((request.tools as { type: string }[]).map(({ type }) => type)).toEqual([
      'function',
      'web_search',
    ]);
  });

  it('streams with the same plan request', async () => {
    const result = streamText({ model: planModel(), prompt: 'Hi' });

    expect(await result.text).toBe('Hello');
    expect(body()).toMatchObject({ store: false, stream: true });
  });

  it('compresses a body over 1 MiB with zstd', async () => {
    const prompt = 'x'.repeat(2 * 1024 * 1024);

    await generateText({ model: planModel(), prompt });

    expect(sent[0].headers.get('content-encoding')).toBe('zstd');
    expect(JSON.stringify(body().input)).toContain(prompt);
  });

  it('leaves pasted-key calls alone', () => {
    expect(provider.credential({ auth: key, via: 'app' })).toEqual({ apiKey: 'sk-user' });
    expect(provider.middleware!({ auth: key })).toBeUndefined();
    expect(provider.notice!({ auth: key })).toBeUndefined();
  });

  it('refuses the app API before any request, and shows the plan notice', () => {
    expect(() => provider.credential({ auth: plan, via: 'http' })).toThrow(
      "A ChatGPT plan can't be used through this app's API. Paste an OpenAI API key in Settings → Linked accounts to use the API.",
    );
    expect(provider.notice!({ auth: plan })).toEqual({
      text: 'Using ChatGPT plan',
      link: { label: 'Manage usage', url: 'https://chatgpt.com/settings/usage' },
    });
    expect(sent).toEqual([]);
  });
});

const refusals: [string, number, string][] = [
  [
    'subscription_sharing_usage_limit_exceeded',
    429,
    "You've reached your ChatGPT plan's usage limit. Manage usage at https://chatgpt.com/settings/usage.",
  ],
  [
    'subscription_sharing_user_not_eligible',
    403,
    "This ChatGPT account can't use its plan in other apps. Paste an OpenAI API key in Settings → Linked accounts instead.",
  ],
  ['subscription_sharing_invalid_user', 401, 'Reconnect ChatGPT in Settings → Linked accounts.'],
  ['chatpass_v2_scope_not_authorized', 403, 'Reconnect ChatGPT in Settings → Linked accounts.'],
  [
    'chatpass_v2_invalid_authorization_context',
    403,
    'Reconnect ChatGPT in Settings → Linked accounts.',
  ],
  [
    'subscription_sharing_unsupported_capability',
    400,
    "This request isn't supported on a ChatGPT plan.",
  ],
  [
    'subscription_sharing_route_not_supported',
    403,
    "This request isn't supported on a ChatGPT plan.",
  ],
];

const BUSY = 'ChatGPT is busy. Try again in a moment.';

describe('ChatGPT plan errors', () => {
  it.each(refusals)(
    '%s in the HTTP answer fails at once with its message',
    async (code, status, message) => {
      replies.push(() => Response.json({ error: { code, message: code } }, { status }));

      const error = await generateText({ model: fastModel(), prompt: 'Hi' }).catch(
        (caught: unknown) => caught,
      );

      expect(isGatewayError(error)).toBe(true);
      expect(error).toMatchObject({ message, status, code: 'upstream_refused' });
      expect(sent).toHaveLength(1);
    },
  );

  it.each(refusals)(
    '%s before output fails at once with its message',
    async (code, _status, message) => {
      replies.push(() => eventStream([failedEvent(code)]));

      await expect(generateText({ model: fastModel(), prompt: 'Hi' })).rejects.toThrow(message);
      expect(sent).toHaveLength(1);
    },
  );

  it.each(refusals)(
    '%s after output ends the stream with its message',
    async (code, _status, message) => {
      replies.push(() => eventStream([...textEvents('Partial'), failedEvent(code)]));

      const errors: unknown[] = [];
      const result = streamText({
        model: fastModel(),
        prompt: 'Hi',
        onError: ({ error }) => void errors.push(error),
      });

      for await (const part of result.fullStream) {
        if (part.type === 'error') errors.push(part.error);
      }

      expect(errors.length).toBeGreaterThan(0);
      expect((errors[0] as Error).message).toBe(message);
      expect(sent).toHaveLength(1);
    },
  );

  it('builds a non-streamed call that fails after output from the stream error', async () => {
    replies.push(() =>
      eventStream([
        ...textEvents('Partial'),
        failedEvent('subscription_sharing_usage_limit_exceeded'),
      ]),
    );

    await expect(generateText({ model: fastModel(), prompt: 'Hi' })).rejects.toThrow(
      "You've reached your ChatGPT plan's usage limit.",
    );
  });

  it('maps a bare 401 to Reconnect ChatGPT', async () => {
    replies.push(() => Response.json({ detail: 'Unauthorized' }, { status: 401 }));

    await expect(generateText({ model: fastModel(), prompt: 'Hi' })).rejects.toThrow(
      'Reconnect ChatGPT in Settings → Linked accounts.',
    );
    expect(sent).toHaveLength(1);
  });

  it.each(['subscription_sharing_usage_unavailable', 'subscription_sharing_user_unavailable'])(
    '%s retries twice, then says ChatGPT is busy',
    async (code) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        replies.push(() => Response.json({ error: { code, message: code } }, { status: 503 }));
      }

      await expect(generateText({ model: fastModel(), prompt: 'Hi' })).rejects.toThrow(BUSY);
      expect(sent).toHaveLength(3);
    },
  );

  it('recovers when a busy plan answers on a retry', async () => {
    replies.push(() => eventStream([failedEvent('subscription_sharing_usage_unavailable')]));

    const result = await generateText({ model: fastModel(), prompt: 'Hi' });

    expect(result.text).toBe('Hello');
    expect(sent).toHaveLength(2);
  });

  it('says busy, without retrying, when the plan is busy after output', async () => {
    replies.push(() =>
      eventStream([...textEvents('Partial'), failedEvent('subscription_sharing_user_unavailable')]),
    );

    await expect(generateText({ model: fastModel(), prompt: 'Hi' })).rejects.toThrow(BUSY);
    expect(sent).toHaveLength(1);
  });

  it("leaves other errors to FrogBot's usual messages", async () => {
    replies.push(() =>
      Response.json({ error: { message: 'boom', type: 'server_error' } }, { status: 500 }),
    );

    const error = await generateText({ model: fastModel(), prompt: 'Hi', maxRetries: 0 }).catch(
      (caught: unknown) => caught,
    );

    expect(isGatewayError(error)).toBe(false);
    expect(error).toMatchObject({ statusCode: 500 });
  });
});

describe('ChatGPT plan models', () => {
  const list = (auth: object = plan) =>
    provider.models!({ auth, credential: {}, signal: new AbortController().signal });

  it("lists the plan's models shown in pickers and usable in the API", async () => {
    replies.push(() =>
      Response.json({
        models: [
          { slug: 'gpt-6-sol', visibility: 'list', supported_in_api: true, display_name: 'Sol' },
          { slug: 'gpt-hidden', visibility: 'hide', supported_in_api: true },
          { slug: 'gpt-app-only', visibility: 'list', supported_in_api: false },
        ],
      }),
    );

    await expect(list()).resolves.toEqual(['gpt-6-sol']);
    expect(sent[0].url).toBe('https://api.openai.com/v1/models');
    expect(sent[0].headers.get('authorization')).toBe('Bearer plan-token');
  });

  it.each<[string, () => Response]>([
    ['fails', () => new Response('down', { status: 500 })],
    ['is empty', () => Response.json({ models: [] })],
    ['is malformed', () => Response.json({ data: [{ id: 'gpt-4o' }] })],
  ])('gives the fixed plan list when the listing %s', async (_kind, reply) => {
    replies.push(reply);

    const models = await list();

    expect(models).toEqual(PLAN_FALLBACK_MODELS);
    expect(models).toContain('gpt-6.1-terra');
    expect(models).toContain('gpt-6.1-terra-fast');
  });
});

describe('pasted keys that may not list models', () => {
  const list = () =>
    provider.models!({ auth: key, credential: {}, signal: new AbortController().signal });

  it.each([401, 403])(
    'accepts a restricted key refused with %i for a missing permission',
    async (status) => {
      replies.push(() =>
        Response.json(
          {
            error: {
              message:
                'You have insufficient permissions for this operation. Missing scopes: api.model.read.',
              type: 'invalid_request_error',
              code: null,
            },
          },
          { status },
        ),
      );

      await expect(list()).resolves.toBeUndefined();
    },
  );

  it('still rejects an invalid key', async () => {
    replies.push(() =>
      Response.json(
        { error: { message: 'Incorrect API key provided.', code: 'invalid_api_key' } },
        { status: 401 },
      ),
    );

    await expect(list()).rejects.toMatchObject({ status: 401 });
  });
});
