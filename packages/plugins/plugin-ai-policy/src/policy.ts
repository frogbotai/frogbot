import { BudgetExceededError, ModelNotAllowedError } from '@frogbotai/gateway/errors';

/** The policy a user document holds: empty `models` allows every model, no budget means no limit. */
export type AIPolicy = {
  models: string[];
  monthlyBudgetUSD?: number;
  spendThisPeriodUSD: number;
};

type PolicyDocument = {
  models?: unknown;
  monthlyBudget?: unknown;
  spendThisPeriodUSD?: unknown;
};

export type PolicyUser = { id?: number | string; collection?: string } & PolicyDocument;

/** The signed-in user when it belongs to the policy's auth collection; other collections have no policy. */
export function policyUser(user: unknown, authCollection: string): PolicyUser | undefined {
  const candidate = user && typeof user === 'object' ? (user as PolicyUser) : undefined;

  return candidate?.collection === authCollection ? candidate : undefined;
}

export function readPolicy(doc: unknown): AIPolicy {
  const value = doc && typeof doc === 'object' ? (doc as PolicyDocument) : {};
  const models = Array.isArray(value.models)
    ? value.models.filter((model): model is string => typeof model === 'string')
    : [];

  return {
    models,
    ...(typeof value.monthlyBudget === 'number' && { monthlyBudgetUSD: value.monthlyBudget }),
    spendThisPeriodUSD: typeof value.spendThisPeriodUSD === 'number' ? value.spendThisPeriodUSD : 0,
  };
}

export function isModelAllowed(policy: AIPolicy, model: string): boolean {
  return policy.models.length === 0 || policy.models.includes(model);
}

export function isBudgetSpent(policy: AIPolicy): boolean {
  return (
    policy.monthlyBudgetUSD !== undefined && policy.spendThisPeriodUSD >= policy.monthlyBudgetUSD
  );
}

export function assertModelAllowed(policy: AIPolicy, model: string): void {
  if (model && !isModelAllowed(policy, model)) throw new ModelNotAllowedError(model);
}

export function assertBudget(policy: AIPolicy): void {
  if (isBudgetSpent(policy)) throw new BudgetExceededError();
}
