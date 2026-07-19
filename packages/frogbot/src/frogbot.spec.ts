import { describe, expect, it, vi } from 'vitest';

import { Frogbot } from './frogbot.js';
import { handleGatewayRequest } from './server/gateway.js';
import type { FrogbotSanitizedConfig } from './types/sanitized.js';

vi.mock('payload', () => {
  const mockPayload = createMockPayload();
  return {
    getPayload: vi.fn(() => mockPayload),
    createLocalReq: vi.fn(({ req }) => ({ ...req, payload: mockPayload })),
    handleEndpoints: vi.fn(() => new Response('ok')),
    __mockPayload: mockPayload,
  };
});

function createMockPayload() {
  return {
    config: {
      collections: [
        {
          slug: 'posts',
          custom: { frogbot: { roleMarkers: ['editor'], auth: false } },
        },
        { slug: 'users', custom: { frogbot: { auth: true } } },
        { slug: 'payload-preferences', custom: {} },
        { slug: 'payload-migrations', custom: {} },
      ],
      serverURL: 'http://localhost:3000',
    },
    db: { find: vi.fn(), create: vi.fn() },
    secret: 'test-secret-min-32-chars-long-for-jwt',
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
    },
    kv: { get: vi.fn(), set: vi.fn() },
    email: { sendEmail: vi.fn() },

    find: vi.fn(),
    findByID: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    duplicate: vi.fn(),
    findDistinct: vi.fn(),

    findVersions: vi.fn(),
    findVersionByID: vi.fn(),
    countVersions: vi.fn(),
    restoreVersion: vi.fn(),

    auth: vi.fn(),
    login: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    verifyEmail: vi.fn(),
    unlock: vi.fn(),

    encrypt: vi.fn((t: string) => `enc_${t}`),
    decrypt: vi.fn((t: string) => t.replace('enc_', '')),
    getAdminURL: vi.fn(() => 'http://localhost:3000/admin'),
    getAPIURL: vi.fn(() => 'http://localhost:3000/api'),
    destroy: vi.fn(),
  };
}

function makeConfig(): FrogbotSanitizedConfig {
  return {
    collections: [
      { slug: 'posts', roleMarkers: ['editor'] as any, auth: false }, // eslint-disable-line @typescript-eslint/no-explicit-any
      { slug: 'users', roleMarkers: [], auth: true },
    ],
    secret: 'test-secret-min-32-chars-long-for-jwt',
    _internal: {
      payloadConfig: Promise.resolve({} as any), // eslint-disable-line @typescript-eslint/no-explicit-any
    },
  };
}

function withAI(config: FrogbotSanitizedConfig): FrogbotSanitizedConfig {
  config.ai = {
    providers: { openai: { apiKey: 'sk-test' } },
    routers: {},
    hooks: {
      beforeOperation: [],
      beforeUpstream: [],
      afterUpstream: [],
      afterError: [],
      afterOperation: [],
    },
    access: {
      generate: ({ req }) => !!req.user,
      embed: ({ req }) => !!req.user,
      transcribe: ({ req }) => !!req.user,
      rerank: ({ req }) => !!req.user,
    },
    telemetry: { enabled: false },
    _internal: { deploymentId: 'test' },
  };
  return config;
}

async function setup() {
  const frogbot = new Frogbot();
  await frogbot.init({ config: makeConfig(), disableOnInit: true });
  return frogbot;
}

