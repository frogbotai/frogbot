import type { Field, FieldAccess } from 'frogbot';

const manage: FieldAccess = ({ doc, req }) => {
  if (!req.user) return false;
  const roles = (req.user as { roles?: unknown }).roles;
  if (Array.isArray(roles) && roles.some((role) => role === 'admin' || (typeof role === 'object' && role !== null && 'slug' in role && role.slug === 'admin'))) return true;
  const owner = (doc as { owner?: unknown } | undefined)?.owner;
  const ownerId = owner && typeof owner === 'object' && 'id' in owner ? owner.id : owner;
  return ownerId !== undefined && req.user.id !== undefined && ownerId === req.user.id;
};

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
