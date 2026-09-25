import { AsyncLocalStorage } from 'node:async_hooks';
import { setTimeout } from 'node:timers/promises';

import {
  type CollectionAfterOperationHook,
  commitTransaction,
  Forbidden,
  initTransaction,
  type Payload,
  type PayloadRequest,
  type SanitizedCollectionConfig,
  type TypedUser,
} from 'payload';

import { KVLockContentionError } from '../kv/errors.js';
import { runKVLock } from '../kv/lock.js';
import type { KV, KVLockCallback } from '../kv/types.js';
import type { FrogBotRequest } from '../types/request.js';

type SessionCleanup = (signal: AbortSignal) => Promise<void>;
type SessionOperation = {
  active: boolean;
  marker: symbol;
  collectionSlug: string;
  kv: KV;
  signal: AbortSignal;
  cleanups: Set<SessionCleanup>;
  parent?: SessionOperation;
  transaction?: boolean;
  kind?: 'login' | 'logout' | 'refresh' | 'resetPassword';
  payload?: Payload;
  sessionTracked?: boolean;
};

const operations = new AsyncLocalStorage<SessionOperation>();
const contextKey = '_frogbotSessionOperation';
const payloads = new WeakMap<Payload, Payload>();
const sqliteOperations = new WeakMap<Payload, Map<string, Promise<void>>>();

export function unwrapSessionPayload(payload: Payload): Payload {
  return payloads.get(payload) ?? payload;
}

