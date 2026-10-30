import { type Field, moneyField } from 'frogbot';

const names = new Set(['models', 'monthlyBudget', 'spendThisPeriodUSD']);

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
    moneyField({
      name: 'spendThisPeriodUSD',
      label: 'Monthly Spend (USD)',
      defaultValue: 0,
      access: { update: () => false },
      admin: { readOnly: true, position: 'sidebar' },
    }),
  ];
}

function mergeObject(key: 'access' | 'admin', field: Field, override: Field) {
  if (!(key in field) && !(key in override)) return {};

  return {
    [key]: {
      ...((key in field && (field as Record<string, unknown>)[key]) || {}),
      ...((key in override && (override as Record<string, unknown>)[key]) || {}),
    },
  };
}

/** Puts the policy fields on `fields`, letting an app field of the same name override its parts. */
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
    } as Field;
  });

  return [...fields.filter((field) => !('name' in field) || !names.has(field.name)), ...merged];
}
