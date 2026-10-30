import type { FrogBotConfig, FrogBotRequest, Plugin } from 'frogbot';
import { describe, expect, it, vi } from 'vitest';

import { buildConfig } from '../../../packages/frogbot/src/config/build.js';
import { aiPolicyPlugin } from '../../../packages/plugins/plugin-ai-policy/src/index.js';
import { apiKeysPlugin } from '../../../packages/plugins/plugin-api-keys/src/index.js';

type AnyField = Record<string, any>;

function base(plugins: Plugin[]): FrogBotConfig {
  return {
    secret: 'test',
    db: {} as FrogBotConfig['db'],
    collections: [
      {
        slug: 'users',
        auth: true,
        admin: { useAsTitle: 'name' },
        fields: [{ name: 'name', type: 'text' }],
      },
    ],
    ai: {
      providers: { openai: { apiKey: 'test' } },
      routers: { smart: { model: 'openai/gpt-4o' } },
    },
    plugins,
  };
}

async function apply(keysOptions?: Parameters<typeof apiKeysPlugin>[0]) {
  const keys = apiKeysPlugin(keysOptions);
  const policy = aiPolicyPlugin();

  return policy(await keys(base([keys, policy])));
}

function collection(config: FrogBotConfig, slug: string) {
  return config.collections.find((candidate) => candidate.slug === slug);
}

function field(config: FrogBotConfig, slug: string, name: string): AnyField {
  return collection(config, slug)?.fields.find(
    (candidate) => 'name' in candidate && candidate.name === name,
  ) as AnyField;
}

const owners: Record<string, Record<string, unknown>> = {
  1: { id: 1, name: 'Ada', models: ['openai/gpt-4o'], monthlyBudget: 50 },
  2: { id: 2, name: 'Bo', models: [] },
};

function request(user: Record<string, unknown> | null = null, context = {}): FrogBotRequest {
  return {
    context,
    user,
    t: (key: string) => key,
    frogbot: {
      findByID: vi.fn(({ id }: { id: number }) =>
        owners[id] ? Promise.resolve(owners[id]) : Promise.reject(new Error('not found')),
      ),
    },
  } as unknown as FrogBotRequest;
}

function validate(config: FrogBotConfig, name: string) {
  const { validate: run } = field(config, 'api-keys', name);

  return (value: unknown, previousValue: unknown, req = request(), owner: unknown = 1) =>
    run(value, { data: { owner }, previousValue, req });
}