export function attachSessionPayload(req: PayloadRequest): void {
  const operation = operations.getStore();
  if (!operation?.active || !operation.kind || req.context[contextKey] !== operation.marker) return;
  if (!operation.payload) {
    const payload = unwrapSessionPayload(req.payload);
    const scoped = Object.create(payload) as Payload;
    scoped.db = new Proxy(payload.db, {
      get(target, property) {
        if (property === 'beginTransaction') {
          const begin: Payload['db']['beginTransaction'] = async (...args) => {
            const id = await target.beginTransaction(...args);
            if (id) req.transactionID = id;
            return id;
          };
          return begin;
        }
        if (property === 'updateOne') {
          const update: Payload['db']['updateOne'] = async (args) => {
            if (
              args.collection !== operation.collectionSlug ||
              !Array.isArray(args.data.sessions)
            ) {
              return target.updateOne(args);
            }
            operation.signal.throwIfAborted();
            if (payload.collections[operation.collectionSlug]!.config.auth.useSessions) {
              await requireSessionTransaction(args.req as PayloadRequest);
            }
            if (
              (operation.kind === 'login' ||
                (operation.kind === 'resetPassword' && args.data.updatedAt === null)) &&
              !operation.sessionTracked
            ) {
              const sessions = args.data.sessions as { id?: unknown }[];
              const sid = sessions.at(-1)?.id;
              const userId = args.id ?? args.data.id;
              if (
                typeof sid === 'string' &&
                (typeof userId === 'string' || typeof userId === 'number')
              ) {
                operation.sessionTracked = true;
                operation.cleanups.add((signal) =>
                  revokeIssuedSession({
                    req,
                    collectionSlug: operation.collectionSlug,
                    userId,
                    sid,
                    signal,
                  }),
                );
              }
            }
            const result = await target.updateOne(args);
            operation.signal.throwIfAborted();
            return result;
          };
          return update;
        }
        if (property === 'commitTransaction') {
          const commit: Payload['db']['commitTransaction'] = async (id) => {
            operation.signal.throwIfAborted();
            await target.commitTransaction(id);
            operation.signal.throwIfAborted();
          };
          return commit;
        }
        const value: unknown = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    payloads.set(scoped, payload);
    operation.payload = scoped;
  }
  req.payload = operation.payload;
}

export function hasSessionTransaction({
  req,
  collectionSlug,
}: {
  req: Pick<PayloadRequest, 'context'>;
  collectionSlug: string;
}): boolean {
  const operation = operations.getStore();
  return Boolean(
    operation &&
    operation.active &&
    req.context?.[contextKey] === operation.marker &&
    operation.collectionSlug === collectionSlug &&
    operation.transaction,
  );
}

async function withSessionLock<T>({
  kv,
  key,
  fn,
}: {
  kv: KV;
  key: string;
  fn: KVLockCallback<T>;
}): Promise<T> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new KVLockContentionError(key);
    const wait = new AbortController();
    let occupied: unknown;
    try {
      occupied = await Promise.race([
        kv.get(key),
        setTimeout(remaining, undefined, { signal: wait.signal, ref: false }).then(() => {
          throw new KVLockContentionError(key);
        }),
      ]);
    } finally {
      wait.abort();
    }
    if (occupied) {
      await setTimeout(50);
      continue;
    }
    let pending: Promise<T> | undefined;
    let releasing: Promise<boolean> | undefined;
    try {
      return await runKVLock({
        key,
        ttl: 30_000,
        kv: {
          acquireLock: (key, ttl) => kv.acquireLock(key, ttl),
          extendLock: (lock, ttl) => kv.extendLock(lock, ttl),
          releaseLock: (lock) => {
            releasing = (async () => {
              await pending?.catch(() => undefined);
              return kv.releaseLock(lock);
            })();
            return releasing;
          },
        },
        fn: (args) => {
          pending = Promise.resolve().then(() => fn(args));
          return pending;
        },
      });
    } catch (error) {
      const errors = new Set([error]);
      await pending?.catch((failure: unknown) => {
        errors.add(failure);
      });
      await releasing?.catch((failure: unknown) => {
        errors.add(failure);
      });
      if (errors.size > 1) {
        throw new AggregateError(errors, 'Session operation failed.');
      }
      if (pending || !(error instanceof KVLockContentionError) || Date.now() >= deadline) {
        throw error;
      }
      await setTimeout(50);
    }
  }
}

export async function rollbackSessionTransaction(req: PayloadRequest): Promise<void> {
  const transactionID = await req.transactionID;
  if (transactionID) await req.payload.db.rollbackTransaction(transactionID);
  delete req.transactionID;
}

export async function requireSessionTransaction(req: PayloadRequest): Promise<void> {
  const transactionID = await req.transactionID;
  if (
    !transactionID ||
    !['sqlite', 'postgres', 'mongoose'].includes(req.payload.db.name) ||
    !req.payload.db.sessions?.[transactionID]
  ) {
    throw new Error(
      'Coordinated sessions require an active SQLite, PostgreSQL, or MongoDB transaction.',
    );
  }
}

export async function revokeIssuedSession({
  req,
  collectionSlug,
  userId,
  sid,
  signal,
}: {
  req: PayloadRequest;
  collectionSlug: string;
  userId: string | number;
  sid: string;
  signal: AbortSignal;
}): Promise<void> {
  const dbReq = {
    ...req,
    payload: unwrapSessionPayload(req.payload),
    transactionID: hasSessionTransaction({ req, collectionSlug }) ? req.transactionID : undefined,
  };
  signal.throwIfAborted();
  const shouldCommit = await initTransaction(dbReq);
  try {
    await requireSessionTransaction(dbReq);
    const user = await dbReq.payload.db.findOne<TypedUser>({
      collection: collectionSlug,
      req: dbReq,
      select: { sessions: true },
      where: { id: { equals: userId } },
    });
    signal.throwIfAborted();
    if (user?.sessions?.some((session) => session.id === sid)) {
      await dbReq.payload.db.updateOne({
        id: userId,
        collection: collectionSlug,
        data: { sessions: user.sessions.filter((session) => session.id !== sid), updatedAt: null },
        req: dbReq,
        returning: false,
      });
    }
    signal.throwIfAborted();
    if (shouldCommit) await commitTransaction(dbReq);
  } catch (error) {
    try {
      if (shouldCommit) await rollbackSessionTransaction(dbReq);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Session revocation rollback failed.');
    }
    throw error;
  }
}

export async function withSessionOperation<T>({
  req,
  collectionSlug,
  fn,
}: {
  req: FrogBotRequest;
  collectionSlug: string;
  fn: (operation: Pick<SessionOperation, 'signal' | 'cleanups'>) => Promise<T>;
}): Promise<T> {
  const kv = req.frogbot.kv;
  const parent = operations.getStore();
  let inherited: SessionOperation | undefined;
  if (parent?.active && req.context?.[contextKey] === parent.marker) {
    for (let current: SessionOperation | undefined = parent; current; current = current.parent) {
      if (current.active && current.kv === kv && current.collectionSlug === collectionSlug) {
        inherited = current;
        break;
      }
    }
  }

  const cleanups = new Set<SessionCleanup>();
  const lock = { kv, key: `auth:session:${JSON.stringify([collectionSlug])}` };
  const previousUser = req.user;
  const cleanup = async (signal: AbortSignal) => {
    for (const task of cleanups) {
      await task(signal);
      cleanups.delete(task);
    }
  };

  const run = async ({ signal }: { signal: AbortSignal }) => {
    const operation = {
      active: true,
      marker: Symbol(),
      collectionSlug,
      kv,
      signal,
      cleanups,
      parent,
      transaction: inherited?.transaction,
      kind: inherited?.kind,
    };
    const previousMarker = req.context?.[contextKey];
    req.context = { ...req.context, [contextKey]: operation.marker };

    return operations.run(operation, async () => {
      try {
        signal.throwIfAborted();
        const result = await fn(operation);
        signal.throwIfAborted();
        return result;
      } catch (error) {
        if (!signal.aborted) {
          try {
            await cleanup(signal);
          } catch (cleanupError) {
            throw new AggregateError([error, cleanupError], 'Session operation cleanup failed.');
          }
        }
        throw error;
      } finally {
        operation.active = false;
        if (previousMarker === undefined) delete req.context[contextKey];
        else req.context[contextKey] = previousMarker;
      }
    });
  };

  const runLocked = async (args: { signal: AbortSignal }) => {
    const payload = unwrapSessionPayload((req as unknown as PayloadRequest).payload);
    if (payload.db.name !== 'sqlite') return run(args);

    let pending = sqliteOperations.get(payload);
    if (!pending) sqliteOperations.set(payload, (pending = new Map()));
    const waiting = pending.get(collectionSlug);
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    pending.set(collectionSlug, current);

    try {
      await waiting;
      return await run(args);
    } finally {
      release();
      if (pending.get(collectionSlug) === current) pending.delete(collectionSlug);
    }
  };

  try {
    return await (inherited ? run(inherited) : withSessionLock({ ...lock, fn: runLocked }));
  } catch (error) {
    req.user = previousUser;

    if (!inherited && cleanups.size) {
      try {
        await withSessionLock({ ...lock, fn: ({ signal }) => cleanup(signal) });
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Session operation cleanup failed.');
      }
    }

    throw error;
  } finally {
    if (inherited) {
      for (const task of cleanups) inherited.cleanups.add(task);
    }
  }
}

export const checkSessionLease: CollectionAfterOperationHook = ({ req, result }) => {
  const operation = operations.getStore();
  if (operation?.active && req.context[contextKey] === operation.marker) {
    operation.signal.throwIfAborted();
  }
  return result;
};

export function coordinatesSessions(collection: SanitizedCollectionConfig | undefined): boolean {
  return Boolean(collection?.custom?.frogbot?.signIn?.length);
}

export async function withAuthOperation<T>({
  req,
  collectionSlug,
  operation: kind,
  fn,
}: {
  req: FrogBotRequest;
  collectionSlug: string;
  operation: 'login' | 'logout' | 'refresh' | 'resetPassword';
  fn: () => Promise<T>;
}): Promise<T> {
  return withSessionOperation({
    req,
    collectionSlug,
    fn: async ({ signal }) => {
      const payloadReq = req as unknown as PayloadRequest;
      const operation = operations.getStore()!;
      const previousPayload = payloadReq.payload;
      operation.kind = kind;
      attachSessionPayload(payloadReq);

      if (operation.transaction) {
        try {
          return await fn();
        } finally {
          payloadReq.payload = previousPayload;
        }
      }

      const previousTransaction = payloadReq.transactionID;
      delete payloadReq.transactionID;
      operation.transaction = true;
      try {
        const collection = payloadReq.payload.collections[collectionSlug]!.config;
        if (kind === 'refresh' && payloadReq.user) {
          if (payloadReq.user.collection !== collectionSlug) throw new Forbidden(payloadReq.t);
          if (collection.auth.useSessions && !collection.auth.disableLocalStrategy) {
            const user = await payloadReq.payload.db.findOne<TypedUser>({
              collection: collectionSlug,
              req: payloadReq,
              where: { id: { equals: payloadReq.user.id } },
            });
            if (!user?.sessions?.some(({ id }) => id === payloadReq.user?._sid)) {
              throw new Forbidden(payloadReq.t);
            }
          }
        }
        signal.throwIfAborted();

        const shouldCommit = kind !== 'login' && (await initTransaction(payloadReq));
        if (kind !== 'login' && collection.auth.useSessions) {
          await requireSessionTransaction(payloadReq);
        }

        const result = await fn();
        signal.throwIfAborted();
        if (shouldCommit) await commitTransaction(payloadReq);

        return result;
      } catch (error) {
        try {
          await rollbackSessionTransaction(payloadReq);
        } catch (cleanupError) {
          throw new AggregateError([error, cleanupError], 'Auth operation rollback failed.');
        }

        throw error;
      } finally {
        operation.transaction = false;
        payloadReq.payload = previousPayload;
        if (previousTransaction === undefined) delete payloadReq.transactionID;
        else payloadReq.transactionID = previousTransaction;
      }
    },
  });
}
