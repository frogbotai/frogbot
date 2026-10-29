import { KeyLimitsFields } from './client/KeyLimitsFields.js';
import { budgetDescription, modelsDescription, ownerTitle } from './keys.js';
import { readPolicy } from './policy.js';

type OwnerDocument = Record<string, unknown> & { id?: number | string };

type DescriptionProps = {
  authCollection: string;
  data?: { owner?: unknown };
  payload: {
    findByID: (args: {
      collection: string;
      id: number | string;
      depth: number;
      overrideAccess: boolean;
    }) => Promise<unknown>;
  };
  titleField?: string;
};

async function findOwner({ authCollection, data, payload }: DescriptionProps) {
  const owner = data?.owner;
  const id = owner && typeof owner === 'object' ? (owner as { id?: unknown }).id : owner;

  if (typeof id !== 'string' && typeof id !== 'number') return undefined;

  return (await payload
    .findByID({ collection: authCollection, id, depth: 0, overrideAccess: true })
    .catch(() => undefined)) as OwnerDocument | undefined;
}

function Description({ path, text }: { path: string; text: string }) {
  return <div className={`field-description field-description-${path}`}>{text}</div>;
}

/** The key's model list description, naming its owner. */
export async function KeyModelsDescription(props: DescriptionProps) {
  const owner = await findOwner(props);
  const title = owner ? ownerTitle(owner, props.titleField) : 'the owner';

  return <Description path="models" text={modelsDescription(title)} />;
}

/** The key's monthly cap description: the owner's budget, or no cap. */
export async function KeyBudgetDescription(props: DescriptionProps) {
  const owner = await findOwner(props);
  const title = owner ? ownerTitle(owner, props.titleField) : 'the owner';
  const budget = owner ? readPolicy(owner).monthlyBudgetUSD : undefined;

  return <Description path="monthlyBudget" text={budgetDescription(title, budget)} />;
}

/** The API key create dialog's limit fields, offering the signed-in owner's models and budget. */
export function KeyLimitsCreateFields({
  models,
  titleField,
  user,
}: {
  models: string[];
  titleField?: string;
  user?: OwnerDocument | null;
}) {
  if (!user) return null;

  const policy = readPolicy(user);
  const owner = ownerTitle(user, titleField);

  return (
    <KeyLimitsFields
      budgetDescription={budgetDescription(owner, policy.monthlyBudgetUSD)}
      models={
        policy.models.length > 0 ? models.filter((model) => policy.models.includes(model)) : models
      }
      modelsDescription={modelsDescription(owner)}
    />
  );
}
