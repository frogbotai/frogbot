import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('../../../../packages/frogbot/src/getFrogBot.js', () => ({
  createDefaultRequest: vi.fn(),
}));

import type { CustomApiCallConfig } from '../../../../packages/frogbot/src/pieces/customApiCall.js';
import {
  createPieceHelpers,
  definePiece,
} from '../../../../packages/frogbot/src/pieces/definePiece.js';

type Client = { token: string };

type Sent = { url: string; init: RequestInit; headers: Headers };

const sent: Sent[] = [];

function respond(body: BodyInit | null, init: ResponseInit = {}) {
  vi.stubGlobal('fetch', (input: URL | string, init2: RequestInit = {}) => {
    sent.push({ url: String(input), init: init2, headers: new Headers(init2.headers) });

    return Promise.resolve(new Response(body, init));
  });
}

function json(value: unknown, status = 200) {
  respond(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

function piece(overrides: Partial<CustomApiCallConfig<Client>> = {}) {
  const { defineCustomApiCall } = createPieceHelpers<Client>();

  return definePiece({
    slug: 'fake',
    label: 'Fake',
    client: () => ({ token: 'secret-token' }),
    actions: [
      defineCustomApiCall({
        name: 'Fake',
        baseUrl: 'https://api.fake.test/v1',
        authorize: ({ client, headers }) => headers.set('authorization', `Bearer ${client.token}`),
        ...overrides,
      }),
    ],
  })();
}

function request(extra: Record<string, unknown> = {}) {
  return {
    frogbot: { config: {}, connections: {}, ...extra },
    headers: new Headers(),
    user: { id: 'user-1' },
  } as never;
}

async function call(input: Record<string, unknown>, fake = piece(), req = request()) {
  return fake.customApiCall({ input: { method: 'GET', ...input } as never, req });
}

async function failure(promise: Promise<unknown>): Promise<string> {
  return promise.then(
    () => 'resolved',
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
}

afterEach(() => {
  sent.length = 0;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('defineCustomApiCall', () => {
  it('returns the envelope with lowercase headers and a parsed JSON body', async () => {
    respond(JSON.stringify({ id: 1 }), {
      headers: { 'Content-Type': 'application/json', 'X-Rate-Limit': '9' },
    });

    const result = await call({ path: '/items' });

    expect(result).toEqual({
      status: 200,
      headers: { 'content-type': 'application/json', 'x-rate-limit': '9' },
      body: { id: 1 },
    });

    expect(sent[0]?.url).toBe('https://api.fake.test/v1/items');
    expect(sent[0]?.headers.get('authorization')).toBe('Bearer secret-token');
    expect(sent[0]?.init.redirect).toBe('manual');
  });

  it('returns null for a 204 and an empty 200', async () => {
    respond(null, { status: 204 });

    expect((await call({ path: '/items' })).body).toBeNull();

    respond('', { status: 200, headers: { 'content-type': 'application/json' } });

    expect((await call({ path: '/items' })).body).toBeNull();
  });

  it('keeps a non-JSON body as text and invalid JSON as text', async () => {
    respond('plain', { headers: { 'content-type': 'text/plain' } });

    expect((await call({ path: '/items' })).body).toBe('plain');

    respond('{nope', { headers: { 'content-type': 'application/json' } });

    expect((await call({ path: '/items' })).body).toBe('{nope');

    json({ a: 1 });

    expect((await call({ path: '/items', responseType: 'text' })).body).toBe('{"a":1}');
  });

  it('throws on a 404 with the piece, status and truncated body', async () => {
    respond(`missing ${'x'.repeat(600)}`, { status: 404 });

    const message = await failure(call({ path: '/items' }));

    expect(message).toMatch(/^\[frogbot\] Fake API request failed \(404\): missing x+$/);
    expect(message).toHaveLength('[frogbot] Fake API request failed (404): '.length + 500);
    expect(message).not.toContain('api.fake.test');
    expect(message).not.toContain('secret-token');
  });

  it('returns the envelope for a 404 with failsafe', async () => {
    json({ error: 'missing' }, 404);

    await expect(call({ path: '/items', failsafe: true })).resolves.toEqual({
      status: 404,
      headers: { 'content-type': 'application/json' },
      body: { error: 'missing' },
    });
  });

  it('refuses a 302 and names its Location', async () => {
    respond(null, { status: 302, headers: { location: 'https://x.test/' } });

    await expect(call({ path: '/items' })).rejects.toThrow(
      'Fake API redirected (302) to https://x.test/.',
    );

    expect(sent).toHaveLength(1);
  });

  it('repeats array query values and keeps a query in the path', async () => {
    json({});

    await call({ path: '/items?b=x', query: { a: [1, 2], c: true } });

    expect(sent[0]?.url).toBe('https://api.fake.test/v1/items?b=x&a=1&a=2&c=true');
  });

  it('refuses a body on GET and HEAD', async () => {
    json({});

    for (const method of ['GET', 'HEAD']) {
      await expect(call({ method, path: '/items', body: { a: 1 } })).rejects.toThrow(
        'GET and HEAD requests cannot have a body.',
      );
    }

    expect(sent).toEqual([]);
  });

  it('sends JSON, raw, form and multipart bodies', async () => {
    json({});

    await call({ method: 'POST', path: '/items', body: { a: 1 } });

    expect(sent[0]?.init.body).toBe('{"a":1}');
    expect(sent[0]?.headers.get('content-type')).toBe('application/json');

    await call({
      method: 'POST',
      path: '/items',
      bodyType: 'form',
      body: { a: { b: 'c' }, 'list[]': ['x', 'y'] },
    });

    expect(String(sent[1]?.init.body)).toBe('a%5Bb%5D=c&list%5B%5D=x&list%5B%5D=y');

    await call({ method: 'POST', path: '/items', bodyType: 'raw', body: '<x/>' });

    expect(sent[2]?.init.body).toBe('<x/>');

    await call({ method: 'POST', path: '/items', bodyType: 'formData', body: { a: 'b' } });

    expect(sent[3]?.init.body).toBeInstanceOf(FormData);
    expect((sent[3]?.init.body as FormData).get('a')).toBe('b');
  });

  it('form-encodes a JSON body for a piece with bodyEncoding form', async () => {
    json({});

    await call(
      { method: 'POST', path: '/items', body: { amount: 5, metadata: { k: 'v' } } },
      piece({ bodyEncoding: 'form' }),
    );

    expect(sent[0]?.init.body).toBeInstanceOf(URLSearchParams);
    expect(String(sent[0]?.init.body)).toBe('amount=5&metadata%5Bk%5D=v');
  });

  it('indexes nested and object arrays and repeats top-level scalar arrays in forms', async () => {
    json({});

    await call({
      method: 'POST',
      path: '/items',
      bodyType: 'form',
      body: { tag: ['a', 'b'], items: [{ price: 'p1' }], meta: { ids: [1, 2] } },
    });

    expect(decodeURIComponent(String(sent[0]?.init.body))).toBe(
      'tag=a&tag=b&items[0][price]=p1&meta[ids][0]=1&meta[ids][1]=2',
    );
  });

  it('indexes top-level scalar arrays for a piece with formArrays index', async () => {
    json({});

    await call(
      { method: 'POST', path: '/items', body: { expand: ['a', 'b'], 'list[]': ['x', 'y'] } },
      piece({ bodyEncoding: 'form', formArrays: 'index' }),
    );

    expect(decodeURIComponent(String(sent[0]?.init.body))).toBe(
      'expand[0]=a&expand[1]=b&list[]=x&list[]=y',
    );
  });

  it('runs check on a 2xx', async () => {
    json({ ok: false, error: 'invalid_auth' });

    const fake = piece({
      check: ({ body }) => {
        const { ok, error } = z.object({ ok: z.boolean(), error: z.string() }).parse(body);
        if (!ok) throw new Error(`Fake API error: ${error}`);
      },
    });

    await expect(call({ path: '/items' }, fake)).rejects.toThrow('Fake API error: invalid_auth');
  });

  it('refuses caller Authorization and reserved headers in any case', async () => {
    json({});
    const fake = piece({ reservedHeaders: ['X-Api-Key'] });

    for (const header of ['Authorization', 'authorization', 'COOKIE', 'x-api-key']) {
      await expect(call({ path: '/items', headers: { [header]: 'other' } }, fake)).rejects.toThrow(
        `[frogbot] Fake custom API calls cannot set the '${header}' header.`,
      );
    }

    expect(sent).toEqual([]);
  });

  it('sends fixed headers that a caller header replaces', async () => {
    json({});
    const fake = piece({ headers: { 'Fake-Version': '1' } });

    await call({ path: '/items' }, fake);
    await call({ path: '/items', headers: { 'fake-version': '2' } }, fake);

    expect(sent.map(({ headers }) => headers.get('fake-version'))).toEqual(['1', '2']);
  });

  it.each([
    'https://x.test/',
    'HTTP://x.test/',
    '//x.test/',
    '/\\x.test/',
    '\\x.test',
    '@x.test/',
    '/a/../b',
    '..',
    '/a/%2e%2e/b',
    '/a//b',
    '/a#b',
    '/\t//x.test/',
    '/a b',
  ])('refuses the path %j before fetch', async (path) => {
    json({});

    await expect(call({ path })).rejects.toThrow(
      '[frogbot] Fake custom API path must be relative to the Fake API.',
    );

    expect(sent).toEqual([]);
  });

  it('applies the piece path rule', async () => {
    json({});
    const fake = piece({ path: /^\/[a-z]+\.[a-z]+$/ });

    await call({ path: 'chat.post' }, fake);

    expect(sent[0]?.url).toBe('https://api.fake.test/v1/chat.post');

    await expect(call({ path: '/chat/post' }, fake)).rejects.toThrow(
      "[frogbot] Fake custom API path '/chat/post' is not allowed.",
    );
  });

  it('keeps at-signs inside a path', async () => {
    json({});

    await call({ path: '/users/@me' });

    expect(sent[0]?.url).toBe('https://api.fake.test/v1/users/@me');
  });

  it('does not call fetch when authorize throws', async () => {
    json({});
    const fake = piece({
      authorize: () => {
        throw new Error('nope');
      },
    });

    await expect(call({ path: '/items' }, fake)).rejects.toThrow('nope');
    expect(sent).toEqual([]);
  });

  it('lets authorize change the URL', async () => {
    json({});
    const fake = piece({
      authorize: ({ client, url }) => {
        url.pathname = `/bot${client.token}${url.pathname}`;
      },
    });

    await call({ path: 'getMe' }, fake);

    expect(sent[0]?.url).toBe('https://api.fake.test/botsecret-token/v1/getMe');
  });

  it('aborts with the request signal', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    json({});

    await expect(
      call({ path: '/items' }, piece(), {
        ...(request() as object),
        signal: controller.signal,
      } as never),
    ).rejects.toThrow('cancelled');

    expect(sent).toEqual([]);
  });

  it('times out with a message that names the piece', async () => {
    vi.stubGlobal(
      'fetch',
      (_input: unknown, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason as Error));
        }),
    );

    await expect(call({ path: '/items', timeoutSeconds: 0.01 })).rejects.toThrow(
      '[frogbot] Fake API request timed out after 0.01 seconds.',
    );
  });

  it('names the piece when the timeout fires while reading the body', async () => {
    vi.stubGlobal('fetch', (_input: unknown, init: RequestInit) => {
      const stream = new ReadableStream({
        start(controller) {
          init.signal?.addEventListener('abort', () => controller.error(init.signal?.reason));
        },
      });

      return Promise.resolve(new Response(stream, { headers: { 'content-type': 'text/plain' } }));
    });

    await expect(call({ path: '/items', timeoutSeconds: 0.01 })).rejects.toThrow(
      '[frogbot] Fake API request timed out after 0.01 seconds.',
    );
  });

  it('passes a signal that follows the request signal', async () => {
    const controller = new AbortController();
    json({});

    await call({ path: '/items' }, piece(), {
      ...(request() as object),
      signal: controller.signal,
    } as never);

    const signal = sent[0]?.init.signal;

    expect(signal?.aborted).toBe(false);

    controller.abort();

    expect(signal?.aborted).toBe(true);
  });

  it('saves a binary response as the caller', async () => {
    respond(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'application/pdf' } });
    const create = vi.fn((_args: Record<string, unknown>) =>
      Promise.resolve({ id: 7, url: '/api/files/file/report.pdf' }),
    );

    const req = request({ config: { files: { slug: 'files' } }, create });
    const result = await call({ path: '/files/report.pdf', responseType: 'binary' }, piece(), req);

    expect(result.body).toEqual({
      id: 7,
      name: 'report.pdf',
      mimeType: 'application/pdf',
      size: 3,
      url: '/api/files/file/report.pdf',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'files', overrideAccess: false, req }),
    );
  });

  it('keeps a malformed percent-encoded segment as the file name', async () => {
    respond(new Uint8Array([1]));
    const create = vi.fn(() => Promise.resolve({ id: 8 }));
    const req = request({ config: { files: { slug: 'files' } }, create });
    const result = await call({ path: '/files/%E0%A4%A', responseType: 'binary' }, piece(), req);

    expect(result.body).toMatchObject({ id: 8, name: '%E0%A4%A', url: null });
  });

  it('refuses a binary call before fetch when the app has no files collection', async () => {
    json({});

    await expect(call({ path: '/files/a', responseType: 'binary' })).rejects.toThrow(
      '[frogbot] Fake requires a files collection. Add an upload collection with `file: true`.',
    );

    expect(sent).toEqual([]);
  });

  it('gives every piece the same input and output schema', () => {
    const { defineCustomApiCall } = createPieceHelpers<Client>();
    const config = { name: 'A', baseUrl: 'https://a.test', authorize: () => undefined };
    const first = defineCustomApiCall(config);
    const second = defineCustomApiCall({ ...config, name: 'B' });

    expect(first.slug).toBe('customApiCall');
    expect(first.input).toBe(second.input);
    expect(first.output).toBe(second.output);
  });
});
