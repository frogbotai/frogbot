import { describe, expect, it, vi } from 'vitest';

import { SPEND_COUNTERS_SLUG } from '../../../packages/plugins/plugin-ai-policy/src/counters.js';
import { createPolicyHooks } from '../../../packages/plugins/plugin-ai-policy/src/hooks.js';

const providers = {
  custom: {
    type: 'openai-compatible',
    baseUrl: 'http://127.0.0.1/v1',
    models: [{ id: 'priced', mode: 'chat', cost: { input: 2, output: 4 } }],
  },
};

const million = { inputTokens: 1_000_000, outputTokens: 1_000_000, totalTokens: 2_000_000 };
const period = new Date().toISOString().slice(0, 7);

type Counter = { id: number; key: string; period: string; amount: number };

type Clause = Record<string, { equals?: unknown; not_equals?: unknown; in?: unknown[] }>;

function matches(counter: Counter, where: { and?: Clause[] } & Clause): boolean {
  return (where.and ?? [where]).every((clause) =>
    Object.entries(clause).every(([path, condition]) => {
      const value = counter[path as keyof Counter];

      if ('equals' in condition) return value === condition.equals;
      if ('not_equals' in condition) return value !== condition.not_equals;
      if ('in' in condition) return condition.in?.includes(value) ?? false;

      return true;
    }),
  );
}

function fakeDB(seed: Partial<Counter>[] = []) {
  const counters: Counter[] = seed.map((counter, index) => ({
    id: index + 1,
    key: '',
    period,
    amount: 0,
    ...counter,
  }));

  const updateOne = vi.fn(async ({ collection, where, data }: Record<string, never>) => {
    await Promise.resolve();

    if (collection !== SPEND_COUNTERS_SLUG) return null;

    const counter = counters.find((each) => matches(each, where));

    if (!counter) return null;

    const { amount, period: next } = data as { amount: number | { $inc: number }; period?: string };

    counter.amount = typeof amount === 'number' ? amount : counter.amount + amount.$inc;
    if (next) counter.period = next;

    return { ...counter };
  });

  const create = vi.fn(async ({ data }: { data: Omit<Counter, 'id'> }) => {
    await Promise.resolve();

    if (counters.some(({ key }) => key === data.key)) throw new Error('duplicate key');

    const counter = { ...data, id: counters.length + 1 };

    counters.push(counter);

    return { ...counter };
  });

  const find = vi.fn(async ({ where }: { where: { and: Clause[] } }) => {
    await Promise.resolve();

    return { docs: counters.filter((each) => matches(each, where)) };
  });

  return { counters, updateOne, create, find };
}

function request({
  db = fakeDB(),
  user = { id: 'user-1', collection: 'users' },
  transactionID,
}: {
  db?: ReturnType<typeof fakeDB>;
  user?: Record<string, unknown> | null;
  transactionID?: number;
} = {}) {
  const error = vi.fn();
  const update = vi.fn();

  return {
    db,
    error,
    update,
    req: {
      user,
      transactionID,
      frogbot: {
        config: { ai: { providers } },
        logger: { error },
        db: { updateOne: db.updateOne, create: db.create },
        find: db.find,
        update,
      },
    } as never,
  };
}

async function settle(
  hooks: ReturnType<typeof createPolicyHooks>,
  args: Record<string, unknown>,
): Promise<void> {
  await hooks.afterOperation({ model: 'custom/priced', usage: million, ...args } as never);
}

