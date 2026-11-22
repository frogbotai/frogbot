import { randomUUID } from 'node:crypto';

import type { FrogBotRequest } from '../types/request.js';
import type { MemoryErrorCode } from './errors.js';
import { isMemoryAdapterError } from './errors.js';
import type { Memory, MemoryAdapter, MemoryTarget } from './types.js';

export type MemoryErrorTrigger = (target: MemoryTarget) => Promise<unknown>;

export type TestMemoryAdapterOptions = {
  /** A request from a FrogBot instance booted with this adapter. */
  req: FrogBotRequest;
  /** Calls that must fail with each code this adapter can produce. `not-found` is always checked. */
  errors?: Partial<Record<Exclude<MemoryErrorCode, 'not-found'>, MemoryErrorTrigger>>;
};

function fail(name: string, message: string): never {
  throw new Error(`[testMemoryAdapter] ${name}: ${message}`);
}

function check(name: string, condition: boolean, message: string): void {
  if (!condition) fail(name, message);
}

async function expectCode(name: string, code: MemoryErrorCode, run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    if (isMemoryAdapterError(error) && error.code === code) return;

    fail(name, `expected MemoryAdapterError '${code}', got ${String(error)}`);
  }

  fail(name, `expected MemoryAdapterError '${code}', but the call succeeded`);
}

function has(memories: readonly Memory[], id: string): boolean {
  return memories.some((memory) => memory.id === id);
}

async function roundTrip(adapter: MemoryAdapter, target: MemoryTarget): Promise<string> {
  const name = 'round trip';
  const saved = await adapter.save({ ...target, text: 'The client prefers email' });

  check(name, typeof saved.id === 'string' && saved.id !== '', '`save` must return a string id');
  check(name, saved.scope === target.scope, '`save` must return the scope word');
  check(name, saved.text === 'The client prefers email', '`save` must return the text');
  check(name, saved.pinned === false, 'a new memory must not be pinned');
  check(name, typeof saved.createdAt === 'string', '`save` must return `createdAt`');

  const got = await adapter.get({ ...target, id: saved.id });

  check(name, got.text === saved.text, '`get` must return the saved memory');

  const { docs } = await adapter.list({ ...target, limit: 100, page: 1 });

  check(name, has(docs, saved.id), '`list` must include the saved memory');

  const hits = await adapter.search({ ...target, query: 'email', limit: 10 });

  check(
    name,
    has(
      hits.map(({ memory }) => memory),
      saved.id,
    ),
    '`search` must find the saved memory by a word in it',
  );

  const updated = await adapter.update({
    ...target,
    id: saved.id,
    text: 'The client prefers phone calls',
    pinned: true,
  });

  check(name, updated.id === saved.id, '`update` must keep the id');
  check(name, updated.text === 'The client prefers phone calls', '`update` must change the text');
  check(name, updated.pinned, '`update` must change `pinned`');

  const { docs: pinned } = await adapter.list({ ...target, pinned: true, limit: 100, page: 1 });

  check(name, has(pinned, saved.id), '`list` with `pinned: true` must include pinned memories');

  const { deleted } = await adapter.forget({ ...target, id: saved.id });

  check(name, deleted === 1, '`forget` with an id must report 1 deleted');

  await expectCode(name, 'not-found', () => adapter.get({ ...target, id: saved.id }));

  return saved.id;
}

async function upsertByKey(adapter: MemoryAdapter, target: MemoryTarget): Promise<void> {
  const name = 'upsert by key';
  const first = await adapter.save({ ...target, key: 'tone', text: 'Write formally' });
  const second = await adapter.save({ ...target, key: 'tone', text: 'Write casually' });

  check(name, second.id === first.id, 'a save with the same key must update the same memory');
  check(name, second.text === 'Write casually', 'a save with the same key must replace the text');
  check(name, second.key === 'tone', 'the memory must keep its key');

  const { docs } = await adapter.list({ ...target, limit: 100, page: 1 });

  check(
    name,
    docs.filter(({ key }) => key === 'tone').length === 1,
    'only one memory may hold a key in a scope',
  );
}

async function isolation(
  adapter: MemoryAdapter,
  target: MemoryTarget,
  other: MemoryTarget,
  name: string,
): Promise<void> {
  const memory = await adapter.save({ ...other, text: `Kept apart by ${name}` });
  const { docs } = await adapter.list({ ...target, limit: 100, page: 1 });
  const hits = await adapter.search({ ...target, query: 'apart', limit: 10 });

  check(name, !has(docs, memory.id), '`list` must not show another scope or namespace');

  check(
    name,
    !has(
      hits.map((hit) => hit.memory),
      memory.id,
    ),
    '`search` must not reach another scope or namespace',
  );

  await expectCode(name, 'not-found', () => adapter.get({ ...target, id: memory.id }));

  await expectCode(name, 'not-found', () =>
    adapter.update({ ...target, id: memory.id, text: 'Moved' }),
  );

  await expectCode(name, 'not-found', () => adapter.forget({ ...target, id: memory.id }));

  await adapter.forget(target);

  const kept = await adapter.get({ ...other, id: memory.id });

  check(name, kept.id === memory.id, 'forgetting a scope must not remove another one');
}

/** Runs the same cases against any memory adapter, and throws on the first one that fails. */
export async function testMemoryAdapter(
  adapter: MemoryAdapter,
  { errors = {}, req }: TestMemoryAdapterOptions,
): Promise<void> {
  const namespace = `memory-test-${randomUUID()}`;
  const target: MemoryTarget = { req, namespace, scope: 'team', scopeId: 'team' };
  const scope: MemoryTarget = { req, namespace, scope: 'client', scopeId: 'client:other' };
  const space: MemoryTarget = { ...target, namespace: `${namespace}-other` };

  await adapter.init?.({ frogbot: req.frogbot });

  try {
    const gone = await roundTrip(adapter, target);

    await expectCode('not-found', 'not-found', () =>
      adapter.update({ ...target, id: gone, text: 'Missing' }),
    );

    await expectCode('not-found', 'not-found', () => adapter.forget({ ...target, id: gone }));

    await upsertByKey(adapter, target);
    await isolation(adapter, target, scope, 'scope isolation');
    await isolation(adapter, target, space, 'namespace isolation');

    for (const [code, trigger] of Object.entries(errors)) {
      await expectCode(code, code as MemoryErrorCode, () => trigger(target));
    }

    await adapter.afterTurn?.({
      req,
      namespace,
      scopes: [{ scope: target.scope, scopeId: target.scopeId }],
      messages: [{ role: 'user', content: 'Remember that I like tea.' }],
    });
  } finally {
    for (const each of [target, scope, space]) await adapter.forget(each);
  }
}
