import { type CollectionConfig, type Field, moneyField } from 'frogbot';

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

function mergeObject(key: 'access' | 'admin' | 'custom', field: Field, override: Field) {
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
      ...mergeObject('custom', field, override),
    } as Field;
  });

  return [...fields.filter((field) => !('name' in field) || !names.has(field.name)), ...merged];
}

/**
 * Throws when spend can't live in one column that one atomic `$inc` updates: an override that
 * moves it off the main table, or drafts, whose latest version keeps a stale spend that the next
 * update writes back.
 */
export function assertSpendColumn(collection: CollectionConfig): void {
  const { slug, fields, versions } = collection;
  const spend = fields.find((field) => 'name' in field && field.name === 'spendThisPeriodUSD');

  if (
    spend &&
    (('localized' in spend && spend.localized) || ('hasMany' in spend && spend.hasMany))
  ) {
    throw new Error(
      `[plugin-ai-policy] spendThisPeriodUSD on '${slug}' can't be localized or hasMany: spend is one column.`,
    );
  }

  if (typeof versions === 'object' && versions.drafts) {
    throw new Error(
      `[plugin-ai-policy] '${slug}' can't have drafts: a draft version would keep a stale spend.`,
    );
  }
}
