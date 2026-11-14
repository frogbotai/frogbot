import type { FrogBotConfig, FrogBotRequest } from 'frogbot';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

function request(user: Record<string, unknown> | null, spend = 0): FrogBotRequest {
  const find = vi.fn(() => Promise.resolve({ docs: [{ key: 'users:u', amount: spend }] }));

  return {
    user: user && { collection: 'users', ...user },
    frogbot: { find },
  } as unknown as FrogBotRequest;
}

describe('aiPolicyPlugin', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it('refuses an unknown time zone at config time', async () => {
    await expect(apply(config(), { timeZone: 'Not/AZone' })).rejects.toThrow(
      '[plugin-ai-policy] Unknown timeZone "Not/AZone"',
    );
  });

  it('resets counters on the calendar of the configured time zone', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-30T23:30:00Z'));

    const result = await apply(config(), { timeZone: 'Asia/Tokyo' });
    const task = result.jobs!.tasks!.find(({ slug }) => slug === 'plugin-ai-policy-reset-spend');
    const find = vi.fn(() => Promise.resolve({ docs: [{ id: 'c1' }] }));
    const updateOne = vi.fn();

    await (task!.handler as (args: unknown) => Promise<unknown>)({
      req: { frogbot: { find, db: { updateOne } } },
    });

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { period: { less_than: '2026-12' } } }),
    );
    expect(updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ data: { amount: 0, period: '2026-12' } }),
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
      virtual: 'spendCounter.amount',
      admin: { readOnly: true, position: 'sidebar' },
    });
    expect(field(result, 'users', 'spendCounter')).toMatchObject({
      type: 'relationship',
      relationTo: 'plugin-ai-policy-spend',
      admin: { disabled: true },
    });
    expect(result.collections.find(({ slug }) => slug === 'plugin-ai-policy-spend')).toMatchObject({
      admin: { hidden: true },
      versions: false,
    });
  });

  it('lets an override restyle the spend field but not move where spend is stored', async () => {
    const result = await apply(
      config({
        collections: [
          {
            slug: 'users',
            auth: true,
            fields: [
              {
                name: 'spendThisPeriodUSD',
                type: 'number',
                hasMany: true,
                localized: true,
                label: 'Spend',
              },
            ],
          },
        ],
      }),
    );

    expect(field(result, 'users', 'spendThisPeriodUSD')).toMatchObject({
      label: 'Spend',
      type: 'number',
      virtual: 'spendCounter.amount',
      hasMany: false,
      localized: false,
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

  it('keeps the configured model options when the app overrides the models field', async () => {
    const update = () => false;
    const result = await apply(
      config({
        collections: [
          {
            slug: 'users',
            auth: true,
            fields: [{ name: 'models', type: 'select', options: [], access: { update } }],
          },
        ],
      }),
    );

    expect(field(result, 'users', 'models')).toMatchObject({ hasMany: true, access: { update } });
    expect(field(result, 'users', 'models')?.options).toEqual(
      expect.arrayContaining(['openai/gpt-4o']),
    );
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

    const spent = request({ id: 'u', monthlyBudget: 10 }, 10);
    const under = request({ id: 'u', monthlyBudget: 10 }, 9.99);
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

  it('schedules an idempotent reset that zeros only older counters, each checked as it is written', async () => {
    const result = await apply(
      config({ jobs: { tasks: [{ slug: 'other', handler: () => ({ output: {} }) }] } }),
    );

    const task = result.jobs!.tasks!.find(({ slug }) => slug === 'plugin-ai-policy-reset-spend');
    const find = vi.fn(() => Promise.resolve({ docs: [{ id: 'c1' }, { id: 'c2' }] }));
    const updateOne = vi.fn();
    const req = { frogbot: { find, db: { updateOne } } };

    expect(result.jobs!.tasks!.map(({ slug }) => slug)).toEqual([
      'other',
      'plugin-ai-policy-reset-spend',
    ]);
    expect(task?.schedule).toEqual([
      { cron: '0 * 1,2,28-31 * *', queue: 'plugin-ai-policy-reset-spend' },
    ]);

    await (task!.handler as (args: unknown) => Promise<unknown>)({ req });

    const period = new Date().toISOString().slice(0, 7);
    const stale = { period: { less_than: period } };

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'plugin-ai-policy-spend', where: stale }),
    );
    expect(updateOne.mock.calls.map(([args]) => args)).toEqual(
      ['c1', 'c2'].map((id) => ({
        collection: 'plugin-ai-policy-spend',
        where: { and: [{ id: { equals: id } }, stale] },
        data: { amount: 0, period },
        options: { atomic: true },
        returning: false,
      })),
    );
  });
});
