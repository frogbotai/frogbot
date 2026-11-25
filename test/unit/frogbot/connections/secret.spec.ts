import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { linkedModels } from '../../../../packages/frogbot/src/ai/providerModels.js';
import { createCredentialEncryption } from '../../../../packages/frogbot/src/connections/encryption.js';
import { buildSecretEndpoints } from '../../../../packages/frogbot/src/connections/secret.js';
import { kvLockHeld } from '../../../../packages/frogbot/src/kv/errors.js';
import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';
import { routed } from '../../../__helpers/shared/routed.js';

const failed = (detail: string, code: string, data?: Record<string, unknown>) => ({
  code,
  detail,
  ...(data ? { data } : {}),
});

function setup(auth: z.ZodType | null = z.object({ token: z.string().min(1) })) {
  const piece = definePiece({
    slug: 'example',
    label: 'Example',
    ...(auth ? { auth } : {}),
    client: () => ({}),
    actions: [],
  })({ slug: 'alias' });

  const upsert = vi
    .fn()
    .mockResolvedValue({ id: 'row', piece: 'example', method: 'secret', status: 'active' });

  const remove = vi.fn().mockResolvedValue(true);
  const warn = vi.fn();
  const connections = {
    enabled: true,
    slug: 'connections',
    encryption: createCredentialEncryption({ secret: 'test' }),
    entries: { example: { piece, secret: true, oauth: false } },
    apps: {},
  };

  const endpoints = buildSecretEndpoints({ connections, userSlug: 'users' });
  const request = ({
    body = { token: 'secret-value' },
    user = { id: 'owner', collection: 'users' },
    routeParams = { piece: 'example' },
  }: { body?: unknown; user?: unknown; routeParams?: Record<string, unknown> } = {}) =>
    ({
      user,
      routeParams,
      json: () => Promise.resolve(body),
      frogbot: {
        logger: { warn },
        connections: { store: Promise.resolve({ upsert }), delete: remove },
      },
    }) as never;

  return { upsert, remove, warn, request, endpoints, connections };
}

