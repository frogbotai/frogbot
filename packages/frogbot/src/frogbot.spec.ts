import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { Frogbot } from './frogbot.js';
import { createGatewayHandler } from './server/gateway.js';
import type { FrogbotSanitizedConfig } from './types/sanitized.js';

vi.mock('payload', () => {
  let mockPayload = createMockPayload();
  return {
    getPayload: vi.fn(() => mockPayload),
    createLocalReq: vi.fn(({ req }) => ({ ...req, payload: mockPayload })),
    handleEndpoints: vi.fn(() => new Response('ok')),
    __getMockPayload: () => mockPayload,
    __resetMockPayload: () => {
      mockPayload = createMockPayload();
    },
  };
});

function createMockPayload() {
  return {
    config: {
      collections: [
        {
          slug: 'posts',
          custom: { frogbot: { auth: false } },
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

function emailWarnings(warn: ReturnType<typeof vi.fn>) {
  return warn.mock.calls.filter(([message]) => String(message).includes('No email adapter provided'));
}

function makeConfig(): FrogbotSanitizedConfig {
  return {
    collections: [
      { slug: 'posts', auth: false },
      { slug: 'users', auth: true },
    ],
    secret: 'test-secret-min-32-chars-long-for-jwt',
    chat: { enabled: false },
    _internal: {
      payloadConfig: Promise.resolve({} as any),  
      noEmail: true,
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

beforeEach(async () => {
  const payloadMod = await import('payload');
  (payloadMod as unknown as { __resetMockPayload: () => void }).__resetMockPayload();
});

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

    it('warns once through the initialized logger when email is omitted', async () => {
      const frogbot = await setup();

      expect(emailWarnings(frogbot.logger.warn as ReturnType<typeof vi.fn>)).toHaveLength(1);
    });

    it('does not warn when email is configured', async () => {
      const config = makeConfig();
      config._internal.noEmail = false;
      const frogbot = new Frogbot();

      await frogbot.init({ config, disableOnInit: true });

      expect(emailWarnings(frogbot.logger.warn as ReturnType<typeof vi.fn>)).toHaveLength(0);
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

    it('returns the lifecycle-created instance when Payload initialization wins', async () => {
      const payloadMod = await import('payload');
      const payload = (payloadMod as unknown as { __getMockPayload: () => ReturnType<typeof createMockPayload> })
        .__getMockPayload();
      const lifecycleFrogbot = new Frogbot();
      const { registerFrogbotInstance } = await import('./instanceRegistry.js');
      registerFrogbotInstance(payload, lifecycleFrogbot);

      const result = await new Frogbot().init({ config: makeConfig(), disableOnInit: true });

      expect(result).toBe(lifecycleFrogbot);
    });

    it('refreshes config-derived registries for the same Payload instance', async () => {
      const payloadMod = await import('payload');
      const payload = (payloadMod as unknown as { __getMockPayload: () => ReturnType<typeof createMockPayload> })
        .__getMockPayload();
      const firstAccess = vi.fn(() => true);
      const secondAccess = vi.fn(() => false);
      const firstConfig = withAI(makeConfig());
      firstConfig.agents = [{ slug: 'assistant', model: 'openai/gpt-4o', instructions: 'first', access: firstAccess }];
      const onInit = vi.fn();
      const frogbot = await new Frogbot().init({ config: firstConfig, onInit });
      const firstAgent = frogbot.agents.assistant;
      const firstGateway = frogbot.gateway;
      const firstConnections = frogbot.connections;

      await expect(new Frogbot().init({ config: firstConfig, onInit })).resolves.toBe(frogbot);
      expect(frogbot.agents.assistant).toBe(firstAgent);

      payload.config.collections = [
        { slug: 'articles', custom: { frogbot: { auth: false } } },
        { slug: 'payload-preferences', custom: {} },
      ];
      const secondConfig = withAI(makeConfig());
      secondConfig.agents = [{ slug: 'assistant', model: 'openai/gpt-4o', instructions: 'second', access: secondAccess }];

      await expect(new Frogbot().init({ config: secondConfig, onInit })).resolves.toBe(frogbot);

      expect(frogbot.config).toBe(secondConfig);
      expect(frogbot.agents.assistant).not.toBe(firstAgent);
      expect(frogbot.agents.assistant.config.instructions).toBe('second');
      await expect(Promise.resolve(frogbot.agents.assistant.config.access?.({ req: {} as never }))).resolves.toBe(false);
      expect(frogbot.gateway).not.toBe(firstGateway);
      expect(frogbot.connections).not.toBe(firstConnections);
      expect(Object.keys(frogbot.collections)).toEqual(['articles']);
      expect(onInit).toHaveBeenCalledOnce();
    });

    it('keeps Payload initialization off the public instance API', () => {
      type HasInitFromPayload = 'initFromPayload' extends keyof Frogbot ? true : false;

      expectTypeOf<HasInitFromPayload>().toEqualTypeOf<false>();
      expect(new Frogbot()).not.toHaveProperty('initFromPayload');
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
      await frogbot.find({ collection: 'posts' as any });  
      const payloadMod = await import('payload');
      const payload = (payloadMod as unknown as { __getMockPayload: () => ReturnType<typeof createMockPayload> })
        .__getMockPayload();
      expect(payload.find).toHaveBeenCalled();
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
    async function setupGateway(access: Partial<NonNullable<FrogbotSanitizedConfig['ai']>['access']>) {
      const config = withAI(makeConfig());
      Object.assign(config.ai!.access, access);
      const frogbot = new Frogbot();
      await frogbot.init({ config, disableOnInit: true });
      const payloadMod = await import('payload');
      const payload = (payloadMod as unknown as { __getMockPayload: () => ReturnType<typeof createMockPayload> })
        .__getMockPayload();
      payload.auth.mockResolvedValue({ user: { id: 'user-1' }, permissions: {} });
      const handler = vi.fn((request: Request) => Response.json({ path: new URL(request.url).pathname }));
      frogbot.gateway!.handler = handler;
      return { frogbot, handler };
    }

    it('authenticates, strips the mount prefix, and forwards req in the hook context', async () => {
      const config = withAI(makeConfig());
      const frogbot = new Frogbot();
      await frogbot.init({ config, disableOnInit: true });
      const payloadMod = await import('payload');
      const payload = (payloadMod as unknown as { __getMockPayload: () => ReturnType<typeof createMockPayload> })
        .__getMockPayload();
      payload.auth.mockResolvedValue({
        user: { id: 'user-1' },
        permissions: {},
      });
      const handler = vi.fn((request: Request) => Response.json({ path: new URL(request.url).pathname }));
      frogbot.gateway!.handler = handler;

      const response = await createGatewayHandler(frogbot)(
        new Request('http://localhost/api/ai/v1/chat/completions', {
          method: 'POST',
          headers: { authorization: 'Bearer token' },
          body: '{}',
        }),
      );

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
      const payload = (payloadMod as unknown as { __getMockPayload: () => ReturnType<typeof createMockPayload> })
        .__getMockPayload();
      payload.auth.mockResolvedValue({ user: null, permissions: {} });
      const handler = vi.fn();
      frogbot.gateway!.handler = handler;

      const response = await createGatewayHandler(frogbot)(
        new Request('http://localhost/api/ai/v1/chat/completions', { method: 'POST', body: '{}' }),
      );

      expect(response.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });

    it('returns 403 when generate access is denied', async () => {
      const { frogbot, handler } = await setupGateway({ generate: () => false });

      const response = await createGatewayHandler(frogbot)(
        new Request('http://localhost/api/ai/v1/chat/completions', { method: 'POST', body: '{}' }),
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: { message: 'Access denied for AI generate', type: 'permission_error' },
      });
      expect(handler).not.toHaveBeenCalled();
    });

    it('uses transcribe access for audio transcriptions', async () => {
      const { frogbot, handler } = await setupGateway({ generate: () => true, transcribe: () => false });

      const response = await createGatewayHandler(frogbot)(
        new Request('http://localhost/api/ai/v1/audio/transcriptions', { method: 'POST', body: 'audio' }),
      );

      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    });

    it('forwards when method access is allowed', async () => {
      const generate = vi.fn(() => true);
      const { frogbot, handler } = await setupGateway({ generate });

      const response = await createGatewayHandler(frogbot)(
        new Request('http://localhost/api/ai/v1/chat/completions', { method: 'POST', body: '{}' }),
      );

      expect(response.status).toBe(200);
      expect(generate).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledOnce();
      expect(new URL(handler.mock.calls[0]![0].url).pathname).toBe('/v1/chat/completions');
    });

    it('forwards model discovery without an access check', async () => {
      const generate = vi.fn(() => false);
      const { frogbot, handler } = await setupGateway({ generate });

      const response = await createGatewayHandler(frogbot)(
        new Request('http://localhost/api/ai/v1/models'),
      );

      expect(response.status).toBe(200);
      expect(generate).not.toHaveBeenCalled();
      expect(handler).toHaveBeenCalledOnce();
      expect(new URL(handler.mock.calls[0]![0].url).pathname).toBe('/v1/models');
    });
  });

  describe('utilities', () => {
    it('creates requests with top-level Frogbot only', async () => {
      const frogbot = await setup();
      const request = await frogbot.createRequest();

      expect(request.frogbot).toBe(frogbot);
      expect((request as unknown as { payload: object }).payload).not.toHaveProperty('frogbot');
    });

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
      const payload = (payloadMod as unknown as { __getMockPayload: () => ReturnType<typeof createMockPayload> })
        .__getMockPayload();
      expect(payload.destroy).toHaveBeenCalled();
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
