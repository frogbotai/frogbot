import type { Field, FieldAccess } from 'frogbot';

const deny: FieldAccess = () => false;

function policyField(name: string, value: Field, manage: FieldAccess): Field {
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

export function createPolicyFields(
  includeState: boolean,
  policyAccess: FieldAccess = deny,
): Field[] {
  return [
    policyField('monthlyBudget', { name: 'value', type: 'number', min: 0 }, policyAccess),
    policyField('rpm', { name: 'value', type: 'number', min: 1 }, policyAccess),
    policyField('tpm', { name: 'value', type: 'number', min: 1 }, policyAccess),
    policyField('models', { name: 'value', type: 'json' }, policyAccess),
    {
      name: 'budgetBehavior',
      type: 'select',
      defaultValue: 'block',
      options: ['block', 'alert-only'],
      access: { update: policyAccess },
    },
    ...(includeState
      ? [
          {
            name: 'spendThisPeriodUSD',
            type: 'number' as const,
            defaultValue: 0,
            access: { update: () => false },
            admin: { readOnly: true },
          },
          {
            name: 'budgetPeriodStartedAt',
            type: 'date' as const,
            access: { update: () => false },
            admin: { readOnly: true },
          },
          {
            name: 'budgetAlertsSent',
            type: 'json' as const,
            access: { update: () => false },
            admin: { hidden: true },
          },
        ]
      : []),
  ];
}