describe('plugin-ai-policy hooks', () => {
  it('adds the cost to the counter in one atomic statement, outside the caller transaction', async () => {
    const hooks = createPolicyHooks({ authCollection: 'users' });
    const { db, req, update } = request({ db: fakeDB([{ key: 'users:user-1', amount: 1 }]) });

    await settle(hooks, { req });

    expect(db.counters[0].amount).toBe(7);
    expect(db.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: SPEND_COUNTERS_SLUG,
        data: { amount: { $inc: 6 } },
        options: { atomic: true },
      }),
    );
    expect(db.updateOne.mock.calls.every(([args]) => !('req' in args))).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });

  it('never writes the user row except to link a counter', async () => {
    const hooks = createPolicyHooks({ authCollection: 'users' });
    const { db, req } = request({ db: fakeDB([{ key: 'users:user-1' }]) });

    await settle(hooks, { req });

    const userWrites = db.updateOne.mock.calls
      .map(([args]) => args as { collection: string; data: Record<string, unknown> })
      .filter(({ collection }) => collection === 'users');

    expect(userWrites.map(({ data }) => Object.keys(data).sort())).toEqual([
      ['spendCounter', 'updatedAt'],
    ]);
  });

  it('creates a missing counter and adds every parallel call exactly', async () => {
    const hooks = createPolicyHooks({ authCollection: 'users' });
    const { db, req } = request();
    const usage = { inputTokens: 1_000_000, outputTokens: 0, totalTokens: 1_000_000 };

    await Promise.all(Array.from({ length: 10 }, () => settle(hooks, { req, usage })));

    expect(db.counters).toHaveLength(1);
    expect(db.counters[0]).toMatchObject({ key: 'users:user-1', period, amount: 20 });
  });

  it('starts a new month from the call cost', async () => {
    const hooks = createPolicyHooks({ authCollection: 'users' });
    const { db, req } = request({
      db: fakeDB([{ key: 'users:user-1', period: '2000-01', amount: 99 }]),
    });

    await settle(hooks, { req });

    expect(db.counters[0]).toMatchObject({ period, amount: 6 });
  });

  it('skips failed, unpriced and user-less operations', async () => {
    const hooks = createPolicyHooks({ authCollection: 'users' });
    const { db, req } = request();

    await settle(hooks, { req, error: new Error('failed') });
    await settle(hooks, { req, usage: undefined });
    await settle(hooks, { req, model: 'custom/unknown' });
    await settle(hooks, { req: request({ user: null }).req });

    expect(db.updateOne).not.toHaveBeenCalled();
  });

  it('skips users of another auth collection with the same id', async () => {
    const hooks = createPolicyHooks({ authCollection: 'users' });
    const { db, req } = request({ user: { id: 'user-1', collection: 'customers' } });

    await settle(hooks, { req });

    expect(db.updateOne).not.toHaveBeenCalled();
  });

  it("doesn't wait for the spend write when the caller holds a transaction", async () => {
    const hooks = createPolicyHooks({ authCollection: 'users' });
    const db = fakeDB([{ key: 'users:user-1' }]);
    let release = () => {};

    db.updateOne.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(null);
        }),
    );

    const { req } = request({ db, transactionID: 1 });

    await expect(settle(hooks, { req })).resolves.toBeUndefined();

    release();
  });

  it('logs a failed spend write without failing the operation', async () => {
    const hooks = createPolicyHooks({ authCollection: 'users' });
    const db = fakeDB();

    db.updateOne.mockRejectedValue(new Error('locked'));

    const { req, error } = request({ db });

    await expect(settle(hooks, { req })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'custom/priced' }),
      '[plugin-ai-policy] Failed to record spend',
    );
  });

  it('checks the budget against the counter, not the signed-in user', async () => {
    const hooks = createPolicyHooks({ authCollection: 'users' });
    const user = { id: 'user-1', collection: 'users', monthlyBudget: 5, spendThisPeriodUSD: 0 };
    const { req } = request({ db: fakeDB([{ key: 'users:user-1', amount: 5 }]), user });

    await expect(hooks.beforeOperation({ req } as never)).rejects.toMatchObject({
      code: 'budget_exceeded',
    });
  });

  it('refuses the call when the counters cannot be read', async () => {
    const hooks = createPolicyHooks({ authCollection: 'users' });
    const db = fakeDB();

    db.find.mockRejectedValue(new Error('database down'));

    const { req } = request({ db, user: { id: 'user-1', collection: 'users', monthlyBudget: 5 } });

    await expect(hooks.beforeOperation({ req } as never)).rejects.toThrow('database down');
  });
});
