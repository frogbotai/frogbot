import {
  APIError,
  type CollectionBeforeValidateHook,
  type CollectionConfig,
  type CollectionView,
  type Field,
  type FrogBotRequest,
  moneyField,
  type Validate,
} from 'frogbot';

import { mergePolicyFields } from './fields.js';
import { formatUSD, policyKey, readPolicy } from './policy.js';

export type KeyLimitsOptions = {
  authCollection: string;
  /** The owner field shown in messages: the auth collection's `useAsTitle`, then `email`. */
  titleField?: string;
  models: string[];
};

type OwnerDocument = Record<string, unknown> & { id?: number | string };

const rsc = '@frogbotai/plugin-ai-policy/rsc';

export const keyLimitsCreateFields = `${rsc}#KeyLimitsCreateFields`;

export function ownerTitle(owner: OwnerDocument, titleField?: string): string {
  const title = titleField && titleField !== 'id' ? owner[titleField] : undefined;

  if (typeof title === 'string' && title) return title;
  if (typeof owner.email === 'string' && owner.email) return owner.email;

  return `user ${String(owner.id)}`;
}

export function modelsDescription(owner: string): string {
  return `Leave empty to use all of ${owner}'s models.`;
}

export function budgetDescription(owner: string, budget: number | undefined): string {
  return budget === undefined
    ? 'Leave empty for no cap.'
    : `Up to ${formatUSD(budget)}, ${owner}'s monthly budget.`;
}

function ownerID(data: unknown): number | string | undefined {
  const owner = (data as { owner?: unknown } | undefined)?.owner;
  const id = owner && typeof owner === 'object' ? (owner as { id?: unknown }).id : owner;

  return typeof id === 'string' || typeof id === 'number' ? id : undefined;
}

async function loadOwner(
  req: FrogBotRequest,
  authCollection: string,
  data: unknown,
): Promise<OwnerDocument | undefined> {
  const id = ownerID(data);

  if (id === undefined) return undefined;

  return await req.frogbot
    .findByID({ collection: authCollection, id, depth: 0, overrideAccess: true, req })
    .catch(() => undefined);
}

const isRotation = (req: FrogBotRequest) => req.context?.apiKeyRotatedFrom !== undefined;

const toList = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function createModelsValidate({ authCollection, titleField, models }: KeyLimitsOptions): Validate {
  return async (value, { data, previousValue, req }) => {
    if (value !== undefined && value !== null && !Array.isArray(value)) {
      return req.t('validation:invalidSelection');
    }

    const previous = toList(previousValue);
    const added = toList(value).filter((model) => !previous.includes(model));

    if (added.length === 0 || isRotation(req)) return true;

    if (added.some((model) => typeof model !== 'string' || !models.includes(model))) {
      return req.t('validation:invalidSelection');
    }

    const owner = await loadOwner(req, authCollection, data);
    const allowed = owner ? readPolicy(owner).models : [];
    const denied = allowed.length > 0 && added.find((model) => !allowed.includes(model as string));

    return denied && owner
      ? `"${String(denied)}" isn't allowed for ${ownerTitle(owner, titleField)}.`
      : true;
  };
}

function createBudgetValidate({ authCollection, titleField }: KeyLimitsOptions): Validate {
  return async (value, { data, previousValue, req }) => {
    if (value === undefined || value === null) return true;

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return req.t('validation:enterNumber');
    }

    if (value === previousValue || isRotation(req)) return true;

    if (value < 0) {
      return req.t('validation:lessThanMin', { label: 'Monthly Cap (USD)', min: 0, value });
    }

    const owner = await loadOwner(req, authCollection, data);
    const budget = owner ? readPolicy(owner).monthlyBudgetUSD : undefined;

    if (!owner || budget === undefined || value <= budget) return true;

    return `Can't exceed ${ownerTitle(owner, titleField)}'s monthly budget of ${formatUSD(budget)}.`;
  };
}

