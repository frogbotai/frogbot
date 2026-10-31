import { embed, generateText, streamText } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createGateway } from '../../../../packages/gateway/src/gateway.js';
import {
  type CallCredential,
  usedCallCredential,
} from '../../../../packages/gateway/src/providers/callCredential.js';
import { openaiProvider } from '../../../../packages/gateway/src/providers/openai/index.js';

const MODEL = 'openai/gpt-4o-mini';

type Sent = { url: string; authorization: string | null; headers: Headers };

let sent: Sent[];

function stubOpenAI(respond: () => Response = () => unauthorized()) {
  sent = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);

      sent.push({ url: String(input), authorization: headers.get('authorization'), headers });

      return Promise.resolve(respond());
    }),
  );
}

function unauthorized() {
  return Response.json(
    { error: { message: 'bad key', type: 'invalid_request_error', code: 'invalid_api_key' } },
    { status: 401 },
  );
}

async function failure(promise: PromiseLike<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }

  throw new Error('expected the call to fail');
}

const keyFor = (context: Record<string, unknown>) =>
  typeof context.user === 'string' ? { settings: { apiKey: `sk-${context.user}` } } : undefined;

beforeEach(() => {
  vi.stubEnv('OPENAI_API_KEY', undefined);
  stubOpenAI();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('provider credential', () => {
  it('boots an entry with credential and no key', () => {
    expect(() =>
      createGateway({ providers: { openai: { credential: () => undefined } } }),
    ).not.toThrow();
  });

  it('uses the entry key when credential returns undefined', async () => {
    const gw = createGateway({ providers: { openai: { apiKey: 'sk-app', credential: keyFor } } });

    const error = await failure(generateText({ model: gw.chatModel(MODEL), prompt: 'hi' }));

    expect(sent.map(({ authorization }) => authorization)).toEqual(['Bearer sk-app']);
    expect(usedCallCredential(error)).toBe(false);
  });

  it('fails before any request when credential throws', async () => {
    const gw = createGateway({
      providers: {
        openai: {
          apiKey: 'sk-app',
          credential: () => {
            throw new Error('not set up');
          },
        },
      },
    });

    await expect(generateText({ model: gw.chatModel(MODEL), prompt: 'hi' })).rejects.toThrow(
      'not set up',
    );
    expect(sent).toEqual([]);
  });

  it("sends each concurrent call's own key and tags its errors", async () => {
    const gw = createGateway({ providers: { openai: { apiKey: 'sk-app', credential: keyFor } } });
    const call = (user: string) => {
      const op = gw.operation({ operation: 'chat.completions', model: MODEL, context: { user } });

      return failure(generateText({ model: op.chatModel(), prompt: user }));
    };

    const errors = await Promise.all(['alice', 'bob', 'alice', 'bob'].map(call));

    expect(sent.map(({ authorization }) => authorization).sort()).toEqual([
      'Bearer sk-alice',
      'Bearer sk-alice',
      'Bearer sk-bob',
      'Bearer sk-bob',
    ]);
    expect(errors.every(usedCallCredential)).toBe(true);
  });

  it('keeps the tag on the last error of a retried call', async () => {
    stubOpenAI(() =>
      Response.json(
        { error: { message: 'down', type: 'server_error' } },
        { status: 500, headers: { 'retry-after-ms': '0' } },
      ),
    );

    const gw = createGateway({ providers: { openai: { credential: keyFor } } });
    const op = gw.operation({
      operation: 'chat.completions',
      model: MODEL,
      context: { user: 'a' },
    });

    const error = await failure(
      generateText({ model: op.chatModel(), prompt: 'hi', maxRetries: 1 }),
    );

    expect(error).toMatchObject({ name: 'AI_RetryError' });
    expect(usedCallCredential(error)).toBe(true);
  });

  it('applies credential to embedding models too', async () => {
    const gw = createGateway({ providers: { openai: { apiKey: 'sk-app', credential: keyFor } } });
    const op = gw.operation({
      operation: 'embeddings',
      model: 'openai/text-embedding-3-small',
      context: { user: 'carol' },
    });

    await failure(embed({ model: op.embedModel(), value: 'hi', maxRetries: 0 }));

    expect(sent.map(({ authorization }) => authorization)).toEqual(['Bearer sk-carol']);
  });

  it('builds one provider instance per credential and evicts past 256', async () => {
    const build = vi.spyOn(openaiProvider, 'build');
    const gw = createGateway({ providers: { openai: { apiKey: 'sk-app', credential: keyFor } } });
    const call = (user: string) =>
      failure(
        generateText({
          model: gw
            .operation({ operation: 'chat.completions', model: MODEL, context: { user } })
            .chatModel(),
          prompt: 'hi',
          maxRetries: 0,
        }),
      );

    expect(build).toHaveBeenCalledTimes(1);

    await call('a');
    await call('a');

    expect(build).toHaveBeenCalledTimes(2);

    for (let index = 0; index < 256; index++) await call(`user-${index}`);

    expect(build).toHaveBeenCalledTimes(258);

    await call('a');

    expect(build).toHaveBeenCalledTimes(259);
  });

  it("sends each user's own key while the instance cache evicts under concurrent load", async () => {
    const seen: { prompt: string; authorization: string | null }[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        seen.push({
          prompt: String(init?.body),
          authorization: new Headers(init?.headers).get('authorization'),
        });

        return Promise.resolve(unauthorized());
      }),
    );

    const credential: CallCredential = async (context) => {
      await new Promise((resolve) => setImmediate(resolve));

      return { settings: { apiKey: `sk-${String(context.user)}` } };
    };

    const gw = createGateway({ providers: { openai: { credential } } });
    const users = Array.from({ length: 600 }, (_, index) => `user-${index}`);

    await Promise.all(
      [...users, ...users.toReversed()].map((user, index) =>
        failure(
          generateText({
            model: gw
              .operation({ operation: 'chat.completions', model: MODEL, context: { user } })
              .chatModel(),
            prompt: `marker:${user}:${index}:`,
            maxRetries: 0,
          }),
        ),
      ),
    );

    expect(seen).toHaveLength(1200);

    for (const { prompt, authorization } of seen) {
      const user = /marker:(user-\d+):/.exec(prompt)![1];

      expect(authorization).toBe(`Bearer sk-${user}`);
    }
  });

  it('never shares an instance between settings that differ', async () => {
    const build = vi.spyOn(openaiProvider, 'build');
    const settings = [
      { apiKey: 'sk-a', headers: { x: '1' } },
      { apiKey: 'sk-a', headers: { x: '2' } },
      { apiKey: 'sk-a","headers":{"x":"1"}' },
      { apiKey: 'sk-a', headers: { 'x-1': '' } },
      { apiKey: 'sk-b' },
    ];

    const gw = createGateway({
      providers: {
        openai: { credential: (context) => ({ settings: settings[Number(context.index)] }) },
      },
    });

    for (const index of settings.keys()) {
      await failure(
        generateText({
          model: gw
            .operation({ operation: 'chat.completions', model: MODEL, context: { index } })
            .chatModel(),
          prompt: 'hi',
          maxRetries: 0,
        }),
      );
    }

    expect(build).toHaveBeenCalledTimes(1 + settings.length);
    expect(sent.map(({ authorization }) => authorization)).toEqual([
      'Bearer sk-a',
      'Bearer sk-a',
      'Bearer sk-a","headers":{"x":"1"}',
      'Bearer sk-a',
      'Bearer sk-b',
    ]);
    expect(sent.map(({ headers }) => headers.get('x'))).toEqual(['1', '2', null, null, null]);
  });

  it('wraps the call model in the returned middleware, sharing the instance by settings', async () => {
    const build = vi.spyOn(openaiProvider, 'build');
    const credential: CallCredential = (context) => ({
      settings: { apiKey: 'sk-same' },
      middleware: {
        specificationVersion: 'v4',
        transformParams: ({ params }) =>
          Promise.resolve({
            ...params,
            headers: { ...params.headers, 'x-middleware': String(context.tag) },
          }),
      },
    });

    const gw = createGateway({ providers: { openai: { credential } } });
    const model = (tag: string) =>
      gw.operation({ operation: 'chat.completions', model: MODEL, context: { tag } }).chatModel();

    await failure(generateText({ model: model('one'), prompt: 'hi', maxRetries: 0 }));
    const result = streamText({
      model: model('two'),
      prompt: 'hi',
      maxRetries: 0,
      onError: () => undefined,
    });

    await result.consumeStream();

    expect(sent.map(({ headers }) => headers.get('x-middleware'))).toEqual(['one', 'two']);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("passes via 'app' from every in-process resolver", async () => {
    const vias: string[] = [];
    const gw = createGateway({
      providers: {
        openai: {
          apiKey: 'sk-app',
          credential: (_context, { via }) => {
            vias.push(via);
            throw new Error('stop');
          },
        },
      },
    });

    await failure(generateText({ model: gw.chatModel(MODEL), prompt: 'hi' }));
    await failure(embed({ model: gw.embedModel('openai/text-embedding-3-small'), value: 'hi' }));

    await failure(
      generateText({
        model: gw.operation({ operation: 'chat.completions', model: MODEL }).chatModel(),
        prompt: 'hi',
      }),
    );

    expect(vias).toEqual(['app', 'app', 'app']);
    expect(sent).toEqual([]);
  });

  it("passes via 'http' from each HTTP route", async () => {
    const vias: string[] = [];
    const gw = createGateway({
      providers: {
        openai: {
          apiKey: 'sk-app',
          credential: (context, { via }) => {
            vias.push(`${String(context.route)}:${via}`);
            throw new Error('stop');
          },
        },
      },
    });

    const post = (path: string, body: BodyInit, json = true) =>
      gw.handler(
        new Request(`http://gateway.test/v1${path}`, {
          method: 'POST',
          body,
          ...(json && { headers: { 'content-type': 'application/json' } }),
        }),
        { context: { route: path } },
      );

    const form = new FormData();

    form.set('model', 'openai/whisper-1');
    form.set('file', new File([new Uint8Array(16)], 'a.wav', { type: 'audio/wav' }));

    const routes: [string, BodyInit, boolean?][] = [
      [
        '/chat/completions',
        JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: 'hi' }] }),
      ],
      ['/responses', JSON.stringify({ model: MODEL, input: 'hi' })],
      [
        '/messages',
        JSON.stringify({
          model: MODEL,
          max_tokens: 16,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      ],
      ['/embeddings', JSON.stringify({ model: 'openai/text-embedding-3-small', input: 'hi' })],
      ['/images/generations', JSON.stringify({ model: 'openai/gpt-image-2', prompt: 'a frog' })],
      ['/audio/transcriptions', form, false],
    ];

    for (const [path, body, json] of routes) await post(path, body, json);

    expect(vias).toEqual(routes.map(([path]) => `${path}:http`));
    expect(sent).toEqual([]);
  });

  it("joins the operation's context when the operation's chat model is another model", async () => {
    const seen: { context: Record<string, unknown>; model: string }[] = [];
    const gw = createGateway({
      providers: {
        openai: {
          apiKey: 'sk-app',
          credential: (context) => {
            seen.push({ context, model: '' });
            throw new Error('stop');
          },
        },
      },
      hooks: {
        beforeUpstream: [
          (args) => {
            seen.push({ context: args.context, model: args.model });
          },
        ],
      },
    });

    const op = gw.operation({
      operation: 'chat.completions',
      model: MODEL,
      context: { user: 'a' },
    });

    await failure(generateText({ model: op.chatModel('openai/gpt-4o'), prompt: 'hi' }));

    expect(seen).toEqual([
      { context: op.context, model: 'openai/gpt-4o' },
      { context: op.context, model: '' },
    ]);
    expect(seen[0].context).toBe(op.context);
    expect(seen[1].context).toBe(op.context);
  });
});
