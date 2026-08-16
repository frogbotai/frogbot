import type { Field } from 'frogbot';

export function createPolicyFields(modelIDs: string[]): Field[] {
  return [
    { name: 'monthlyBudget', label: 'Monthly Budget (USD)', type: 'number', min: 0 },
    { name: 'models', type: 'select', hasMany: true, options: modelIDs },
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
