import type { Payload, PayloadRequest } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import {
  attachSessionPayload,
  withAuthOperation,
} from '../../../../packages/frogbot/src/auth/operation.js';
import { attachRegisteredFrogBot } from '../../../../packages/frogbot/src/config/attachFrogBot.js';
import type { FrogBotSanitizedConfig } from '../../../../packages/frogbot/src/config/sanitized.js';
import type { FrogBot } from '../../../../packages/frogbot/src/frogbot.js';
import {
  getCachedFrogBot,
  resetFrogBotCache,
} from '../../../../packages/frogbot/src/getFrogBot.js';
import { registerFrogBotInstance } from '../../../../packages/frogbot/src/instanceRegistry.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';

const runtimeSymbol = Symbol.for('@frogbotai/request-runtime');

function makePayload(): Payload {
  return {
    collections: { users: { config: { auth: {} } } },
    db: {},
  } as unknown as Payload;
}

function makeFrogBot(): FrogBot {
  return {
    kv: {
      acquireLock: vi.fn(async (key: string) => ({ key, token: 'session-lock' })),
      extendLock: vi.fn(async () => true),
      get: vi.fn(async () => undefined),
      releaseLock: vi.fn(async () => true),
    },
  } as unknown as FrogBot;
}

function makeReq(payload: Payload): PayloadRequest {
  return { context: {}, payload } as unknown as PayloadRequest;
}

describe('attachRegisteredFrogBot', () => {
  it('sets req.frogbot to the registered instance', () => {
    const payload = makePayload();
    const frogbot = makeFrogBot();
    const req = makeReq(payload);

    registerFrogBotInstance(payload, frogbot);

    const result = attachRegisteredFrogBot(req);

    expect(result).toBe(req);
    expect(result.frogbot).toBe(frogbot);
    expect(Reflect.get(req, runtimeSymbol)).toBe(payload);
  });

  it('unwraps a session payload before the lookup', async () => {
    const payload = makePayload();
    const frogbot = makeFrogBot();
    const req = {
      context: {},
      frogbot,
      headers: new Headers(),
      payload,
    } as unknown as PayloadRequest & FrogBotRequest;

    registerFrogBotInstance(payload, frogbot);

    const attached = await withAuthOperation({
      req,
      collectionSlug: 'users',
      operation: 'login',
      fn: async () => {
        attachSessionPayload(req);

        const scoped = req.payload;

        Reflect.deleteProperty(req, 'frogbot');

        const result = attachRegisteredFrogBot(req);

        return {
          result,
          runtime: Reflect.get(req, runtimeSymbol),
          scoped,
          sessionPayload: req.payload,
        };
      },
    });

    expect(attached.scoped).not.toBe(payload);
    expect(attached.sessionPayload).toBe(attached.scoped);
    expect(attached.result.frogbot).toBe(frogbot);
    expect(attached.runtime).toBe(payload);
  });

  it('keeps a session-scoped req.payload when req.frogbot is already the registered instance', async () => {
    const payload = makePayload();
    const frogbot = makeFrogBot();
    const req = {
      context: {},
      frogbot,
      headers: new Headers(),
      payload,
    } as unknown as PayloadRequest & FrogBotRequest;

    registerFrogBotInstance(payload, frogbot);

    const attached = await withAuthOperation({
      req,
      collectionSlug: 'users',
      operation: 'login',
      fn: async () => {
        attachSessionPayload(req);

        const scoped = req.payload;
        const result = attachRegisteredFrogBot(req);

        return { result, scoped, sessionPayload: req.payload };
      },
    });

    expect(attached.scoped).not.toBe(payload);
    expect(attached.sessionPayload).toBe(attached.scoped);
    expect(attached.result.frogbot).toBe(frogbot);
  });

  it('throws a [frogbot] error when no instance is registered', () => {
    const req = makeReq(makePayload());

    expect(() => attachRegisteredFrogBot(req)).toThrow(
      '[frogbot] No FrogBot instance is registered for this request.',
    );
    expect(req).not.toHaveProperty('frogbot');
  });

  it('running twice leaves the same instance and runtime', () => {
    const payload = makePayload();
    const frogbot = makeFrogBot();
    const req = makeReq(payload);

    registerFrogBotInstance(payload, frogbot);

    attachRegisteredFrogBot(req);

    const result = attachRegisteredFrogBot(req);

    expect(result.frogbot).toBe(frogbot);
    expect(req.payload).toBe(payload);
    expect(Reflect.get(req, runtimeSymbol)).toBe(payload);
  });

  it('seeds the cached FrogBot instance', () => {
    const payload = makePayload();
    const frogbot = makeFrogBot();

    resetFrogBotCache();
    registerFrogBotInstance(payload, frogbot, {} as FrogBotSanitizedConfig);

    attachRegisteredFrogBot(makeReq(payload));

    expect(getCachedFrogBot()).toBe(frogbot);
  });

  it('keeps an attached req.frogbot when no instance is registered', () => {
    const frogbot = makeFrogBot();
    const payload = makePayload();
    const req = { context: {}, frogbot, payload } as unknown as PayloadRequest;

    const result = attachRegisteredFrogBot(req);

    expect(result).toBe(req);
    expect(result.frogbot).toBe(frogbot);
    expect(req.payload).toBe(payload);
  });

  it('replaces a stale req.frogbot with the registered instance', () => {
    const payload = makePayload();
    const frogbot = makeFrogBot();
    const req = { context: {}, frogbot: makeFrogBot(), payload } as unknown as PayloadRequest;

    registerFrogBotInstance(payload, frogbot);

    const result = attachRegisteredFrogBot(req);

    expect(result.frogbot).toBe(frogbot);
    expect(Reflect.get(req, runtimeSymbol)).toBe(payload);
  });
});
