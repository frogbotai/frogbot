import { canField } from '@frogbotai/plugin-roles';
import type { Field } from 'frogbot';

const manage = canField('budgets:manage');

function policyField(name: string, value: Field): Field {
  return {
    name,
    type: 'group',
    access: { update: manage },
    fields: [
      {
        name: 'mode',
        type: 'select',
        defaultValue: 'inherit',
        required: true,
        options: ['inherit', 'custom', 'unlimited'],
      },
      {
        ...value,
        name: 'value',
        admin: { ...value.admin, condition: (_, siblingData) => siblingData.mode === 'custom' },
      },
    ],
  } as Field;
}

export function createPolicyFields(includeState: boolean): Field[] {
  return [
    policyField('monthlyBudget', { name: 'value', type: 'number', min: 0 }),
    policyField('rpm', { name: 'value', type: 'number', min: 1 }),
    policyField('tpm', { name: 'value', type: 'number', min: 1 }),
    policyField('models', { name: 'value', type: 'json' }),
    {
      name: 'budgetBehavior',
      type: 'select',
      defaultValue: 'block',
      options: ['block', 'alert-only'],
      access: { update: manage },
    },
    ...(includeState
      ? [
          { name: 'spendThisPeriodUSD', type: 'number' as const, defaultValue: 0, access: { update: () => false }, admin: { readOnly: true } },
          { name: 'budgetPeriodStartedAt', type: 'date' as const, access: { update: () => false }, admin: { readOnly: true } },
          { name: 'budgetAlertsSent', type: 'json' as const, access: { update: () => false }, admin: { hidden: true } },
        ]
      : []),
  ];
}
