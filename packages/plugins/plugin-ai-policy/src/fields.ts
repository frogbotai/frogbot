import { type Field, moneyField } from 'frogbot';

import { SPEND_COUNTERS_SLUG } from './counters.js';

const names = new Set(['models', 'monthlyBudget', 'spendCounter', 'spendThisPeriodUSD']);

const spendNames = new Set(['spendCounter', 'spendThisPeriodUSD']);

type FieldHooks = { afterRead?: unknown[] } & Record<string, unknown>;

function keepSpendShape(field: Field, override: Field): Record<string, unknown> {
  const { type, virtual, relationTo } = field as Record<string, unknown>;
  const hooks = (field as { hooks?: FieldHooks }).hooks;
  const overrideHooks = (override as { hooks?: FieldHooks }).hooks;

  return {
    type,
    virtual,
    relationTo,
    hasMany: false,
    localized: false,
    ...(hooks && {
      hooks: {
        ...overrideHooks,
        afterRead: [...(hooks.afterRead ?? []), ...(overrideHooks?.afterRead ?? [])],
      },
    }),
  };
}

/** The link to the subject's spend counter, and this month's spend read through it. */
export function createSpendFields(custom?: Record<string, unknown>): Field[] {
  return [
    {
      name: 'spendCounter',
      type: 'relationship',
      relationTo: SPEND_COUNTERS_SLUG,
      access: { create: () => false, update: () => false },
      admin: { disabled: true },
      ...(custom && { custom }),
    },
    moneyField({
      name: 'spendThisPeriodUSD',
      label: 'Monthly Spend (USD)',
      virtual: 'spendCounter.amount',
      admin: { readOnly: true, position: 'sidebar' },
      hooks: { afterRead: [({ value }) => value ?? 0] },
      ...(custom && { custom }),
    }),
  ];
}

export function createPolicyFields(models: string[]): Field[] {
  return [
    {
      name: 'models',
      type: 'select',
      hasMany: true,
      options: models,
      admin: {
        className: 'frogbot-model-select',
        description: 'Leave empty to allow all models.',
      },
    },
    moneyField({ name: 'monthlyBudget', label: 'Monthly Budget (USD)', min: 0 }),
    ...createSpendFields(),
  ];
}

function mergeObject(key: 'access' | 'admin' | 'custom', field: Field, override: Field) {
  if (!(key in field) && !(key in override)) return {};

  return {
    [key]: {
      ...((key in field && (field as Record<string, unknown>)[key]) || {}),
      ...((key in override && (override as Record<string, unknown>)[key]) || {}),
    },
  };
}

/**
 * Puts the policy fields on `fields`, letting an app field of the same name override its parts.
 * The `models` options always come from the AI config, so an app can override their access
 * without repeating the model list.
 */
export function mergePolicyFields(fields: Field[], policy: Field[]): Field[] {
  const overrides = new Map(
    fields
      .filter((field) => 'name' in field && names.has(field.name))
      .map((field) => [(field as { name: string }).name, field]),
  );

  const merged = policy.map((field) => {
    const override = 'name' in field ? overrides.get(field.name) : undefined;

    if (!override) return field;

    return {
      ...field,
      ...override,
      ...mergeObject('admin', field, override),
      ...mergeObject('access', field, override),
      ...mergeObject('custom', field, override),
      ...('options' in field && { options: field.options }),
      ...('name' in field && spendNames.has(field.name) && keepSpendShape(field, override)),
    } as Field;
  });

  return [...fields.filter((field) => !('name' in field) || !names.has(field.name)), ...merged];
}
