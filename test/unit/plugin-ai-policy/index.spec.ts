import type { FrogBotConfig, FrogBotRequest } from 'frogbot';
import { describe, expect, it, vi } from 'vitest';

import { aiPolicyPlugin } from '../../../packages/plugins/plugin-ai-policy/src/index.js';

type Field = FrogBotConfig['collections'][number]['fields'][number];

function config(overrides: Partial<FrogBotConfig> = {}): FrogBotConfig {
  return {
    secret: 'test',
    db: {} as FrogBotConfig['db'],
    collections: [{ slug: 'users', auth: true, fields: [{ name: 'title', type: 'text' }] }],
    ai: {
      providers: { openai: true },
      routers: { smart: { model: 'openai/gpt-4o' } },
    },
    ...overrides,
  };
}

async function apply(input: FrogBotConfig, options?: Parameters<typeof aiPolicyPlugin>[0]) {
  return aiPolicyPlugin(options)(input);
}

function field(result: FrogBotConfig, slug: string, name: string) {
  return result.collections
    .find((collection) => collection.slug === slug)
    ?.fields.find((candidate) => 'name' in candidate && candidate.name === name) as
    (Field & Record<string, unknown>) | undefined;
}

function request(user: Record<string, unknown> | null): FrogBotRequest {
  return { user: user && { collection: 'users', ...user } } as unknown as FrogBotRequest;
}

