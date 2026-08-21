import { describe, expect, it, vi } from 'vitest';

import { createPolicyFields, mergePolicyFields } from './policyFields.js';
import {
  backfillAIUserPolicy,
  createPolicyHooks,
  enforcePolicy,
  isTargetAllowed,
  resolvePolicy,
} from './policy.js';

describe('AI user policy', () => {
  it('normalizes missing and legacy policy values', () => {
    expect(resolvePolicy(undefined)).toEqual({ models: { mode: 'all' }, spendThisPeriodUSD: 0 });
    expect(resolvePolicy({ models: ['router'], monthlyBudget: 5, spendThisPeriodUSD: 2 })).toEqual({
      models: { mode: 'selected', targets: ['router'] },
      monthlyBudgetUSD: 5,
      spendThisPeriodUSD: 2,
    });
  });

  it('authorizes exact selected targets', () => {
    const policy = resolvePolicy({ modelAccess: 'selected', models: ['router'] });
    expect(isTargetAllowed(policy, 'router')).toBe(true);
    expect(isTargetAllowed(policy, 'openai/gpt-4o')).toBe(false);
  });

  it('merges developer field overrides without losing core structure', () => {
    const update = () => false;
    const fields = mergePolicyFields(
      [
        { name: 'title', type: 'text' },
        {
          name: 'monthlyBudget',
          type: 'number',
          label: 'Limit',
          defaultValue: 25,
          access: { update },
          admin: { description: 'Per-user limit' },
        },
      ],
      createPolicyFields(['openai/gpt-4o']),
    );
    const budget = fields.find((field) => 'name' in field && field.name === 'monthlyBudget');
    const models = fields.find((field) => 'name' in field && field.name === 'models');
    expect(budget).toMatchObject({
      type: 'number',
      min: 0,
      label: 'Limit',
      defaultValue: 25,
      access: { update },
      admin: { description: 'Per-user limit' },
    });
    expect(models).toMatchObject({ type: 'select', hasMany: true, options: ['openai/gpt-4o'] });
    expect(typeof (models as { admin?: { condition?: unknown } }).admin?.condition).toBe(
      'function',
    );
    expect(fields).toHaveLength(5);
  });

  it('keeps only the spend integrity lock and allows overriding it', async () => {
    const base = createPolicyFields([]);
    for (const field of base.filter(
      (item) => 'name' in item && item.name !== 'spendThisPeriodUSD',
    )) {
      expect('access' in field ? field.access : undefined).toBeUndefined();
    }
    const open = () => true;
    const spend = mergePolicyFields(
      [
        {
          name: 'spendThisPeriodUSD',
          type: 'number',
          access: { update: open },
          admin: { readOnly: false },
        },
      ],
      base,
    ).find((field) => 'name' in field && field.name === 'spendThisPeriodUSD');
    expect(spend).toMatchObject({ access: { update: open }, admin: { readOnly: false } });
  });

  it.each(['session', 'api-key', 'oauth'])(
    'enforces the same exact target for %s users',
    (auth) => {
      const req = { user: { id: auth, modelAccess: 'selected', models: ['router'] } } as never;
      expect(enforcePolicy({ req, target: 'router' })).toMatchObject({
        models: { mode: 'selected', targets: ['router'] },
      });
      expect(() => enforcePolicy({ req, target: 'openai/gpt-4o' })).toThrowError(
        expect.objectContaining({ code: 'model_not_allowed' }),
      );
    },
  );

  it('checks budget boundaries and settles configured provider costs', async () => {
    const update = vi.fn();
    const req = {
      user: { id: 'user-1', monthlyBudget: 10, spendThisPeriodUSD: 9 },
      frogbot: {
        findByID: vi.fn().mockResolvedValue({ id: 'user-1', spendThisPeriodUSD: 1 }),
        update,
      },
    } as never;
    const hooks = createPolicyHooks({
      authCollection: 'users',
      providers: {
        custom: {
          type: 'openai-compatible',
          models: [{ id: 'priced', mode: 'chat', cost: { input: 2, output: 4 } }],
        },
      },
    });
    expect(() => hooks.beforeOperation({ req, context: {} })).not.toThrow();
    await hooks.afterOperation({
      req,
      model: 'custom/priced',
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000, totalTokens: 2_000_000 },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { spendThisPeriodUSD: 7 }, overrideAccess: true }),
    );
    (req as { user: { spendThisPeriodUSD: number } }).user.spendThisPeriodUSD = 10;
    expect(() => hooks.beforeOperation({ req, context: {} })).toThrowError(
      expect.objectContaining({ code: 'budget_exceeded' }),
    );
    update.mockClear();
    await hooks.afterOperation({
      req,
      model: 'custom/priced',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      error: new Error('failed'),
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('serializes concurrent spend settlement for one user', async () => {
    let spend = 0;
    const req = {
      user: { id: 'user-1' },
      frogbot: {
        findByID: vi.fn(async () => ({ id: 'user-1', spendThisPeriodUSD: spend })),
        update: vi.fn(async ({ data }) => {
          await Promise.resolve();
          spend = data.spendThisPeriodUSD;
        }),
      },
    } as never;
    const hooks = createPolicyHooks({
      authCollection: 'users',
      providers: {
        custom: {
          type: 'openai-compatible',
          models: [{ id: 'priced', mode: 'chat', cost: { input: 2 } }],
        },
      },
    });
    const usage = { inputTokens: 1_000_000, outputTokens: 0, totalTokens: 1_000_000 };
    await Promise.all([
      hooks.afterOperation({ req, model: 'custom/priced', usage }),
      hooks.afterOperation({ req, model: 'custom/priced', usage }),
    ]);
    expect(spend).toBe(4);
  });

  it('backfills legacy users and safely skips an empty result', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const api = {
      find: vi
        .fn()
        .mockResolvedValueOnce({
          docs: [
            { id: 'selected', models: ['router'], monthlyBudget: 5, spendThisPeriodUSD: 2 },
            { id: 'all', models: [], monthlyBudget: 8, spendThisPeriodUSD: 3 },
          ],
          hasNextPage: false,
        })
        .mockResolvedValueOnce({ docs: [], hasNextPage: false }),
      update,
    };
    await backfillAIUserPolicy({ api, authCollection: 'users' });
    expect(update.mock.calls).toEqual([
      [expect.objectContaining({ id: 'selected', data: { modelAccess: 'selected' } })],
      [expect.objectContaining({ id: 'all', data: { modelAccess: 'all' } })],
    ]);
    update.mockClear();
    await backfillAIUserPolicy({ api, authCollection: 'users' });
    expect(update).not.toHaveBeenCalled();
  });
});