export function createKeyLimitFields(options: KeyLimitsOptions): Field[] {
  const { authCollection, titleField, models } = options;
  const serverProps = { authCollection, titleField };

  return [
    {
      name: 'models',
      type: 'select',
      hasMany: true,
      options: models,
      validate: createModelsValidate(options),
      filterOptions: async ({ data, options: choices, req }) => {
        const owner = await loadOwner(req, authCollection, data);
        const allowed = owner ? readPolicy(owner).models : [];

        return allowed.length === 0
          ? choices
          : choices.filter((choice) =>
              allowed.includes(typeof choice === 'string' ? choice : choice.value),
            );
      },
      admin: {
        className: 'frogbot-model-select',
        components: { Description: { path: `${rsc}#KeyModelsDescription`, serverProps } },
      },
    },
    moneyField({
      name: 'monthlyBudget',
      label: 'Monthly Cap (USD)',
      min: 0,
      validate: createBudgetValidate(options),
      admin: {
        components: { Description: { path: `${rsc}#KeyBudgetDescription`, serverProps } },
      },
    }),
    moneyField({
      name: 'spendThisPeriodUSD',
      label: 'Monthly Spend (USD)',
      defaultValue: 0,
      access: { update: () => false },
      admin: { readOnly: true },
      hooks: {
        beforeChange: [
          ({ operation, req, value }) =>
            operation === 'create' && !isRotation(req) ? 0 : (value as unknown),
        ],
      },
    }),
  ];
}

const sameList = (a: unknown, b: unknown) => {
  const left = toList(a);
  const right = toList(b);

  return left.length === right.length && left.every((item) => right.includes(item));
};

/** D2: a request made with an API key can't change any key's limits. */
export const keyLimitsBeforeValidate: CollectionBeforeValidateHook = ({
  data,
  originalDoc,
  req,
}) => {
  if (!data || !policyKey(req.user)) return data;

  const original = (originalDoc ?? {}) as Record<string, unknown>;
  const changed =
    ('models' in data && !sameList(data.models, original.models)) ||
    ('monthlyBudget' in data && (data.monthlyBudget ?? null) !== (original.monthlyBudget ?? null));

  if (changed) {
    throw new APIError("API keys can't change their own limits. Sign in to change them.", 403);
  }

  return data;
};

function withLimitColumns(views: CollectionView[] | undefined): CollectionView[] | undefined {
  return views?.map((view) => {
    if (view.type !== 'list' || !view.defaultFields?.includes('prefix')) return view;

    const fields = view.defaultFields.filter(
      (name) => name !== 'spendThisPeriodUSD' && name !== 'monthlyBudget',
    );

    fields.splice(fields.indexOf('prefix') + 1, 0, 'spendThisPeriodUSD', 'monthlyBudget');

    return { ...view, defaultFields: fields };
  });
}

/** Adds key limit fields, the D2 hook, the create-dialog fields and list columns to the keys collection. */
export function withKeyLimits(
  collection: CollectionConfig,
  fields: Field[],
  createFieldsProps: Record<string, unknown>,
): CollectionConfig {
  const custom = (collection.admin?.custom ?? {}) as Record<string, unknown>;
  const slot = (custom['plugin-api-keys'] ?? {}) as { createFields?: unknown[] };

  return {
    ...collection,
    fields: mergePolicyFields(collection.fields, fields),
    hooks: {
      ...collection.hooks,
      beforeValidate: [...(collection.hooks?.beforeValidate ?? []), keyLimitsBeforeValidate],
    },
    admin: {
      ...collection.admin,
      views: withLimitColumns(collection.admin?.views),
      custom: {
        ...custom,
        'plugin-api-keys': {
          ...slot,
          createFields: [
            ...(slot.createFields ?? []),
            { path: keyLimitsCreateFields, serverProps: createFieldsProps },
          ],
        },
      },
    },
  };
}