describe('static connection endpoints', () => {
  it('accepts raw schema input and returns metadata without secrets', async () => {
    const { endpoints, request, upsert } = setup();
    const response = await routed(() => endpoints[0].handler(request()));

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith({
      owner: { id: 'owner', collection: 'users' },
      piece: 'example',
      method: 'secret',
      credential: { token: 'secret-value' },
    });
    expect(await response.json()).toEqual({
      id: 'row',
      piece: 'example',
      method: 'secret',
      status: 'active',
    });
  });

  it.each<[unknown, string, string[]]>([
    [{}, 'token is required (expected string)', ['token']],
    [{ apiKey: 'secret-value' }, 'token is required (expected string)', ['token']],
    [{ credential: { token: 'secret-value' } }, 'token is required (expected string)', ['token']],
    [{ token: 42 }, 'token has the wrong type (expected string)', ['token']],
    [{ token: '' }, 'token is too short (minimum 1)', ['token']],
    [null, 'the body must be an object', []],
    [[], 'the body must be an object', []],
  ])('names the failing field for raw input %j, never its value', async (body, issue, fields) => {
    const { endpoints, request, upsert } = setup();
    const response = await routed(() => endpoints[0].handler(request({ body })));
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(JSON.parse(text)).toMatchObject(
      failed(`Invalid credentials: ${issue}.`, 'connection.invalid-credentials', { fields }),
    );
    expect(text).not.toContain('secret-value');
    expect(text).not.toContain('42');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('lists every failing field with its expected shape', async () => {
    const { endpoints, request } = setup(
      z
        .object({
          key: z.string().startsWith('sk-'),
          region: z.enum(['us', 'eu']),
          nested: z.object({ id: z.number() }),
        })
        .strict(),
    );

    const body = { key: 'secret-value', region: 'mars', nested: {}, extra: 'secret-value' };
    const response = await routed(() => endpoints[0].handler(request({ body })));
    const text = await response.text();

    expect(JSON.parse(text)).toMatchObject(
      failed(
        "Invalid credentials: key has the wrong format (expected starts_with); region must be one of us, eu; nested.id is required (expected number); the body has fields the key doesn't take.",
        'connection.invalid-credentials',
        { fields: ['key', 'region', 'nested.id'] },
      ),
    );
    expect(text).not.toContain('secret-value');
    expect(text).not.toContain('mars');
    expect(text).not.toContain('extra');
  });

  it('names the field of a preprocessed auth schema', async () => {
    const { endpoints, request } = setup(
      z.preprocess((value) => value, z.object({ token: z.string().min(1) })),
    );

    const response = await routed(() => endpoints[0].handler(request({ body: { token: 42 } })));
    const text = await response.text();

    expect(JSON.parse(text)).toMatchObject(
      failed(
        'Invalid credentials: token has the wrong type (expected string).',
        'connection.invalid-credentials',
        {
          fields: ['token'],
        },
      ),
    );
    expect(text).not.toContain('42');
  });

  it('never names a key that came from the body', async () => {
    const { endpoints, request } = setup(
      z.object({ token: z.string(), headers: z.record(z.string(), z.string()) }).strict(),
    );

    const body = {
      token: 'ok',
      headers: { 'Bearer SECRET456': 42 },
      'sk-live-SECRET123': true,
    };

    const response = await routed(() => endpoints[0].handler(request({ body })));
    const text = await response.text();

    expect(JSON.parse(text)).toMatchObject(
      failed(
        "Invalid credentials: headers has an invalid entry; the body has fields the key doesn't take.",
        'connection.invalid-credentials',
        { fields: ['headers'] },
      ),
    );
    expect(text).not.toContain('SECRET');
  });

  it('says the piece takes no key when its entry has no auth schema', async () => {
    const { endpoints, request, upsert } = setup(null);
    const response = await routed(() => endpoints[0].handler(request()));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject(
      failed('Example takes no key.', 'connection.no-credentials'),
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it('redacts thrown schema errors', async () => {
    const { endpoints, request } = setup(
      z.object({
        token: z.string().refine(() => {
          throw new Error('secret-value');
        }),
      }),
    );

    const response = await routed(() => endpoints[0].handler(request()));
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(JSON.parse(text)).toMatchObject(
      failed('Invalid credentials: the key failed validation.', 'connection.invalid-credentials', {
        fields: [],
      }),
    );
    expect(text).not.toContain('secret-value');
  });

  it('rejects malformed JSON', async () => {
    const { endpoints, request } = setup();
    const req = {
      ...(request() as object),
      json: () => Promise.reject(new Error('secret-value')),
    };

    const response = await routed(() => endpoints[0].handler(req as never));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject(
      failed("The body isn't valid JSON.", 'request.invalid-json'),
    );
  });

  it.each([null, { id: 'owner', collection: 'customers' }])(
    'protects both endpoints from %j',
    async (user) => {
      const { endpoints, request, upsert, remove } = setup();

      for (const endpoint of endpoints) {
        expect((await routed(() => endpoint.handler(request({ user })))).status).toBe(
          user ? 403 : 401,
        );
      }

      expect(upsert).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    },
  );

  it.each(['alias', 'unknown', '__proto__'])(
    'rejects a noncanonical or unknown piece %s',
    async (piece) => {
      const { endpoints, request, upsert } = setup();

      const response = await routed(() =>
        endpoints[0].handler(request({ routeParams: { piece } })),
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject(
        failed('Connection not found.', 'connection.not-found'),
      );
      expect(upsert).not.toHaveBeenCalled();
    },
  );

  it('rejects a disabled secret method and omits routes when connections are disabled', async () => {
    const { endpoints, request, connections } = setup();
    connections.entries.example.secret = false;

    expect((await routed(() => endpoints[0].handler(request()))).status).toBe(404);
    expect(
      buildSecretEndpoints({ connections: { ...connections, enabled: false }, userSlug: 'users' }),
    ).toEqual([]);
  });

  it('deletes by ID through the owner-scoped API', async () => {
    const { endpoints, request, remove } = setup();
    const req = request({ routeParams: { id: 'row' } });

    expect((await routed(() => endpoints[1].handler(req))).status).toBe(204);
    expect(remove).toHaveBeenCalledWith({ req, id: 'row' });

    remove.mockResolvedValue(false);

    expect((await routed(() => endpoints[1].handler(req))).status).toBe(404);
  });

  it('redacts persistence errors and logs the cause', async () => {
    const { endpoints, request, upsert, warn } = setup();
    const cause = new Error('store down');
    upsert.mockRejectedValue(cause);
    const response = await routed(() => endpoints[0].handler(request()));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject(
      failed("The connection couldn't be saved.", 'connection.save-failed'),
    );
    expect(warn).toHaveBeenCalledWith(
      { err: cause, piece: 'example' },
      '[frogbot] Connection operation failed',
    );
  });

  it('reports lock contention without leaking the lock key', async () => {
    const { endpoints, request, upsert } = setup();
    upsert.mockRejectedValue(kvLockHeld());
    const response = await routed(() => endpoints[0].handler(request()));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject(
      failed('This connection is being changed.', 'connection.busy'),
    );
  });
});

describe('static connection endpoint: provider key check', () => {
  const keyAuth = z.object({ apiKey: z.string().startsWith('sk-') });

  function setupProvider(models: (args: unknown) => Promise<string[]>) {
    const listModels = vi.fn(models);
    const piece = definePiece({
      slug: 'openai',
      label: 'OpenAI',
      auth: keyAuth,
      client: ({ auth }: { auth: unknown }) => auth,
      provider: {
        name: 'openai',
        credential: ({ auth }: { auth: unknown }) => ({ apiKey: keyAuth.parse(auth).apiKey }),
        models: listModels,
      },
      actions: [],
    })();

    const upsert = vi
      .fn()
      .mockResolvedValue({ id: 'row', piece: 'openai', method: 'secret', status: 'active' });

    const key = {};
    const resolvePieceCredential = vi.fn().mockResolvedValue({ auth: { apiKey: 'sk-good' }, key });
    const connections = {
      enabled: true,
      slug: 'connections',
      encryption: createCredentialEncryption({ secret: 'test' }),
      entries: { openai: { piece, secret: true, oauth: false } },
      apps: {},
    };

    const [link] = buildSecretEndpoints({ connections, userSlug: 'users' });
    const req = {
      user: { id: 'owner', collection: 'users' },
      routeParams: { piece: 'openai' },
      json: () => Promise.resolve({ apiKey: 'sk-good' }),
      frogbot: { connections: { store: Promise.resolve({ upsert }), resolvePieceCredential } },
    };

    return { piece, link, req, upsert, listModels };
  }

  it('checks the key with one models call, then saves it and seeds the model list', async () => {
    const { piece, link, req, upsert, listModels } = setupProvider(() =>
      Promise.resolve(['gpt-4o', 'whisper-1']),
    );

    const response = await routed(() => link.handler(req as never));

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledOnce();
    expect(listModels).toHaveBeenCalledOnce();
    expect(listModels).toHaveBeenCalledWith({
      auth: { apiKey: 'sk-good' },
      credential: { apiKey: 'sk-good' },
      signal: expect.any(AbortSignal),
    });

    expect(await linkedModels({ req: req as never, piece })).toEqual(
      new Set(['openai/gpt-4o', 'openai/whisper-1']),
    );
    expect(listModels).toHaveBeenCalledOnce();
  });

  it.each([401, 403])(
    'refuses a key the provider rejects with %i, saving nothing',
    async (status) => {
      const { link, req, upsert } = setupProvider(() =>
        Promise.reject(Object.assign(new Error('connection.key-rejected'), { status })),
      );

      const response = await routed(() => link.handler(req as never));

      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject(
        failed("OpenAI didn't accept this key.", 'connection.key-rejected'),
      );
      expect(upsert).not.toHaveBeenCalled();
    },
  );

  it('saves nothing when the check cannot finish', async () => {
    const { link, req, upsert } = setupProvider(() =>
      Promise.reject(new TypeError('fetch failed')),
    );

    const response = await routed(() => link.handler(req as never));

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject(
      failed("Couldn't reach OpenAI to check this key.", 'connection.unreachable'),
    );
    expect(upsert).not.toHaveBeenCalled();
  });
});
