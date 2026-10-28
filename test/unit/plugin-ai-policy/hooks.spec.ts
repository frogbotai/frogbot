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
  spend = () => 0,
  update = vi.fn(),
  user = { id: 'user-1', collection: 'users' },
}: {
  spend?: () => number;
  update?: ReturnType<typeof vi.fn>;
  user?: Record<string, unknown> | null;
} = {}) {
  const error = vi.fn();

  return {
    error,
    update,
    req: {
      user,
      frogbot: {
        config: { ai: { providers } },
        logger: { error },
        findByID: vi.fn(() => Promise.resolve({ id: 'user-1', spendThisPeriodUSD: spend() })),
        update,
      },
    } as never,
  };
}

function settle(hooks: ReturnType<typeof createPolicyHooks>, args: Record<string, unknown>) {
  return hooks.afterOperation({ model: 'custom/priced', usage: million, ...args } as never);
}

describe('plugin-ai-policy hooks', () => {
  it('adds the configured provider cost to the user spend', async () => {
    const hooks = createPolicyHooks({ authCollection: 'users' });
    const { req, update } = request({ spend: () => 1 });

    await settle(hooks, { req });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'users',
        id: 'user-1',
        data: { spendThisPeriodUSD: 7 },
        overrideAccess: true,
      }),
    );
  });

  it('skips failed, unpriced and user-less operations', async () => {
    const hooks = createPolicyHooks({ authCollection: 'users' });
    const { req, update } = request();

    await settle(hooks, { req, error: new Error('failed') });
    await settle(hooks, { req, usage: undefined });
    await settle(hooks, { req, model: 'custom/unknown' });
    await settle(hooks, { req: request({ user: null }).req });

    expect(update).not.toHaveBeenCalled();
  });

  it('skips users of another auth collection with the same id', async () => {
    const hooks = createPolicyHooks({ authCollection: 'users' });
    const { req, update } = request({ user: { id: 'user-1', collection: 'customers' } });

    await settle(hooks, { req });

    expect(update).not.toHaveBeenCalled();
  });

  it('serializes concurrent settlement for one user', async () => {
    let spend = 0;
    const update = vi.fn(async ({ data }: { data: { spendThisPeriodUSD: number } }) => {
      await Promise.resolve();
      spend = data.spendThisPeriodUSD;
    });

    const hooks = createPolicyHooks({ authCollection: 'users' });
    const { req } = request({ spend: () => spend, update });
    const usage = { inputTokens: 1_000_000, outputTokens: 0, totalTokens: 1_000_000 };

    await Promise.all([settle(hooks, { req, usage }), settle(hooks, { req, usage })]);

    expect(spend).toBe(4);
  });

  it('logs a failed spend write without failing the operation', async () => {
    const hooks = createPolicyHooks({ authCollection: 'users' });
    const { req, error } = request({ update: vi.fn().mockRejectedValue(new Error('locked')) });

    await expect(settle(hooks, { req })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'custom/priced' }),
      '[plugin-ai-policy] Failed to record spend',
    );
  });
});
