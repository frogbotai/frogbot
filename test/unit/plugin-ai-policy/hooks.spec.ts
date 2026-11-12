import { describe, expect, it, vi } from 'vitest';

import { createPolicyHooks } from '../../../packages/plugins/plugin-ai-policy/src/hooks.js';

const providers = {
  custom: {
    type: 'openai-compatible',
    baseUrl: 'http://127.0.0.1/v1',
    models: [{ id: 'priced', mode: 'chat', cost: { input: 2, output: 4 } }],
  },
};

const million = { inputTokens: 1_000_000, outputTokens: 1_000_000, totalTokens: 2_000_000 };

function request({
  updateOne = vi.fn(),
  user = { id: 'user-1', collection: 'users' },
}: {
  updateOne?: ReturnType<typeof vi.fn>;
  user?: Record<string, unknown> | null;
} = {}) {
  const error = vi.fn();

  return {
    error,
    updateOne,
    req: {
      user,
      frogbot: {
        config: { ai: { providers } },
        logger: { error },
        db: { updateOne },
      },
    } as never,
  };
}

function settle(hooks: ReturnType<typeof createPolicyHooks>, args: Record<string, unknown>) {
  return hooks.afterOperation({ model: 'custom/priced', usage: million, ...args } as never);
}

describe('plugin-ai-policy hooks', () => {
  it('adds the configured provider cost to the user spend in one atomic write, outside the caller transaction', async () => {
    const hooks = createPolicyHooks({ authCollection: 'users' });
    const { req, updateOne } = request();

    await settle(hooks, { req });

    expect(updateOne.mock.calls.map(([args]) => args)).toEqual([
      {
        collection: 'users',
        where: { and: [{ id: { equals: 'user-1' } }, { spendThisPeriodUSD: { equals: null } }] },
        data: { spendThisPeriodUSD: 0 },
        options: { atomic: true },
        returning: false,
      },
      {
        collection: 'users',
        id: 'user-1',
        data: { spendThisPeriodUSD: { $inc: 6 } },
        returning: false,
      },
    ]);
  });

  it('skips failed, unpriced and user-less operations', async () => {
    const hooks = createPolicyHooks({ authCollection: 'users' });
    const { req, updateOne } = request();

    await settle(hooks, { req, error: new Error('failed') });
    await settle(hooks, { req, usage: undefined });
    await settle(hooks, { req, model: 'custom/unknown' });
    await settle(hooks, { req: request({ user: null }).req });

    expect(updateOne).not.toHaveBeenCalled();
  });

  it('skips users of another auth collection with the same id', async () => {
    const hooks = createPolicyHooks({ authCollection: 'users' });
    const { req, updateOne } = request({ user: { id: 'user-1', collection: 'customers' } });

    await settle(hooks, { req });

    expect(updateOne).not.toHaveBeenCalled();
  });

  it('logs a failed spend write without failing the operation', async () => {
    const hooks = createPolicyHooks({ authCollection: 'users' });
    const { req, error } = request({ updateOne: vi.fn().mockRejectedValue(new Error('locked')) });

    await expect(settle(hooks, { req })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'custom/priced' }),
      '[plugin-ai-policy] Failed to record spend',
    );
  });
});
