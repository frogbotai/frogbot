import { calculateCostUSD, calculateModelCostUSD, type ModelCost } from '@frogbotai/gateway';
import { BudgetExceededError, ModelNotAllowedError } from '@frogbotai/gateway/errors';

import type { CustomProviderEntry } from './types.js';
import type { FrogbotRequest } from '../types/request.js';

export type AIUserPolicy = {
  models: { mode: 'all' } | { mode: 'selected'; targets: string[] };
  monthlyBudgetUSD?: number;
  spendThisPeriodUSD: number;
};

type PolicyDocument = {
  id?: number | string;
  modelAccess?: 'all' | 'selected';
  models?: string[];
  monthlyBudget?: number;
  spendThisPeriodUSD?: number;
};

type PolicyBackfillAPI = {
  find(args: Record<string, unknown>): Promise<{ docs: PolicyDocument[] }>;
  update(args: Record<string, unknown>): Promise<unknown>;
};

export function resolvePolicy(user: unknown): AIUserPolicy {
  const value = user && typeof user === 'object' ? (user as PolicyDocument) : {};
  const targets = Array.isArray(value.models)
    ? value.models.filter((target): target is string => typeof target === 'string')
    : [];
  const selected = value.modelAccess === 'selected' || (!value.modelAccess && targets.length > 0);
  return {
    models: selected ? { mode: 'selected', targets } : { mode: 'all' },
    ...(typeof value.monthlyBudget === 'number' && { monthlyBudgetUSD: value.monthlyBudget }),
    spendThisPeriodUSD: typeof value.spendThisPeriodUSD === 'number' ? value.spendThisPeriodUSD : 0,
  };
}

export function isTargetAllowed(policy: AIUserPolicy, target: string): boolean {
  return policy.models.mode === 'all' || policy.models.targets.includes(target);
}

export async function backfillAIUserPolicy({
  api,
  authCollection,
}: {
  api: PolicyBackfillAPI;
  authCollection: string;
}): Promise<void> {
  let hasMore = true;
  while (hasMore) {
    const result = await api.find({
      collection: authCollection,
      where: { modelAccess: { exists: false } },
      depth: 0,
      limit: 100,
      overrideAccess: true,
    });
    for (const user of result.docs) {
      if (user.id === undefined) continue;
      await api.update({
        collection: authCollection,
        id: user.id,
        data: { modelAccess: user.models?.length ? 'selected' : 'all' },
        overrideAccess: true,
      });
    }
    hasMore = result.docs.length === 100;
  }
}

export function enforcePolicy({
  req,
  target,
}: {
  req?: FrogbotRequest;
  target: string;
}): AIUserPolicy | undefined {
  if (!req?.user) return;
  const policy = resolvePolicy(req.user);
  if (!isTargetAllowed(policy, target)) throw new ModelNotAllowedError(target);
  if (
    policy.monthlyBudgetUSD !== undefined &&
    policy.spendThisPeriodUSD >= policy.monthlyBudgetUSD
  ) {
    throw new BudgetExceededError();
  }
  return policy;
}

class SerialQueue {
  private readonly updates = new Map<string, Promise<void>>();

  run(subject: string, update: () => Promise<void>): Promise<void> {
    const next = (this.updates.get(subject) ?? Promise.resolve()).then(update, update);
    let owner: Promise<void>;
    const release = () => {
      if (this.updates.get(subject) === owner) this.updates.delete(subject);
    };
    owner = next.then(release, release);
    this.updates.set(subject, owner);
    return next;
  }
}

export function createPolicyHooks({
  authCollection,
  providers,
}: {
  authCollection: string;
  providers: Record<string, unknown>;
}) {
  const queue = new SerialQueue();
  const costs = new Map<string, ModelCost>();
  for (const [provider, entry] of Object.entries(providers)) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      !('type' in entry) ||
      entry.type !== 'openai-compatible'
    ) {
      continue;
    }
    for (const model of (entry as CustomProviderEntry).models) {
      if (!model.cost) continue;
      costs.set(`${provider}/${model.id}`, {
        input: model.cost.input ?? 0,
        output: model.cost.output ?? 0,
        ...(model.cost.cache_read !== undefined && { cache_read: model.cost.cache_read }),
      });
    }
  }
  return {
    beforeOperation: (args: { req?: FrogbotRequest; context: Record<string, unknown> }) => {
      if (!args.req?.user) return;
      const policy = resolvePolicy(args.req.user);
      if (
        policy.monthlyBudgetUSD !== undefined &&
        policy.spendThisPeriodUSD >= policy.monthlyBudgetUSD
      ) {
        throw new BudgetExceededError();
      }
      if (policy) args.context.policy = policy;
    },
    afterOperation: async (args: {
      req?: FrogbotRequest;
      model: string;
      usage?: Parameters<typeof calculateModelCostUSD>[1];
      error?: unknown;
    }) => {
      if (!args.req?.user || args.error || !args.usage) return;
      const user = args.req.user as PolicyDocument;
      if (user.id === undefined) return;
      const configured = costs.get(args.model);
      const cost = configured
        ? calculateCostUSD(args.usage, configured)
        : calculateModelCostUSD(args.model, args.usage);
      if (cost <= 0) return;
      await queue.run(String(user.id), async () => {
        const current = (await args.req!.frogbot.findByID({
          collection: authCollection as never,
          id: user.id as never,
          depth: 0,
          overrideAccess: true,
          req: args.req,
        })) as PolicyDocument;
        await args.req!.frogbot.update({
          collection: authCollection as never,
          id: user.id as never,
          data: { spendThisPeriodUSD: (current.spendThisPeriodUSD ?? 0) + cost },
          overrideAccess: true,
          req: args.req,
        });
      });
    },
  };
}