describe('Frogbot class', () => {
  describe('init + collections registry', () => {
    it('builds a collections registry keyed by slug', async () => {
      const frogbot = await setup();
      expect(Object.keys(frogbot.collections)).toEqual(['posts', 'users']);
    });

    it('filters out Payload-internal slugs that start with `payload-`', async () => {
      const frogbot = await setup();
      expect(frogbot.collections['payload-preferences']).toBeUndefined();
      expect(frogbot.collections['payload-migrations']).toBeUndefined();
    });

    it('copies custom.frogbot.roleMarkers onto each Collection entry', async () => {
      const frogbot = await setup();
      expect(frogbot.collections['posts'].roleMarkers).toEqual(['editor']);
      expect(frogbot.collections['users'].roleMarkers).toEqual([]);
    });

    it('copies custom.frogbot.auth onto each Collection entry', async () => {
      const frogbot = await setup();
      expect(frogbot.collections['posts'].auth).toBe(false);
      expect(frogbot.collections['users'].auth).toBe(true);
    });

    it('sets secret from Payload', async () => {
      const frogbot = await setup();
      expect(frogbot.secret).toBe('test-secret-min-32-chars-long-for-jwt');
    });

    it('sets logger from Payload', async () => {
      const frogbot = await setup();
      expect(frogbot.logger).toBeDefined();
      expect(typeof frogbot.logger.info).toBe('function');
    });

    it('leaves gateway undefined when no ai config is present', async () => {
      const frogbot = await setup();
      expect(frogbot.gateway).toBeUndefined();
    });

    it('creates the embedded gateway when ai is configured', async () => {
      const config = withAI(makeConfig());
      const frogbot = new Frogbot();
      await frogbot.init({ config, disableOnInit: true });
      expect(frogbot.gateway).toBeDefined();
      expect(typeof frogbot.gateway!.chatModel).toBe('function');
    });
  });

  describe('onInit', () => {
    it('calls onInit from options when not disabled', async () => {
      const onInit = vi.fn();
      const frogbot = new Frogbot();
      await frogbot.init({ config: makeConfig(), onInit });
      expect(onInit).toHaveBeenCalledWith(frogbot);
    });

    it('calls onInit from config when not disabled', async () => {
      const onInit = vi.fn();
      const config = makeConfig();
      config.onInit = onInit;
      const frogbot = new Frogbot();
      await frogbot.init({ config });
      expect(onInit).toHaveBeenCalledWith(frogbot);
    });

    it('does not call onInit when disableOnInit is true', async () => {
      const onInit = vi.fn();
      const frogbot = new Frogbot();
      await frogbot.init({ config: makeConfig(), onInit, disableOnInit: true });
      expect(onInit).not.toHaveBeenCalled();
    });
  });

  describe('CRUD methods', () => {
    it('exposes find/findByID/create/update/delete/count as async methods', async () => {
      const frogbot = await setup();
      const methods = ['find', 'findByID', 'create', 'update', 'delete', 'count'] as const;
      for (const method of methods) {
        expect(typeof frogbot[method]).toBe('function');
      }
    });

    it('find delegates to payload.find', async () => {
      const frogbot = await setup();
      await frogbot.find({ collection: 'posts' as any }); // eslint-disable-line @typescript-eslint/no-explicit-any
      const payloadMod = await import('payload');
      expect((payloadMod as any).__mockPayload.find).toHaveBeenCalled(); // eslint-disable-line @typescript-eslint/no-explicit-any
    });
  });

  describe('handleRequest', () => {
    it('delegates to handleEndpoints', async () => {
      const frogbot = await setup();
      const request = new Request('http://localhost:3000/api/posts');
      const response = await frogbot.handleRequest(request);
      expect(response).toBeInstanceOf(Response);
    });
  });

  describe('Gateway HTTP adapter', () => {
    it('authenticates, strips the mount prefix, and forwards req in the hook context', async () => {
      const config = withAI(makeConfig());
      const frogbot = new Frogbot();
      await frogbot.init({ config, disableOnInit: true });
      const payloadMod = await import('payload');
      const payload = (payloadMod as any).__mockPayload; // eslint-disable-line @typescript-eslint/no-explicit-any
      payload.auth.mockResolvedValue({
        user: { id: 'user-1' },
        permissions: {},
      });
      const handler = vi.fn((request: Request) => Response.json({ path: new URL(request.url).pathname }));
      frogbot.gateway!.handler = handler;

      const response = await handleGatewayRequest({
        frogbot,
        request: new Request('http://localhost/api/ai/v1/chat/completions', {
          method: 'POST',
          headers: { authorization: 'Bearer token' },
          body: '{}',
        }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ path: '/v1/chat/completions' });
      // The gateway route handlers own the hook lifecycle; FrogBot only seeds
      // `req` into the hook context so the gateway's hooks can read it back.
      expect(handler).toHaveBeenCalledOnce();
      const [forwarded, opts] = handler.mock.calls[0];
      expect(new URL(forwarded.url).pathname).toBe('/v1/chat/completions');
      expect(opts).toMatchObject({ context: { req: expect.objectContaining({ user: { id: 'user-1' } }) } });
    });

    it('returns 401 when unauthenticated', async () => {
      const config = withAI(makeConfig());
      const frogbot = new Frogbot();
      await frogbot.init({ config, disableOnInit: true });
      const payloadMod = await import('payload');
      const payload = (payloadMod as any).__mockPayload; // eslint-disable-line @typescript-eslint/no-explicit-any
      payload.auth.mockResolvedValue({ user: null, permissions: {} });
      const handler = vi.fn();
      frogbot.gateway!.handler = handler;

      const response = await handleGatewayRequest({
        frogbot,
        request: new Request('http://localhost/api/ai/v1/chat/completions', { method: 'POST', body: '{}' }),
      });

      expect(response.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('utilities', () => {
    it('encrypt/decrypt work', async () => {
      const frogbot = await setup();
      expect(frogbot.encrypt('hello')).toBe('enc_hello');
      expect(frogbot.decrypt('enc_hello')).toBe('hello');
    });

    it('getAdminURL/getAPIURL work', async () => {
      const frogbot = await setup();
      expect(frogbot.getAdminURL()).toBe('http://localhost:3000/admin');
      expect(frogbot.getAPIURL()).toBe('http://localhost:3000/api');
    });
  });

  describe('destroy', () => {
    it('delegates to payload.destroy', async () => {
      const frogbot = await setup();
      await frogbot.destroy();
      const payloadMod = await import('payload');
      expect((payloadMod as any).__mockPayload.destroy).toHaveBeenCalled(); // eslint-disable-line @typescript-eslint/no-explicit-any
    });
  });

  describe('adapters', () => {
    it('db is accessible via getter', async () => {
      const frogbot = await setup();
      expect(frogbot.db).toBeDefined();
    });

    it('kv is accessible via getter', async () => {
      const frogbot = await setup();
      expect(frogbot.kv).toBeDefined();
    });

    it('email is accessible via getter', async () => {
      const frogbot = await setup();
      expect(frogbot.email).toBeDefined();
    });
  });
});
