import { BudgetExceededError, GatewayError, ModelNotAllowedError } from '@frogbotai/gateway/errors';
import { formatMoney } from 'frogbot/fields';

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

/** The key document the API keys plugin puts on `req.user.apiKey`. */
export type PolicyKey = { id: number | string; name?: unknown } & PolicyDocument;

export function policyKey(user: unknown): PolicyKey | undefined {
  const key = (user as { apiKey?: unknown } | null | undefined)?.apiKey;

  if (!key || typeof key !== 'object') return undefined;

  const id = (key as { id?: unknown }).id;

  return typeof id === 'string' || typeof id === 'number' ? (key as PolicyKey) : undefined;
}

function keyName(key: PolicyKey): string {
  return typeof key.name === 'string' ? key.name : String(key.id);
}

export function formatUSD(value: number): string {
  return formatMoney({ value, precision: 2 });
}

export function assertKeyModelAllowed(key: PolicyKey, model: string): void {
  if (!model || isModelAllowed(readPolicy(key), model)) return;

  throw new GatewayError({
    message: `Model "${model}" is not allowed for API key "${keyName(key)}".`,
    status: 403,
    code: 'model_not_allowed',
    param: 'model',
  });
}

export function assertKeyBudget(key: PolicyKey): void {
  const { monthlyBudgetUSD: cap, spendThisPeriodUSD: spend } = readPolicy(key);

  if (cap === undefined || spend < cap) return;

  throw new GatewayError({
    message: `API key "${keyName(key)}" has used its monthly cap of ${formatUSD(cap)}.`,
    status: 403,
    code: 'budget_exceeded',
  });
}
