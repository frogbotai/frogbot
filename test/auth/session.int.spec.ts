import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { redisKVAdapter } from '@frogbotai/kv-redis';
import { getPayload, jwtSign, type Payload, type TypedUser } from 'payload';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { checkSessionLease } from '../../packages/frogbot/src/auth/operation.js';
import { issueSession } from '../../packages/frogbot/src/auth/session.js';
import { buildConfig } from '../../packages/frogbot/src/config/build.js';
import { getPayloadConfig } from '../../packages/frogbot/src/config/getPayloadConfig.js';
import { Frogbot } from '../../packages/frogbot/src/frogbot.js';
import * as locks from '../../packages/frogbot/src/kv/lock.js';
import { definePiece } from '../../packages/frogbot/src/pieces/definePiece.js';
import type { FrogbotRequest } from '../../packages/frogbot/src/types/request.js';
import { getTestDatabaseAdapter } from '../__helpers/shared/db/getTestDatabaseAdapter.js';

describe(`session issuance [${process.env.FROGBOT_DATABASE || 'sqlite'}]`, () => {
  let frogbot: Frogbot;
  let payload: Payload;
  let userId: string | number;
  let req: FrogbotRequest;
  let sequence = 0;
  let priorToken: string;
  let databaseDir: string;
  let initialHooks: Payload['collections'][string]['config']['hooks'];
  const priorSession = {
    id: 'prior-session',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  };
  const claims = (token: string) =>
    JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString());
  const readUser = () =>
    payload.db.findOne<TypedUser>({ collection: 'members', where: { id: { equals: userId } } });
  const writeUser = (data: Record<string, unknown>) =>
    payload.db.updateOne({ id: userId, collection: 'members', data, returning: false });
  const issue = (request = req) =>
    issueSession({ req: request, collectionSlug: 'members', userId });
  const pauseUserRead = () => {
    let notify!: () => void;
    let resume!: () => void;
    const read = new Promise<void>((resolve) => {
      notify = resolve;
    });
    const resumed = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const find = payload.db.findOne.bind(payload.db);
    vi.spyOn(payload.db, 'findOne').mockImplementationOnce(async (args) => {
      const user = await find(args);
      notify();
      await resumed;
      return user;
    });
    return { read, resume };
  };
  const authRequest = (path: string, token = priorToken, data?: unknown) =>
    frogbot.handleRequest(
      new Request(`http://localhost/api/${path}`, {
        method: 'POST',
        headers: {
          ...(token ? { authorization: `JWT ${token}` } : {}),
          ...(data ? { 'content-type': 'application/json' } : {}),
        },
        ...(data ? { body: JSON.stringify(data) } : {}),
      }),
    );
  const logout = async () => {
    const response = await authRequest('members/logout');
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('frogbot-token=');
  };
  const refresh = async () => {
    const response = await authRequest('members/refresh-token');
    expect(response.status).toBe(200);
    return response.json() as Promise<{ exp: number; refreshedToken: string }>;
  };
  const login = () =>
    frogbot.login({
      collection: 'members',
      data: { email: `session-${sequence}@example.com`, password: 'test-password' },
    });
  const loginHTTP = async () => {
    const response = await authRequest('members/login', '', {
      email: `session-${sequence}@example.com`,
      password: 'test-password',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('frogbot-token=');
    return response.json() as ReturnType<typeof login>;
  };
  const prepareReset = () =>
    writeUser({
      resetPasswordToken: `reset-${sequence}`,
      resetPasswordExpiration: new Date(Date.now() + 60_000).toISOString(),
    });
  const reset = () =>
    frogbot.resetPassword({
      collection: 'members',
      data: { token: `reset-${sequence}`, password: 'replacement-password' },
    });
  const resetHTTP = async () => {
    const response = await authRequest('members/reset-password', '', {
      token: `reset-${sequence}`,
      password: 'replacement-password',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('frogbot-token=');
    return response.json() as ReturnType<typeof reset>;
  };
  const expectWaiting = async (pending: Promise<unknown>) => {
    const settled = vi.fn();
    void pending.then(settled, settled);
    await setTimeout(100);
    expect(settled).not.toHaveBeenCalled();
  };
  const expectAuthenticated = async (token: string, id: string | number | null = userId) => {
    const result = await payload.auth({ headers: new Headers({ authorization: `JWT ${token}` }) });
    expect(result.user?.id ?? null).toBe(id);
  };
  const shortenLease = () => {
    const run = locks.runKVLock;
    vi.spyOn(locks, 'runKVLock').mockImplementation((args) => run({ ...args, ttl: 300 }));
  };

  beforeAll(async () => {
    databaseDir = await mkdtemp(join(tmpdir(), 'frogbot-session-'));
    const createIdentity = definePiece({
      slug: 'identity',
      label: 'Identity',
      auth: z.object({ accessToken: z.string() }),
      client: ({ auth }) => auth,
      oauth: {
        authorizationUrl: 'https://identity.example.com/authorize',
        tokenUrl: 'https://identity.example.com/token',
        scopes: ['openid', 'email'],
        account: async () => ({ id: 'identity', label: 'Identity', email: 'person@example.com' }),
      },
      actions: [],
    });
    const identity = createIdentity({ oauth: { clientId: 'client', clientSecret: 'secret' } });
    const config = await buildConfig({
      secret: 'session-issuance-test-secret',
      kv: redisKVAdapter({
        redisURL: process.env.REDIS_URL || 'redis://localhost:6379',
        keyPrefix: `frogbot-session:${databaseDir}:`,
      }),
      db: await getTestDatabaseAdapter({
        sqlite: sqliteAdapter({
          client: { url: `file:${join(databaseDir, 'sessions.db')}` },
        }),
      }),
      admin: { user: 'members', importMap: { autoGenerate: false } },
      typescript: { autoGenerate: false },
      collections: [
        {
          slug: 'members',
          trash: true,
          auth: { verify: true, signIn: [identity] },
          access: { read: () => true },
          fields: [
            { name: 'name', type: 'text' },
            { name: 'claim', type: 'json', saveToJWT: true },
            { name: 'manager', type: 'relationship', relationTo: 'members' },
          ],
        },
        { slug: 'customers', auth: { signIn: [identity] }, fields: [] },
      ],
    });
    frogbot = await new Frogbot().init({ config, disableOnInit: true });
    payload = await getPayload({ config: await getPayloadConfig(config) });
    initialHooks = { ...payload.collections.members!.config.hooks };
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    const collection = payload.collections.members!.config;
    collection.hooks = { ...initialHooks };
    collection.hooks.beforeLogin = [];
    collection.hooks.afterLogin = [];
    collection.auth.useSessions = true;
    collection.auth.maxLoginAttempts = 5;
    collection.auth.removeTokenFromResponses = false;
    const user = await payload.create({
      collection: 'members',
      data: {
        email: `session-${++sequence}@example.com`,
        password: 'test-password',
        name: 'Original',
      },
      disableVerificationEmail: true,
    });
    userId = user.id;
    priorSession.id = `prior-session-${sequence}`;
    await writeUser({ _verified: true, manager: userId });
    await writeUser({ sessions: [priorSession], updatedAt: null });
    priorToken = (
      await jwtSign({
        fieldsToSign: {
          id: userId,
          collection: 'members',
          email: user.email,
          sid: priorSession.id,
        },
        secret: payload.secret,
        tokenExpiration: 3600,
      })
    ).token;
    req = await frogbot.createRequest();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await frogbot?.kv.clear();
    await frogbot?.destroy();
    await rm(databaseDir, { recursive: true, force: true });
  });

  it('reloads hidden auth fields and preserves the existing session and unrelated data', async () => {
    const visible = await payload.findByID({
      collection: 'members',
      id: userId,
      overrideAccess: false,
    });
    expect(visible.sessions).toEqual([]);
    expect(visible.lockUntil).toBeUndefined();
    await writeUser({ loginAttempts: 2, lockUntil: new Date(Date.now() - 60_000).toISOString() });
    const original = await readUser();
    const write = payload.db.updateOne.bind(payload.db);
    const writes: string[][] = [];
    vi.spyOn(payload.db, 'updateOne').mockImplementation((args) => {
      writes.push(Object.keys(args.data).sort());
      return write(args);
    });

    const result = await issue();
    const jwt = claims(result.token);
    const stored = await readUser();

    expect(jwt).toMatchObject({ id: userId, collection: 'members', exp: result.exp });
    expect(stored?.sessions?.map(({ id }) => id)).toEqual([priorSession.id, jwt.sid]);
    expect(stored).toMatchObject({
      hash: original!.hash,
      salt: original!.salt,
      manager: userId,
      name: 'Original',
      loginAttempts: 0,
      lockUntil: null,
    });
    expect(writes[0]).toEqual(['sessions', 'updatedAt']);
    expect(result.user).toMatchObject({
      id: userId,
      collection: 'members',
      _strategy: 'local-jwt',
    });
    expect(req.user).toBe(result.user);
    expect(result.user).not.toHaveProperty('hash');
    expect(result.user).not.toHaveProperty('salt');
    expect(result.user).not.toHaveProperty('sessions');
    const authenticated = await payload.auth({
      headers: new Headers({ authorization: `JWT ${result.token}` }),
    });
    expect(authenticated.user?.id).toBe(userId);
  });

  it('enforces hidden locks even when attempt tracking is disabled', async () => {
    payload.collections.members!.config.auth.maxLoginAttempts = 0;
    await writeUser({ lockUntil: new Date(Date.now() + 60_000).toISOString() });
    await expect(issue()).rejects.toMatchObject({ name: 'LockedAuth' });
    expect((await readUser())?.sessions?.map(({ id }) => id)).toEqual([priorSession.id]);
    expect(req.user).toBeNull();
  });

  it('enforces local verification from the stored document', async () => {
    await writeUser({ _verified: false });
    req.user = { id: userId, _verified: true };
    const previousUser = req.user;
    await expect(issue()).rejects.toMatchObject({ name: 'UnverifiedEmail' });
    expect((await readUser())?.sessions?.map(({ id }) => id)).toEqual([priorSession.id]);
    expect(req.user).toBe(previousUser);
  });

  it('rejects a subject without an authoritative email before writing a session', async () => {
    const user = await readUser();
    delete user!.email;
    vi.spyOn(payload.db, 'findOne').mockResolvedValueOnce(user);
    const update = vi.spyOn(payload.db, 'updateOne');

    await expect(issue()).rejects.toMatchObject({ name: 'AuthenticationError' });

    expect(update).not.toHaveBeenCalled();
    expect(req.user).toBeNull();
    expect((await readUser())?.sessions?.map(({ id }) => id)).toEqual([priorSession.id]);
  });

  it('excludes trashed and missing subjects', async () => {
    await writeUser({ deletedAt: new Date().toISOString() });
    await expect(issue()).rejects.toMatchObject({ name: 'AuthenticationError' });
    await expect(
      issueSession({
        req,
        collectionSlug: 'members',
        userId: typeof userId === 'number' ? -1 : '000000000000000000000000',
      }),
    ).rejects.toMatchObject({ name: 'AuthenticationError' });
    expect((await readUser())?.sessions?.map(({ id }) => id)).toEqual([priorSession.id]);
  });

  it('runs login hooks sequentially and pins identity through replacement and in-place mutation', async () => {
    const hooks = payload.collections.members!.config.hooks;
    const order: string[] = [];
    const original = await readUser();
    hooks.beforeLogin = [
      async ({ user }) => {
        await setTimeout(5);
        order.push('before-1');
        return {
          ...user,
          id: -1,
          collection: 'customers',
          email: 'wrong@example.com',
          claim: 'from-hook',
          name: 'Before',
        };
      },
      ({ user }) => {
        order.push('before-2');
        expect(user).toMatchObject({
          id: userId,
          collection: 'members',
          email: original!.email,
          name: 'Before',
        });
        user.id = -2;
        user.collection = 'customers';
        return undefined;
      },
    ];
    hooks.afterLogin = [
      ({ user, req, token }) => {
        order.push('after-1');
        expect(req.user).toBe(user);
        expect(user).toMatchObject({ id: userId, collection: 'members', _strategy: 'local-jwt' });
        expect(claims(token!)).toMatchObject({
          id: userId,
          collection: 'members',
          claim: 'from-hook',
        });
        return { id: -3, collection: 'customers', name: 'After' };
      },
      ({ user, req }) => {
        order.push('after-2');
        expect(req.user).toBe(user);
        expect(user).toMatchObject({ id: userId, collection: 'members', name: 'After' });
        user.id = -4;
      },
    ];

    const result = await issue();

    expect(order).toEqual(['before-1', 'before-2', 'after-1', 'after-2']);
    expect(result.user).toMatchObject({
      id: userId,
      collection: 'members',
      _strategy: 'local-jwt',
      name: 'After',
    });
    expect(req.user).toBe(result.user);
    expect(await readUser()).toMatchObject({ name: 'Original', manager: userId });
  });

  it.each(['beforeLogin', 'afterLogin'] as const)(
    'revokes only the new SID when %s fails after changing identity',
    async (phase) => {
      const failure = new Error('Hook failed');
      const otherSession = { ...priorSession, id: `another-session-${sequence}` };
      const previousUser = { id: 'previous-user', collection: 'customers' };
      req.user = previousUser;
      payload.collections.members!.config.hooks[phase] = [
        async ({ user, req }) => {
          const current = await readUser();
          await writeUser({ sessions: [...current!.sessions!, otherSession] });
          user.id = -1;
          req.user = { id: -2, collection: 'customers' };
          throw failure;
        },
      ];

      await expect(issue()).rejects.toBe(failure);

      expect((await readUser())?.sessions?.map(({ id }) => id)).toEqual([
        priorSession.id,
        otherSession.id,
      ]);
      expect(req.user).toBe(previousUser);
    },
  );

  it('revokes the new SID when signing fails', async () => {
    const afterLogin = vi.fn();
    payload.collections.members!.config.hooks.beforeLogin = [
      ({ user }) => ({ ...user, claim: 1n }),
    ];
    payload.collections.members!.config.hooks.afterLogin = [afterLogin];

    await expect(issue()).rejects.toThrow();

    expect(afterLogin).not.toHaveBeenCalled();
    expect((await readUser())?.sessions?.map(({ id }) => id)).toEqual([priorSession.id]);
    expect(req.user).toBeNull();
  });

  it('cleans up a lost write response inside its transaction', async () => {
    const update = payload.db.updateOne.bind(payload.db);
    const failure = new Error('Lost write response');
    vi.spyOn(payload.db, 'updateOne').mockImplementationOnce(async (args) => {
      await update(args);
      throw failure;
    });

    await expect(issue()).rejects.toBe(failure);

    expect((await readUser())?.sessions?.map(({ id }) => id)).toEqual([priorSession.id]);
    expect(req.user).toBeNull();
  });

  it('sets request identity and runs hooks without sessions', async () => {
    payload.collections.members!.config.auth.useSessions = false;
    const afterLogin = vi.fn(({ user, req }) => {
      expect(req.user).toBe(user);
      expect(user).toMatchObject({ id: userId, collection: 'members', _strategy: 'local-jwt' });
      return { ...user, name: 'Stateless' };
    });
    payload.collections.members!.config.hooks.afterLogin = [afterLogin];
    const update = vi.spyOn(payload.db, 'updateOne');

    const result = await issue();

    expect(claims(result.token)).not.toHaveProperty('sid');
    expect(update).not.toHaveBeenCalled();
    expect(afterLogin).toHaveBeenCalledOnce();
    expect(req.user).toBe(result.user);
    expect(result.user.name).toBe('Stateless');
    expect((await readUser())?.sessions?.map(({ id }) => id)).toEqual([priorSession.id]);
  });

  it('serializes concurrent issuances and renews the lease during slow hooks', async () => {
    shortenLease();
    const extend = vi.spyOn(frogbot.kv, 'extendLock');
    let active = 0;
    let maximum = 0;
    payload.collections.members!.config.hooks.beforeLogin = [
      async ({ user }) => {
        active++;
        maximum = Math.max(maximum, active);
        await setTimeout(650);
        active--;
        return user;
      },
    ];

    const results = await Promise.all([
      issue(),
      issueSession({
        req: await frogbot.createRequest(),
        collectionSlug: 'members',
        userId: String(userId),
      }),
    ]);

    expect(maximum).toBe(1);
    expect(extend).toHaveBeenCalled();
    expect((await readUser())?.sessions?.map(({ id }) => id)).toEqual([
      priorSession.id,
      ...results.map(({ token }) => claims(token).sid),
    ]);
  });

  it('makes real HTTP logout wait for the issuer read and keeps A revoked', async () => {
    const paused = pauseUserRead();
    const pending = issue();
    let loggingOut!: Promise<void>;
    try {
      await paused.read;
      loggingOut = logout();
      await expectWaiting(loggingOut);
    } finally {
      paused.resume();
    }
    const result = await pending;
    await loggingOut;

    expect((await readUser())?.sessions?.map(({ id }) => id)).toEqual([claims(result.token).sid]);
    await expectAuthenticated(result.token);
    await expectAuthenticated(priorToken, null);
  });

  it('makes local password login wait for the issuer read and preserves both sessions', async () => {
    const paused = pauseUserRead();
    const pending = issue();
    let loggingIn!: ReturnType<typeof login>;
    try {
      await paused.read;
      loggingIn = login();
      await expectWaiting(loggingIn);
    } finally {
      paused.resume();
    }
    const result = await pending;
    const loggedIn = await loggingIn;
    const loginSid = claims(loggedIn.token!).sid;

    expect((await readUser())?.sessions?.map(({ id }) => id).sort()).toEqual(
      [priorSession.id, loginSid, claims(result.token).sid].sort(),
    );
    await expectAuthenticated(result.token);
    await expectAuthenticated(loggedIn.token!);
  });

  it('makes real HTTP refresh wait for the issuer read and preserves its expiry', async () => {
    const paused = pauseUserRead();
    const pending = issue();
    let refreshing!: ReturnType<typeof refresh>;
    try {
      await paused.read;
      refreshing = refresh();
      await expectWaiting(refreshing);
    } finally {
      paused.resume();
    }
    const result = await pending;
    const refreshed = await refreshing;
    const stored = await readUser();

    expect(stored?.sessions?.map(({ id }) => id)).toEqual([
      priorSession.id,
      claims(result.token).sid,
    ]);
    expect(stored?.sessions?.[0]?.expiresAt).not.toEqual(priorSession.expiresAt);
    expect(Math.floor(new Date(stored!.sessions![0]!.expiresAt).getTime() / 1000)).toBe(
      refreshed.exp,
    );
    await expectAuthenticated(refreshed.refreshedToken);
    await expectAuthenticated(result.token);
  });

  it.each(['logout', 'login'] as const)(
    'makes real %s wait for failure cleanup',
    async (operation) => {
      const failure = new Error('Hook failed');
      let paused!: ReturnType<typeof pauseUserRead>;
      let notify!: () => void;
      const cleanup = new Promise<void>((resolve) => {
        notify = resolve;
      });
      payload.collections.members!.config.hooks.afterLogin = [
        () => {
          paused = pauseUserRead();
          notify();
          throw failure;
        },
      ];
      const pending = issue().catch((error: unknown) => error);
      let expected: string[] = [];
      let overlapping!: Promise<void> | ReturnType<typeof login>;
      await cleanup;
      try {
        await paused.read;
        payload.collections.members!.config.hooks.afterLogin = [];
        overlapping = operation === 'logout' ? logout() : login();
        await expectWaiting(overlapping);
      } finally {
        paused.resume();
      }

      expect(await pending).toBe(failure);
      const loggedIn = await overlapping;
      if (loggedIn) {
        expected = [priorSession.id, claims(loggedIn.token!).sid];
        await expectAuthenticated(loggedIn.token!);
      } else {
        await expectAuthenticated(priorToken, null);
      }
      expect((await readUser())?.sessions?.map(({ id }) => id).sort()).toEqual(expected.sort());
      expect(req.user).toBeNull();
    },
  );

  it.each(['local', 'HTTP'])(
    'makes the issuer wait for %s password login from its first read',
    async (transport) => {
      const paused = pauseUserRead();
      const pending = transport === 'local' ? login() : loginHTTP();
      let issuing!: ReturnType<typeof issue>;
      try {
        await paused.read;
        issuing = issue();
        await expectWaiting(issuing);
      } finally {
        paused.resume();
      }
      const result = await pending;
      const issued = await issuing;
      const issuedSid = claims(issued.token).sid;

      expect((await readUser())?.sessions?.map(({ id }) => id).sort()).toEqual(
        [priorSession.id, issuedSid, claims(result.token!).sid].sort(),
      );
      await expectAuthenticated(issued.token);
      await expectAuthenticated(result.token!);
    },
  );

  it('compensates after a lease loss and waits for the in-flight hook before restoring the request', async () => {
    shortenLease();
    vi.spyOn(frogbot.kv, 'extendLock').mockResolvedValueOnce(false);
    let finished = false;
    payload.collections.members!.config.hooks.afterLogin = [
      async ({ req, user }) => {
        await setTimeout(450);
        req.user = user;
        finished = true;
        return user;
      },
    ];

    await expect(issue()).rejects.toThrow();

    expect(finished).toBe(true);
    expect(req.user).toBeNull();
    expect((await readUser())?.sessions?.map(({ id }) => id)).toEqual([priorSession.id]);
  });

  it('revokes a successfully signed session if releasing its lock fails', async () => {
    const release = frogbot.kv.releaseLock.bind(frogbot.kv);
    const failure = new Error('Release response lost');
    vi.spyOn(frogbot.kv, 'releaseLock').mockImplementationOnce(async (lock) => {
      await release(lock);
      throw failure;
    });

    await expect(issue()).rejects.toBe(failure);

    expect(req.user).toBeNull();
    expect((await readUser())?.sessions?.map(({ id }) => id)).toEqual([priorSession.id]);
  });

  it('rolls back a session write if its lease is lost before commit', async () => {
    shortenLease();
    vi.spyOn(frogbot.kv, 'extendLock').mockResolvedValueOnce(false);
    const update = payload.db.updateOne.bind(payload.db);
    vi.spyOn(payload.db, 'updateOne').mockImplementationOnce(async (args) => {
      const result = await update(args);
      await setTimeout(450);
      return result;
    });

    await expect(issue()).rejects.toThrow();

    expect(req.user).toBeNull();
    expect((await readUser())?.sessions?.map(({ id }) => id)).toEqual([priorSession.id]);
  });

  it('issues collection-scoped tokens for a second auth collection', async () => {
    const customer = await payload.create({
      collection: 'customers',
      data: { email: 'customer@example.com', password: 'test-password' },
    });
    const result = await issueSession({ req, collectionSlug: 'customers', userId: customer.id });

    expect(result.user).toMatchObject({
      id: customer.id,
      collection: 'customers',
      _strategy: 'local-jwt',
    });
    expect(claims(result.token)).toMatchObject({ id: customer.id, collection: 'customers' });
    const authenticated = await payload.auth({
      headers: new Headers({ authorization: `JWT ${result.token}` }),
    });
    expect(authenticated.user).toMatchObject({ id: customer.id, collection: 'customers' });
    expect((await readUser())?.sessions?.map(({ id }) => id)).toEqual([priorSession.id]);
  });

  it('preserves HTTP authentication errors and password attempt accounting', async () => {
    vi.spyOn(payload.logger, 'error').mockImplementation(() => undefined);
    const existing = await authRequest('members/login', '', {
      email: `session-${sequence}@example.com`,
      password: 'incorrect',
    });
    const missing = await authRequest('members/login', '', {
      email: 'absent@example.com',
      password: 'incorrect',
    });
    expect(existing.status).toBe(401);
    expect(missing.status).toBe(existing.status);
    expect(await missing.json()).toEqual(await existing.json());
    expect(existing.headers.get('set-cookie')).toBeNull();
    expect((await readUser())?.loginAttempts).toBe(1);
    expect((await readUser())?.sessions?.map(({ id }) => id)).toEqual([priorSession.id]);
  });

  it.each(['local login', 'HTTP login', 'local reset', 'HTTP reset', 'logout', 'refresh'] as const)(
    'keeps the boundary held while %s commits its real transaction',
    async (operation) => {
      await prepareReset();
      let notify!: () => void;
      let resume!: () => void;
      const committing = new Promise<void>((resolve) => {
        notify = resolve;
      });
      const resumed = new Promise<void>((resolve) => {
        resume = resolve;
      });
      const commit = payload.db.commitTransaction.bind(payload.db);
      vi.spyOn(payload.db, 'commitTransaction').mockImplementationOnce(async (id) => {
        expect(await id).toBeTruthy();
        notify();
        await resumed;
        await commit(id);
      });
      const pending =
        operation === 'local login'
          ? login()
          : operation === 'HTTP login'
            ? loginHTTP()
            : operation === 'local reset'
              ? reset()
              : operation === 'HTTP reset'
                ? resetHTTP()
                : operation === 'logout'
                  ? logout()
                  : refresh();
      let issuing!: ReturnType<typeof issue>;
      try {
        await committing;
        issuing = issue();
        await expectWaiting(issuing);
        expect((await readUser())?.sessions?.map(({ id }) => id)).toEqual([priorSession.id]);
      } finally {
        resume();
      }
      const result = await pending;
      const issued = await issuing;
      const token = result && 'token' in result ? result.token : undefined;
      const refreshedToken =
        result && 'refreshedToken' in result ? result.refreshedToken : undefined;
      const expected = [claims(issued.token).sid];
      if (operation !== 'logout') expected.push(priorSession.id);
      if (token) expected.push(claims(token).sid);
      expect((await readUser())?.sessions?.map(({ id }) => id).sort()).toEqual(expected.sort());
      await expectAuthenticated(issued.token);
      if (token) await expectAuthenticated(token);
      if (refreshedToken) await expectAuthenticated(refreshedToken);
      if (operation === 'logout') await expectAuthenticated(priorToken, null);
    },
  );

  it('cleans up password-login lease loss', async () => {
    shortenLease();
    vi.spyOn(frogbot.kv, 'extendLock').mockResolvedValueOnce(false);
    let finished = false;
    payload.collections.members!.config.hooks.afterLogin = [
      async ({ req, user }) => {
        await setTimeout(450);
        req.user = user;
        finished = true;
      },
    ];
    await expect(
      frogbot.login({
        collection: 'members',
        data: { email: `session-${sequence}@example.com`, password: 'test-password' },
        req,
      }),
    ).rejects.toThrow();
    expect(finished).toBe(true);
    expect(req.user).toBeNull();
    expect((await readUser())?.sessions?.map(({ id }) => id)).toEqual([priorSession.id]);
    await expectAuthenticated(priorToken);
  });

  it('renews a slow password login using an independent KV store', async () => {
    shortenLease();
    const extend = vi.spyOn(frogbot.kv, 'extendLock');
    payload.collections.members!.config.hooks.afterLogin = [
      async () => {
        await setTimeout(650);
      },
    ];
    const result = await login();
    expect(extend).toHaveBeenCalled();
    await expectAuthenticated(result.token!);
    expect(Object.keys(payload.db.sessions)).toEqual([]);
    await writeUser({ name: 'After renewal' });
  });

  it('does not let expired-lease password-login cleanup resurrect a real logout', async () => {
    const rollback = vi.spyOn(payload.db, 'rollbackTransaction');
    shortenLease();
    vi.spyOn(frogbot.kv, 'extendLock').mockResolvedValueOnce(false);
    let notify!: () => void;
    const entered = new Promise<void>((resolve) => {
      notify = resolve;
    });
    let finished = false;
    payload.collections.members!.config.hooks.afterLogin = [
      async () => {
        notify();
        await setTimeout(650);
        finished = true;
      },
    ];
    const loggingIn = login().catch((error: unknown) => error);
    await entered;
    const loggingOut = authRequest('members/logout');
    expect(await loggingIn).toBeInstanceOf(Error);
    expect(rollback).toHaveBeenCalled();
    expect(Object.keys(payload.db.sessions)).toEqual([]);
    const response = await loggingOut;
    if (response.status !== 200) await logout();
    expect(finished).toBe(true);
    expect((await readUser())?.sessions).toEqual([]);
    await expectAuthenticated(priorToken, null);
  });

  it('compensates a lost password-session write response', async () => {
    const update = payload.db.updateOne.bind(payload.db);
    const failure = new Error('Password session write response lost');
    vi.spyOn(payload.db, 'updateOne').mockImplementationOnce(async (args) => {
      await update(args);
      throw failure;
    });
    await expect(login()).rejects.toBe(failure);
    expect((await readUser())?.sessions?.map(({ id }) => id)).toEqual([priorSession.id]);
    await expectAuthenticated(priorToken);
  });

  it.each(['login', 'reset-password'])(
    'compensates committed HTTP %s when lock release fails without issuing a cookie',
    async (operation) => {
      await prepareReset();
      vi.spyOn(payload.logger, 'error').mockImplementation(() => undefined);
      const release = frogbot.kv.releaseLock.bind(frogbot.kv);
      vi.spyOn(frogbot.kv, 'releaseLock').mockImplementationOnce(async (lock) => {
        await release(lock);
        throw new Error('Release response lost');
      });
      const response = await authRequest(
        `members/${operation}`,
        '',
        operation === 'login'
          ? {
              email: `session-${sequence}@example.com`,
              password: 'test-password',
            }
          : { token: `reset-${sequence}`, password: 'replacement-password' },
      );
      expect(response.status).toBe(500);
      expect(response.headers.get('set-cookie')).toBeNull();
      expect((await readUser())?.sessions?.map(({ id }) => id)).toEqual([priorSession.id]);
      await expectAuthenticated(priorToken);
    },
  );

  it('keeps requests userless and rejects cross-collection refresh and logout', async () => {
    vi.spyOn(payload.logger, 'error').mockImplementation(() => undefined);
    expect((await authRequest('members/refresh-token', '')).status).toBe(403);
    expect((await authRequest('members/logout', '')).status).toBe(400);
    expect((await authRequest('customers/refresh-token')).status).toBe(403);
    expect((await authRequest('customers/logout')).status).toBe(403);
    expect(req.user).toBeNull();
    await expectAuthenticated(priorToken);
    expect((await readUser())?.sessions?.map(({ id }) => id)).toEqual([priorSession.id]);
  });

  it('revalidates a refresh that waited behind a real logout', async () => {
    vi.spyOn(payload.logger, 'error').mockImplementation(() => undefined);
    let notify!: () => void;
    let resume!: () => void;
    const entered = new Promise<void>((resolve) => {
      notify = resolve;
    });
    const resumed = new Promise<void>((resolve) => {
      resume = resolve;
    });
    payload.collections.members!.config.hooks.afterLogout = [
      async () => {
        notify();
        await resumed;
      },
    ];
    const pending = authRequest('members/logout');
    let refreshing!: Promise<Response>;
    try {
      await entered;
      refreshing = authRequest('members/refresh-token');
      await expectWaiting(refreshing);
    } finally {
      resume();
    }
    expect((await pending).status).toBe(200);
    expect((await refreshing).status).toBe(403);
    expect((await readUser())?.sessions).toEqual([]);
  });

  it('reenters session issuance from a password-login hook and keeps hook context changes', async () => {
    let nested: Awaited<ReturnType<typeof issue>> | undefined;
    payload.collections.members!.config.hooks.beforeLogin = [
      async ({ req: hookReq }) => {
        if (hookReq.context.nested) return;
        hookReq.context.nested = true;
        nested = await issue(hookReq as unknown as FrogbotRequest);
      },
    ];
    const result = await frogbot.login({
      collection: 'members',
      data: { email: `session-${sequence}@example.com`, password: 'test-password' },
      req,
    });
    expect(req.context.nested).toBe(true);
    expect(req.context).not.toHaveProperty('_frogbotSessionOperation');
    expect((await readUser())?.sessions?.map(({ id }) => id).sort()).toEqual(
      [priorSession.id, claims(result.token!).sid, claims(nested!.token).sid].sort(),
    );
    await expectAuthenticated(result.token!);
    await expectAuthenticated(nested!.token);
  });

  it('does not treat a reused request outside the owning async call as reentrant', async () => {
    const paused = pauseUserRead();
    const first = issue();
    let second!: ReturnType<typeof issue>;
    try {
      await paused.read;
      second = issue(req);
      await expectWaiting(second);
    } finally {
      paused.resume();
    }
    const results = await Promise.all([first, second]);
    expect((await readUser())?.sessions?.map(({ id }) => id)).toEqual([
      priorSession.id,
      ...results.map(({ token }) => claims(token).sid),
    ]);
  });

  it('revokes a failed nested issuance even when the password-login hook catches its error', async () => {
    const failure = new Error('Nested login hook failed');
    const hooks = payload.collections.members!.config.hooks;
    hooks.beforeLogin = [
      async ({ req: hookReq }) => {
        if (hookReq.context.nested) throw failure;
        hookReq.context.nested = true;
        await expect(issue(hookReq as unknown as FrogbotRequest)).rejects.toBe(failure);
      },
    ];
    const result = await login();
    expect((await readUser())?.sessions?.map(({ id }) => id)).toEqual([
      priorSession.id,
      claims(result.token!).sid,
    ]);
    await expectAuthenticated(result.token!);
  });

  it('does not reuse a completed boundary from a detached hook continuation', async () => {
    let resumeDetached!: () => void;
    const resumed = new Promise<void>((resolve) => {
      resumeDetached = resolve;
    });
    let detached!: ReturnType<typeof issue>;
    payload.collections.members!.config.hooks.afterLogin = [
      ({ req: hookReq }) => {
        const copied = { ...hookReq, context: { ...hookReq.context } } as unknown as FrogbotRequest;
        detached = resumed.then(() => issue(copied));
      },
    ];
    const first = await issue();
    payload.collections.members!.config.hooks.afterLogin = [];
    const paused = pauseUserRead();
    const second = issue(await frogbot.createRequest());
    try {
      await paused.read;
      resumeDetached();
      await expectWaiting(detached);
    } finally {
      paused.resume();
    }
    const results = [first, ...(await Promise.all([second, detached]))];
    expect((await readUser())?.sessions?.map(({ id }) => id)).toEqual([
      priorSession.id,
      ...results.map(({ token }) => claims(token).sid),
    ]);
  });

  it('reports cleanup failures while retrying compensation without leaving an orphan', async () => {
    const failure = new Error('Login hook failed');
    const cleanupFailure = new Error('Revocation read failed');
    payload.collections.members!.config.hooks.afterLogin = [
      () => {
        vi.spyOn(payload.db, 'findOne').mockRejectedValueOnce(cleanupFailure);
        throw failure;
      },
    ];
    await expect(issue()).rejects.toMatchObject({ errors: [failure, cleanupFailure] });
    expect(req.user).toBeNull();
    expect((await readUser())?.sessions?.map(({ id }) => id)).toEqual([priorSession.id]);
  });

  it('allows another auth collection to log in while an issuer waits in its own collection', async () => {
    const customer = await payload.create({
      collection: 'customers',
      data: { email: 'parallel-customer@example.com', password: 'test-password' },
    });
    const paused = pauseUserRead();
    const pending = issue();
    try {
      await paused.read;
      const result = await frogbot.login({
        collection: 'customers',
        data: { email: 'parallel-customer@example.com', password: 'test-password' },
      });
      await expectAuthenticated(result.token!, customer.id);
      expect(req.user).toBeNull();
    } finally {
      paused.resume();
    }
    await expectAuthenticated((await pending).token);
  });

  it('preserves canonical hook ordering, access arguments, and cookie-only login responses', async () => {
    const order: string[] = [];
    const collection = payload.collections.members!.config;
    collection.auth.removeTokenFromResponses = true;
    collection.hooks.beforeOperation = [
      ...initialHooks.beforeOperation,
      ({ operation, args }) => {
        if (operation === 'login') order.push('beforeOperation');
        return args;
      },
    ];
    collection.hooks.beforeLogin = [
      () => {
        order.push('beforeLogin');
      },
    ];
    collection.hooks.afterLogin = [
      () => {
        order.push('afterLogin');
      },
    ];
    collection.hooks.afterRead = [
      ({ doc, overrideAccess }) => {
        expect(overrideAccess).toBe(false);
        order.push('afterRead');
        return doc;
      },
    ];
    collection.hooks.afterOperation = [
      ({ operation, result }) => {
        if (operation === 'login') order.push('afterOperation');
        return result;
      },
      checkSessionLease,
    ];
    const response = await authRequest('members/login?depth=0', '', {
      email: `SESSION-${sequence}@EXAMPLE.COM `,
      password: 'test-password',
      _frogbotSessionOperation: { transaction: true },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty('token');
    expect(response.headers.get('set-cookie')).toContain('frogbot-token=');
    expect(order).toEqual([
      'beforeOperation',
      'beforeLogin',
      'afterLogin',
      'afterRead',
      'afterOperation',
    ]);
  });

  it.each(['local', 'HTTP'])(
    'coordinates %s reset-password from its first read through session issuance',
    async (transport) => {
      await prepareReset();
      const paused = pauseUserRead();
      const pending = transport === 'local' ? reset() : resetHTTP();
      let issuing!: ReturnType<typeof issue>;
      try {
        await paused.read;
        issuing = issue();
        await expectWaiting(issuing);
      } finally {
        paused.resume();
      }
      const result = await pending;
      const issued = await issuing;
      expect((await readUser())?.sessions?.map(({ id }) => id).sort()).toEqual(
        [priorSession.id, claims(result.token!).sid, claims(issued.token).sid].sort(),
      );
      await expectAuthenticated(result.token!);
      await expectAuthenticated(issued.token);
      await expect(
        frogbot.login({
          collection: 'members',
          data: { email: `session-${sequence}@example.com`, password: 'replacement-password' },
        }),
      ).resolves.toHaveProperty('token');
    },
  );

  it.each(['issue', 'login', 'reset', 'logout', 'refresh'] as const)(
    'rejects transactionless %s before applying a session write',
    async (operation) => {
      await prepareReset();
      vi.spyOn(payload.logger, 'error').mockImplementation(() => undefined);
      vi.spyOn(payload.db, 'beginTransaction').mockResolvedValue(null);
      const update = vi.spyOn(payload.db, 'updateOne');
      if (operation === 'logout' || operation === 'refresh') {
        const response = await authRequest(
          `members/${operation === 'refresh' ? 'refresh-token' : operation}`,
        );
        expect(response.status).toBe(500);
        expect(response.headers.get('set-cookie')).toBeNull();
      } else {
        await expect(
          operation === 'issue' ? issue() : operation === 'login' ? login() : reset(),
        ).rejects.toThrow(
          'Coordinated sessions require an active SQLite, PostgreSQL, or MongoDB transaction.',
        );
      }
      expect(update).not.toHaveBeenCalled();
      expect((await readUser())?.sessions?.map(({ id }) => id)).toEqual([priorSession.id]);
      await expectAuthenticated(priorToken);
    },
  );

  it.each(['issue', 'login', 'reset', 'HTTP reset', 'refresh'] as const)(
    'rolls back actual delayed %s write application after lease expiry without restoring logout',
    async (operation) => {
      await prepareReset();
      shortenLease();
      vi.spyOn(payload.logger, 'error').mockImplementation(() => undefined);
      vi.spyOn(frogbot.kv, 'extendLock').mockResolvedValueOnce(false);
      let notify!: () => void;
      let resume!: () => void;
      const entered = new Promise<void>((resolve) => {
        notify = resolve;
      });
      const resumed = new Promise<void>((resolve) => {
        resume = resolve;
      });
      const update = payload.db.updateOne.bind(payload.db);
      let staleTransaction: string | number | undefined;
      let applied = false;
      vi.spyOn(payload.db, 'updateOne').mockImplementationOnce(async (args) => {
        staleTransaction = await args.req?.transactionID;
        expect(staleTransaction).toBeTruthy();
        notify();
        await resumed;
        const result = await update(args);
        applied = true;
        return result;
      });
      const rollback = vi.spyOn(payload.db, 'rollbackTransaction');
      const commit = vi.spyOn(payload.db, 'commitTransaction');
      const pending = (
        operation === 'issue'
          ? issue()
          : operation === 'login'
            ? login()
            : operation === 'reset'
              ? reset()
              : operation === 'HTTP reset'
                ? authRequest('members/reset-password', '', {
                    token: `reset-${sequence}`,
                    password: 'replacement-password',
                  })
                : authRequest('members/refresh-token')
      ).catch((error: unknown) => error);
      let loggingOut!: Promise<void>;
      try {
        await entered;
        await setTimeout(350);
        expect(applied).toBe(false);
        loggingOut = logout();
        if (payload.db.name === 'sqlite') {
          await expectWaiting(loggingOut);
        } else {
          await loggingOut;
          expect((await readUser())?.sessions).toEqual([]);
        }
        expect(applied).toBe(false);
      } finally {
        resume();
      }
      const result = await pending;
      await loggingOut;
      if (result instanceof Response) expect(result.status).toBe(500);
      else expect(result).toBeInstanceOf(Error);
      expect(rollback).toHaveBeenCalledWith(staleTransaction);
      expect(commit.mock.calls.map(([id]) => id)).not.toContain(staleTransaction);
      if (payload.db.name !== 'mongoose') expect(applied).toBe(true);
      expect((await readUser())?.sessions).toEqual([]);
      await expectAuthenticated(priorToken, null);
    },
  );

  it.each(['application/json', 'multipart/form-data; boundary=unfinished'])(
    'bounds an unfinished real %s stream before acquiring a collection lock',
    async (contentType) => {
      vi.spyOn(payload.logger, 'error').mockImplementation(() => undefined);
      const timeout = AbortSignal.timeout.bind(AbortSignal);
      vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) =>
        timeout(ms === 10_000 ? 400 : ms),
      );
      const acquire = vi.spyOn(frogbot.kv, 'acquireLock');
      const cancel = vi.fn();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{'));
        },
        cancel,
      });
      const pending = frogbot.handleRequest(
        new Request('http://localhost/api/members/login', {
          method: 'POST',
          headers: { 'content-type': contentType },
          body,
          duplex: 'half',
        } as RequestInit),
      );
      await setTimeout(30);
      expect(acquire).not.toHaveBeenCalled();
      await logout();
      const response = await pending;
      expect(response.status).toBe(408);
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(cancel).toHaveBeenCalledOnce();
      expect(acquire).toHaveBeenCalledOnce();
    },
    3_000,
  );

  it('keeps logout revoked when lease loss occurs during an actual delayed commit', async () => {
    shortenLease();
    vi.spyOn(payload.logger, 'error').mockImplementation(() => undefined);
    vi.spyOn(frogbot.kv, 'extendLock').mockResolvedValueOnce(false);
    let notify!: () => void;
    let resume!: () => void;
    const entered = new Promise<void>((resolve) => {
      notify = resolve;
    });
    const resumed = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const commit = payload.db.commitTransaction.bind(payload.db);
    vi.spyOn(payload.db, 'commitTransaction').mockImplementationOnce(async (id) => {
      notify();
      await resumed;
      await commit(id);
    });
    const pending = issue().catch((error: unknown) => error);
    let loggingOut!: Promise<Response>;
    try {
      await entered;
      await setTimeout(350);
      loggingOut = authRequest('members/logout');
      await setTimeout(100);
    } finally {
      resume();
    }
    expect(await pending).toBeInstanceOf(Error);
    const response = await loggingOut;
    if (response.status !== 200) await logout();
    expect((await readUser())?.sessions).toEqual([]);
    await expectAuthenticated(priorToken, null);
  });

  it('preserves multipart credentials and file data for the canonical parser', async () => {
    const beforeLogin = vi.fn(({ req: hookReq }) => {
      expect(hookReq.headers.get('content-type')).toContain('multipart/form-data; boundary=');
      expect(hookReq.file).toMatchObject({ name: 'proof.txt', mimetype: 'text/plain' });
      expect(hookReq.file.data.toString()).toBe('proof');
    });
    payload.collections.members!.config.hooks.beforeLogin = [beforeLogin];
    const body = new FormData();
    body.set(
      '_payload',
      JSON.stringify({ email: `session-${sequence}@example.com`, password: 'test-password' }),
    );
    body.set('file', new Blob(['proof'], { type: 'text/plain' }), 'proof.txt');
    const response = await frogbot.handleRequest(
      new Request('http://localhost/api/members/login', { method: 'POST', body }),
    );
    expect(response.status).toBe(200);
    expect(beforeLogin).toHaveBeenCalledOnce();
    await expectAuthenticated((await response.json()).token);
  });

  it('preserves chunked JSON and its content type for canonical login', async () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        email: `session-${sequence}@example.com`,
        password: 'test-password',
      }),
    );
    const beforeLogin = vi.fn(({ req: hookReq }) => {
      expect(hookReq.headers.get('content-type')).toBe('application/json; charset=utf-8');
      expect(hookReq.data.email).toBe(`session-${sequence}@example.com`);
    });
    payload.collections.members!.config.hooks.beforeLogin = [beforeLogin];
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(bytes.slice(0, 10));
        await setTimeout(30);
        controller.enqueue(bytes.slice(10));
        controller.close();
      },
    });
    const response = await frogbot.handleRequest(
      new Request('http://localhost/api/members/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body,
        duplex: 'half',
      } as RequestInit),
    );
    expect(response.status).toBe(200);
    expect(beforeLogin).toHaveBeenCalledOnce();
    await expectAuthenticated((await response.json()).token);
  });

  it('cancels an aborted stream and rejects oversized bodies without acquiring a lock', async () => {
    vi.spyOn(payload.logger, 'error').mockImplementation(() => undefined);
    const acquire = vi.spyOn(frogbot.kv, 'acquireLock');
    const controller = new AbortController();
    const cancel = vi.fn();
    const pending = frogbot.handleRequest(
      new Request('http://localhost/api/members/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: new ReadableStream({ cancel }),
        signal: controller.signal,
        duplex: 'half',
      } as RequestInit),
    );
    await setTimeout(30);
    controller.abort();
    expect((await pending).status).toBe(408);
    expect(cancel).toHaveBeenCalledOnce();
    const response = await frogbot.handleRequest(
      new Request('http://localhost/api/members/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: ' '.repeat(1_048_577),
      }),
    );
    expect(response.status).toBe(413);
    expect(acquire).not.toHaveBeenCalled();
    await logout();
  });
});
