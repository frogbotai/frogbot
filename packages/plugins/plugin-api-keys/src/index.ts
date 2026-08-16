import { calculateCostUSD, calculateModelCostUSD, type ModelCost } from '@frogbotai/gateway';
import { BudgetExceededError, ModelNotAllowedError } from '@frogbotai/gateway/errors';
import {
  type CollectionConfig,
  type FrogbotRequest,
  getConfiguredModelIds,
  type Plugin,
} from 'frogbot';

import { createApiKeysCollection } from './collection.js';
import { createPolicyFields } from './fields.js';
import type { PolicyDocument } from './policy.js';
import { SerialQueue } from './policy.js';
import { createApiKeyStrategy } from './strategy.js';

export type { PolicyDocument } from './policy.js';
export type {
  MintApiKeyOptions,
  RevokeApiKeyOptions,
  RotateApiKeyOptions,
} from './server/services.js';
export { ApiKeyServiceError, mintApiKey, revokeApiKey, rotateApiKey } from './server/services.js';
export type { ApiKeyHeaderOptions, ApiKeyTokenOptions } from './server/token.js';
export {
  createApiKeyToken,
  extractApiKeyToken,
  getApiKeyPrefix,
  hashApiKeyToken,
} from './server/token.js';
export type { ApiKeyStrategy } from './strategy.js';
export { isApiKeyStrategy } from './strategy.js';

export type ApiKeysPluginOptions = {
  authCollection?: string;
  collectionSlug?: string;
  tokenPrefix?: string;
  headerNames?: string[];
  collection?: Partial<CollectionConfig>;
  canRevokeAnyKey?: (req: FrogbotRequest) => boolean | Promise<boolean>;
};

type PolicyContext = { policy?: PolicyDocument; usageFields?: { apiKey: string } };
type PricedCustomProvider = {
  type: 'openai-compatible';
  models: Array<{
    id: string;
    cost?: { input?: number; output?: number; cache_read?: number };
  }>;
};

function isPricedCustomProvider(entry: unknown): entry is PricedCustomProvider {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    'type' in entry &&
    entry.type === 'openai-compatible' &&
    'models' in entry &&
    Array.isArray(entry.models)
  );
}