describe('aiPolicyPlugin key limits', () => {
  it.each([
    ['before', (keys: Plugin, policy: Plugin) => [policy, keys]],
    ['after', (keys: Plugin, policy: Plugin) => [keys, policy]],
  ])('adds limit fields to API keys when listed %s the API keys plugin', async (_name, list) => {
    const built = await buildConfig(
      base(list(apiKeysPlugin({ collectionSlug: 'credentials' }), aiPolicyPlugin())),
    );

    const { collections } = await built._internal.payloadConfig;
    const names = (slug: string) =>
      collections
        .find((candidate) => candidate.slug === slug)
        ?.fields.flatMap((candidate) => ('name' in candidate ? [candidate.name] : []));

    expect(names('credentials')).toEqual(
      expect.arrayContaining(['models', 'monthlyBudget', 'spendThisPeriodUSD']),
    );
    expect(names('users')).toEqual(
      expect.arrayContaining(['models', 'monthlyBudget', 'spendThisPeriodUSD']),
    );
  });

  it('adds no key fields without the API keys plugin', async () => {
    const policy = aiPolicyPlugin();
    const result = await policy({
      ...base([policy]),
      collections: [...base([]).collections, { slug: 'api-keys', fields: [] }],
    });

    expect(collection(result, 'api-keys')?.fields).toEqual([]);
  });

  it('describes the fields, shows spend and cap after prefix and registers the create fields', async () => {
    const result = await apply();
    const keys = collection(result, 'api-keys');

    expect(field(result, 'api-keys', 'models')).toMatchObject({
      hasMany: true,
      admin: {
        className: 'frogbot-model-select',
        components: {
          Description: { path: '@frogbotai/plugin-ai-policy/rsc#KeyModelsDescription' },
        },
      },
    });
    expect(field(result, 'api-keys', 'monthlyBudget')).toMatchObject({
      label: 'Monthly Cap (USD)',
    });
    expect(field(result, 'api-keys', 'spendThisPeriodUSD')).toMatchObject({
      admin: { readOnly: true, position: 'sidebar' },
    });
    expect(field(result, 'api-keys', 'models')?.admin?.position).toBeUndefined();
    expect(field(result, 'api-keys', 'monthlyBudget')?.admin?.position).toBeUndefined();

    const list = keys?.admin?.views?.find((view) => view.type === 'list') as
      { defaultFields: string[] } | undefined;

    const prefix = list?.defaultFields.indexOf('prefix') ?? -1;

    expect(list?.defaultFields.slice(prefix, prefix + 3)).toEqual([
      'prefix',
      'spendThisPeriodUSD',
      'monthlyBudget',
    ]);
    expect(keys?.admin?.custom?.['plugin-api-keys']).toMatchObject({
      createFields: [{ path: '@frogbotai/plugin-ai-policy/rsc#KeyLimitsCreateFields' }],
    });
  });

  it('offers only the owner models in filterOptions', async () => {
    const result = await apply();
    const { filterOptions } = field(result, 'api-keys', 'models');
    const options = ['smart', 'openai/gpt-4o'];

    await expect(filterOptions({ data: { owner: 1 }, options, req: request() })).resolves.toEqual([
      'openai/gpt-4o',
    ]);
    await expect(filterOptions({ data: { owner: 2 }, options, req: request() })).resolves.toEqual(
      options,
    );
  });

  it('checks added models against the owner', async () => {
    const check = validate(await apply(), 'models');

    await expect(check(['smart'], [])).resolves.toBe(`"smart" isn't allowed for Ada.`);
    await expect(check(['openai/gpt-4o'], [])).resolves.toBe(true);
    await expect(check(['smart'], ['smart'])).resolves.toBe(true);
    await expect(check(['smart'], [], request(null, { apiKeyRotatedFrom: 9 }))).resolves.toBe(true);
    await expect(check(['nope'], [])).resolves.toBe('validation:invalidSelection');
    await expect(check(['smart'], [], request(), 2)).resolves.toBe(true);
  });

  it('refuses a models value that is not a list', async () => {
    const check = validate(await apply(), 'models');

    await expect(check('openai/gpt-4o', [])).resolves.toBe('validation:invalidSelection');
    await expect(check({ 0: 'openai/gpt-4o' }, [])).resolves.toBe('validation:invalidSelection');
    await expect(check('smart', ['smart'], request(null, { apiKeyRotatedFrom: 9 }))).resolves.toBe(
      'validation:invalidSelection',
    );
    await expect(check(undefined, [])).resolves.toBe(true);
    await expect(check(null, [])).resolves.toBe(true);
  });

  it('checks a changed cap against the owner budget', async () => {
    const check = validate(await apply(), 'monthlyBudget');

    await expect(check(60, undefined)).resolves.toBe(
      "Can't exceed Ada's monthly budget of $50.00.",
    );
    await expect(check(25, undefined)).resolves.toBe(true);
    await expect(check(60, 60)).resolves.toBe(true);
    await expect(check(60, undefined, request(), 2)).resolves.toBe(true);
  });

  it('refuses a cap that is not a finite number', async () => {
    const check = validate(await apply(), 'monthlyBudget');

    for (const value of [true, false, 'abc', Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(check(value, undefined)).resolves.toBe('validation:enterNumber');
    }

    await expect(check(Number.NaN, Number.NaN)).resolves.toBe('validation:enterNumber');
    await expect(check(undefined, undefined)).resolves.toBe(true);
    await expect(check(null, 25)).resolves.toBe(true);
  });

  it('refuses limit changes from an API key request', async () => {
    const result = await apply();
    const hook = collection(result, 'api-keys')?.hooks?.beforeValidate?.at(-1) as (
      args: Record<string, unknown>,
    ) => unknown;

    const keyUser = { id: 1, collection: 'users', apiKey: { id: 7, name: 'CI' } };
    const originalDoc = { models: ['openai/gpt-4o'], monthlyBudget: 25 };

    expect(() => hook({ data: { monthlyBudget: 40 }, originalDoc, req: request(keyUser) })).toThrow(
      "API keys can't change their own limits. Sign in to change them.",
    );
    expect(() => hook({ data: { models: [] }, originalDoc, req: request(keyUser) })).toThrow(
      "API keys can't change their own limits.",
    );
    expect(
      hook({ data: { monthlyBudget: 25, name: 'renamed' }, originalDoc, req: request(keyUser) }),
    ).toEqual({ monthlyBudget: 25, name: 'renamed' });
    expect(
      hook({
        data: { monthlyBudget: 40 },
        originalDoc,
        req: request({ id: 1, collection: 'users' }),
      }),
    ).toEqual({ monthlyBudget: 40 });
  });

  it('checks the key models and cap after the owner', async () => {
    const result = await apply();
    const generate = result.ai?.access?.generate;
    const beforeOperation = result.ai?.hooks?.beforeOperation?.[0];
    const user = (apiKey: Record<string, unknown>, own: Record<string, unknown> = {}) =>
      request({ id: 1, collection: 'users', ...own, apiKey: { id: 7, name: 'CI', ...apiKey } });

    await expect(
      generate?.({ req: user({ models: ['openai/gpt-4o'] }), model: 'smart' }),
    ).rejects.toMatchObject({
      message: 'Model "smart" is not allowed for API key "CI".',
      status: 403,
      code: 'model_not_allowed',
    });
    await expect(
      generate?.({ req: user({ models: ['openai/gpt-4o'] }), model: 'openai/gpt-4o' }),
    ).resolves.toBe(true);
    await expect(
      generate?.({
        req: user({ models: ['smart'] }, { models: ['openai/gpt-4o'] }),
        model: 'smart',
      }),
    ).rejects.toMatchObject({
      code: 'model_not_allowed',
      message: expect.not.stringContaining('API key'),
    });

    const run = (req: FrogBotRequest) => beforeOperation?.({ req } as never);

    expect(() => run(user({ monthlyBudget: 25, spendThisPeriodUSD: 25 }))).toThrow(
      expect.objectContaining({
        message: 'API key "CI" has used its monthly cap of $25.00.',
        status: 403,
        code: 'budget_exceeded',
      }),
    );
    expect(() =>
      run(
        user(
          { monthlyBudget: 100, spendThisPeriodUSD: 40 },
          { monthlyBudget: 50, spendThisPeriodUSD: 50 },
        ),
      ),
    ).toThrow('The configured budget has been exhausted.');
    expect(() => run(user({ monthlyBudget: 25, spendThisPeriodUSD: 10 }))).not.toThrow();
  });
});
