import type { Field } from '../fields/config/types.js';

const names = new Set(['modelAccess', 'models', 'monthlyBudget', 'spendThisPeriodUSD']);

export function createPolicyFields(targets: string[]): Field[] {
  return [
    {
      name: 'modelAccess',
      type: 'radio',
      defaultValue: 'all',
      options: [
        { label: 'All models', value: 'all' },
        { label: 'Selected models', value: 'selected' },
      ],
    },
    {
      name: 'models',
      type: 'select',
      hasMany: true,
      options: targets,
      admin: { condition: (_, siblingData) => siblingData?.modelAccess === 'selected' },
      validate: (value, { siblingData }) =>
        siblingData?.modelAccess !== 'selected' || (Array.isArray(value) && value.length > 0)
          ? true
          : 'Select at least one model or router.',
    },
    { name: 'monthlyBudget', label: 'Monthly Budget (USD)', type: 'number', min: 0 },
    {
      name: 'spendThisPeriodUSD',
      label: 'Monthly Spend (USD)',
      type: 'number',
      defaultValue: 0,
      access: { update: () => false },
      admin: { readOnly: true },
    },
  ];
}

export function mergePolicyFields(fields: Field[], base: Field[]): Field[] {
  const overrides = new Map(
    fields
      .filter((field) => 'name' in field && names.has(field.name))
      .map((field) => [(field as { name: string }).name, field]),
  );
  const policy = base.map((field) => {
    if (!('name' in field)) return field;
    const override = overrides.get(field.name);
    if (!override) return field;
    return {
      ...field,
      ...override,
      ...('admin' in field || 'admin' in override
        ? {
            admin: {
              ...(('admin' in field && field.admin) || {}),
              ...(('admin' in override && override.admin) || {}),
            },
          }
        : {}),
      ...('access' in field || 'access' in override
        ? {
            access: {
              ...(('access' in field && field.access) || {}),
              ...(('access' in override && override.access) || {}),
            },
          }
        : {}),
    } as Field;
  });
  return [...fields.filter((field) => !('name' in field) || !names.has(field.name)), ...policy];
}