describe('aiPolicyPlugin', () => {
  it('registers with its slug and order', () => {
    const plugin = aiPolicyPlugin();

    expect(plugin.slug).toBe('plugin-ai-policy');
    expect(plugin.order).toBe(10);
  });

  it('requires an ai config', async () => {
    await expect(apply(config({ ai: undefined }))).rejects.toThrow(
      '[plugin-ai-policy] AI configuration is required.',
    );
  });

  it('adds models, budget and spend fields to the auth collection', async () => {
    const result = await apply(config());

    expect(field(result, 'users', 'title')).toBeDefined();
    expect(field(result, 'users', 'modelAccess')).toBeUndefined();
    expect(field(result, 'users', 'models')).toMatchObject({
      type: 'select',
      hasMany: true,
      admin: {
        className: 'frogbot-model-select',
        description: 'Leave empty to allow all models.',
      },
    });
    expect(field(result, 'users', 'models')?.options).toEqual(
      expect.arrayContaining(['smart', 'openai/gpt-4o']),
    );
    expect(field(result, 'users', 'monthlyBudget')).toMatchObject({
      label: 'Monthly Budget (USD)',
      min: 0,
    });
    expect(field(result, 'users', 'spendThisPeriodUSD')).toMatchObject({
      defaultValue: 0,
      admin: { readOnly: true, position: 'sidebar' },
    });
  });

  it('adds an auth collection when the app has none', async () => {
    const result = await apply(config({ collections: [{ slug: 'posts', fields: [] }] }));
    const users = result.collections.find(({ slug }) => slug === 'users');

    expect(users).toMatchObject({
      auth: { tokenExpiration: 7200 },
      custom: { frogbot: { internal: true } },
    });
    expect(field(result, 'users', 'name')).toBeDefined();
    expect(field(result, 'users', 'models')).toBeDefined();
  });

  it('uses admin.user or the authCollection option when there are several auth collections', async () => {
    const collections = [
      { slug: 'users', auth: true, fields: [] },
      { slug: 'staff', auth: true, fields: [] },
    ];

    await expect(apply(config({ collections }))).rejects.toThrow('Set authCollection');

    const byAdmin = await apply(config({ collections, admin: { user: 'staff' } }));
    const byOption = await apply(config({ collections }), { authCollection: 'staff' });

    expect(field(byAdmin, 'staff', 'models')).toBeDefined();
    expect(field(byAdmin, 'users', 'models')).toBeUndefined();
    expect(field(byOption, 'staff', 'models')).toBeDefined();
  });

  it('merges app fields of the same name over the policy fields', async () => {
    const update = () => false;
    const open = () => true;
    const result = await apply(
      config({
        collections: [
          {
            slug: 'users',
            auth: true,
            fields: [
              {
                name: 'monthlyBudget',
                type: 'number',
                label: 'Limit',
                defaultValue: 25,
                access: { update },
                admin: { description: 'Per-user limit' },
              },
              {
                name: 'spendThisPeriodUSD',
                type: 'number',
                access: { update: open },
                admin: { readOnly: false, description: 'Spent this month' },
              },
            ],
          },
        ],
      }),
    );

    const names = result.collections[0].fields.map((candidate) =>
      'name' in candidate ? candidate.name : undefined,
    );

    expect(names.filter((name) => name === 'monthlyBudget')).toHaveLength(1);
    expect(field(result, 'users', 'monthlyBudget')).toMatchObject({
      type: 'number',
      min: 0,
      label: 'Limit',
      defaultValue: 25,
      access: { update },
      admin: { description: 'Per-user limit' },
    });
    expect(field(result, 'users', 'spendThisPeriodUSD')).toMatchObject({
      access: { update: open },
      admin: { readOnly: false, description: 'Spent this month', position: 'sidebar' },
    });
  });

  it.each([{ localized: true }, { hasMany: true }])(
    'refuses a spend override with %o, which moves spend off the main table',
    async (override) => {
      const users = {
        slug: 'users',
        auth: true,
        fields: [{ name: 'spendThisPeriodUSD', type: 'number', ...override } as Field],
      };

      await expect(apply(config({ collections: [users] }))).rejects.toThrow(
        "[plugin-ai-policy] spendThisPeriodUSD on 'users' can't be localized or hasMany",
      );
    },
  );

  it('refuses drafts on the auth collection, whose versions would keep a stale spend', async () => {
    const users = { slug: 'users', auth: true, versions: { drafts: true }, fields: [] };

    await expect(apply(config({ collections: [users] }))).rejects.toThrow(
      "[plugin-ai-policy] 'users' can't have drafts",
    );
  });

  it('accepts versions without drafts on the auth collection', async () => {
    const users = { slug: 'users', auth: true, versions: { drafts: false }, fields: [] };

    await expect(apply(config({ collections: [users] }))).resolves.toBeDefined();
  });

  it('wraps every access category, keeping the app rule and signed-in default', async () => {
    const generate = vi.fn(({ model }: { model: string }) => model !== 'openai/blocked');
    const result = await apply(
      config({ ai: { providers: { openai: true }, access: { generate } } }),
    );

    const access = result.ai!.access!;
    const user = request({ id: 'user-1' });

    await expect(access.generate!({ req: user, model: 'openai/gpt-4o' })).resolves.toBe(true);
    await expect(access.generate!({ req: user, model: 'openai/blocked' })).resolves.toBe(false);
    expect(generate).toHaveBeenCalledWith({ req: user, model: 'openai/gpt-4o' });

    for (const category of ['embed', 'transcribe', 'rerank', 'evaluate'] as const) {
      await expect(access[category]!({ req: user, model: 'm' })).resolves.toBe(true);
      await expect(access[category]!({ req: request(null), model: 'm' })).resolves.toBe(false);
    }
  });

  it('allows every model for an empty list and only listed ones otherwise', async () => {
    const { generate } = (await apply(config())).ai!.access!;

    await expect(
      generate!({ req: request({ id: 'u', models: [] }), model: 'openai/gpt-4o' }),
    ).resolves.toBe(true);
    await expect(
      generate!({ req: request({ id: 'u', models: ['smart'] }), model: 'smart' }),
    ).resolves.toBe(true);
    await expect(
      generate!({ req: request({ id: 'u', models: ['smart'] }), model: 'openai/gpt-4o' }),
    ).rejects.toMatchObject({
      status: 403,
      code: 'model_not_allowed',
      message: 'Model "openai/gpt-4o" is not allowed by this policy.',
    });
  });

  it('applies no policy to users of another auth collection', async () => {
    const result = await apply(
      config({
        collections: [
          { slug: 'users', auth: true, fields: [] },
          { slug: 'customers', auth: true, fields: [] },
        ],
      }),
      { authCollection: 'users' },
    );

    const customer = request({
      id: 'u',
      collection: 'customers',
      models: ['smart'],
      monthlyBudget: 10,
      spendThisPeriodUSD: 10,
    });

    const [policyHook] = result.ai!.hooks!.beforeOperation!;

    await expect(
      result.ai!.access!.generate!({ req: customer, model: 'openai/gpt-4o' }),
    ).resolves.toBe(true);
    await expect(policyHook({ req: customer } as never)).resolves.toBeUndefined();
  });

  it('rejects a spent budget before each operation, not at access', async () => {
    const result = await apply(
      config({
        ai: {
          providers: { openai: true },
          hooks: { beforeOperation: [vi.fn()], afterOperation: [vi.fn()] },
        },
      }),
    );

    const spent = request({ id: 'u', monthlyBudget: 10, spendThisPeriodUSD: 10 });
    const under = request({ id: 'u', monthlyBudget: 10, spendThisPeriodUSD: 9.99 });
    const [policyHook, appHook] = result.ai!.hooks!.beforeOperation!;
    const budgetError = {
      status: 403,
      code: 'budget_exceeded',
      message: 'The configured budget has been exhausted.',
    };

    await expect(result.ai!.access!.generate!({ req: spent, model: 'm' })).resolves.toBe(true);
    await expect(result.ai!.access!.generate!({ req: under, model: 'm' })).resolves.toBe(true);

    expect(appHook).not.toBe(policyHook);
    await expect(policyHook({ req: spent } as never)).rejects.toThrowError(
      expect.objectContaining(budgetError),
    );
    await expect(policyHook({ req: under } as never)).resolves.toBeUndefined();
    expect(result.ai!.hooks!.afterOperation).toHaveLength(2);
  });

  it('schedules a monthly spend reset that zeros the auth collection', async () => {
    const result = await apply(
      config({ jobs: { tasks: [{ slug: 'other', handler: () => ({ output: {} }) }] } }),
    );

    const task = result.jobs!.tasks!.find(({ slug }) => slug === 'plugin-ai-policy-reset-spend');
    const updateMany = vi.fn();
    const req = { frogbot: { db: { updateMany } } };

    expect(result.jobs!.tasks!.map(({ slug }) => slug)).toEqual([
      'other',
      'plugin-ai-policy-reset-spend',
    ]);
    expect(task?.schedule).toEqual([{ cron: '0 0 1 * *', queue: 'plugin-ai-policy-reset-spend' }]);

    await (task!.handler as (args: unknown) => Promise<unknown>)({ req });

    expect(updateMany).toHaveBeenCalledWith({
      collection: 'users',
      where: { id: { exists: true } },
      data: { spendThisPeriodUSD: 0 },
      req,
    });
  });
});