export function apiKeysPlugin(options: ApiKeysPluginOptions = {}): Plugin {
  const queue = new SerialQueue();
  return (config) => {
    const authCollection = options.authCollection ?? 'users';
    const collectionSlug = options.collectionSlug ?? 'api-keys';
    const configuredCosts = new Map<string, ModelCost>();
    for (const [provider, entry] of Object.entries(config.ai?.providers ?? {})) {
      if (!isPricedCustomProvider(entry)) continue;
      for (const model of entry.models) {
        if (!model.cost) continue;
        configuredCosts.set(`${provider}/${model.id}`, {
          input: model.cost.input ?? 0,
          output: model.cost.output ?? 0,
          ...(model.cost.cache_read !== undefined && { cache_read: model.cost.cache_read }),
        });
      }
    }
    const auth = config.collections.find((collection) => collection.slug === authCollection);
    if (!auth || auth.auth === undefined || auth.auth === false) {
      throw new Error(
        `[plugin-api-keys] Auth collection '${authCollection}' must exist and have auth enabled.`,
      );
    }
    const reservedPolicyFields = new Set(['monthlyBudget', 'models', 'spendThisPeriodUSD']);
    const collision = auth.fields.find(
      (field) => 'name' in field && reservedPolicyFields.has(field.name),
    );
    if (collision && 'name' in collision) {
      throw new Error(`[plugin-api-keys] Auth field '${collision.name}' is reserved.`);
    }
    const existing = config.collections.find((collection) => collection.slug === collectionSlug);
    const usageLog = config.ai
      ? (config.collections.find((item) => item.usageLog === true) ?? {
          slug: 'usage-logs',
          usageLog: true,
          fields: [],
        })
      : undefined;
    const collection = createApiKeysCollection({
      authCollection,
      collectionSlug,
      tokenPrefix: options.tokenPrefix ?? 'fb',
      usageCollection: usageLog?.slug,
      canRevokeAnyKey: options.canRevokeAnyKey,
      collection: options.collection,
      existing,
    });
    const strategy = createApiKeyStrategy({
      authCollection,
      collectionSlug,
      headerNames: options.headerNames,
      tokenPrefix: options.tokenPrefix ?? 'fb',
    });
    const usageField = {
      name: 'apiKey',
      type: 'relationship' as const,
      relationTo: collectionSlug,
      index: true,
    };
    const collections = config.collections.map((item) => {
      let next = item;
      if (item.slug === collectionSlug) next = collection;
      if (item.slug === authCollection) {
        const authConfig = typeof next.auth === 'object' ? next.auth : {};
        next = {
          ...next,
          fields: [...next.fields, ...createPolicyFields(getConfiguredModelIds(config.ai))],
          auth: { ...authConfig, strategies: [...(authConfig.strategies ?? []), strategy] },
        };
      }
      if (item === usageLog) next = { ...next, fields: [...next.fields, usageField] };
      return next;
    });
    const resetTask: NonNullable<NonNullable<typeof config.jobs>['tasks']>[number] = {
      slug: 'frogbot-reset-ai-budgets',
      schedule: [{ cron: '0 0 1 * *', queue: 'frogbot-reset-ai-budgets' }],
      handler: async ({ req }) => {
        await req.payload.update({
          collection: authCollection,
          where: { id: { exists: true } },
          data: { spendThisPeriodUSD: 0 },
          overrideAccess: true,
          req,
        });
        return { output: {} };
      },
    };
    const jobs = { ...config.jobs, tasks: [...(config.jobs?.tasks ?? []), resetTask] };
    return {
      ...config,
      jobs: config.ai ? jobs : config.jobs,
      collections: [
        ...collections,
        ...(existing ? [] : [collection]),
        ...(usageLog && !config.collections.includes(usageLog)
          ? [{ ...usageLog, fields: [usageField] }]
          : []),
      ],
      ...(config.ai
        ? {
            ai: {
              ...config.ai,
              hooks: {
                ...config.ai.hooks,
                beforeOperation: [
                  ...(config.ai.hooks?.beforeOperation ?? []),
                  async (args) => {
                    if (!args.req?.user) return;
                    const policy = args.req.user as PolicyDocument;
                    if (
                      policy.monthlyBudget !== undefined &&
                      (policy.spendThisPeriodUSD ?? 0) >= policy.monthlyBudget
                    ) {
                      throw new BudgetExceededError();
                    }
                    Object.assign(args.context as PolicyContext, {
                      policy,
                      ...('apiKeyId' in policy && typeof policy.apiKeyId === 'string'
                        ? { usageFields: { apiKey: policy.apiKeyId } }
                        : {}),
                    });
                  },
                ],
                beforeUpstream: [
                  ...(config.ai.hooks?.beforeUpstream ?? []),
                  (args) => {
                    const models = (args.context as PolicyContext).policy?.models;
                    if (models?.length && !models.includes(args.model)) {
                      throw new ModelNotAllowedError(args.model);
                    }
                  },
                ],
                afterOperation: [
                  ...(config.ai.hooks?.afterOperation ?? []),
                  async (args) => {
                    const req = args.req;
                    if (!req?.user || args.error) return;
                    const userId = req.user.id;
                    const configuredCost = configuredCosts.get(args.model);
                    const cost = args.usage
                      ? configuredCost
                        ? calculateCostUSD(args.usage, configuredCost)
                        : calculateModelCostUSD(args.model, args.usage)
                      : 0;
                    if (cost <= 0) return;
                    await queue.run(String(userId), async () => {
                      const user = (await req.frogbot.findByID({
                        collection: authCollection as never,
                        id: userId as never,
                        depth: 0,
                        overrideAccess: true,
                        req,
                      })) as PolicyDocument;
                      await req.frogbot.update({
                        collection: authCollection as never,
                        id: userId as never,
                        data: { spendThisPeriodUSD: (user.spendThisPeriodUSD ?? 0) + cost },
                        overrideAccess: true,
                        req,
                      });
                    });
                  },
                ],
              },
            },
          }
        : {}),
    };
  };
}
